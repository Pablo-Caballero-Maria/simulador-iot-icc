/**
 * Plataforma en la nube (niveles 4 a 7).
 *
 * - Broker MQTT e ingesta idempotente: descarta duplicados por el par
 *   (estación, número de secuencia).
 * - Almacén de series temporales (aquí, en memoria) y traducción a FHIR.
 * - Motor de alertas: prioriza, avisa a enfermería y escala si nadie atiende
 *   (2 min → segunda persona; 5 min → centro coordinador).
 * - Motor de protocolo: ante congestión propone una dosis adicional de
 *   diurético que solo se ejecuta si un cardiólogo la firma (A3).
 * - Supervisión de presencia (función T4) y activación de la ambulancia.
 */
import { DAY, HOUR, MINUTE, dayIndex, hourOfDay, isBetweenHours, nextTimeOfDay, timeAt } from "../core/time";
import type { CellularLink } from "../network/cellular";
import { tlsTcpBytes } from "../network/transport";
import type { Patient } from "../physiology/patient";
import { observation, simTimeToIso } from "../protocols/fhir";
import { encodeCbor } from "../protocols/cbor";
import type { AlertRecord, DoseOrder, Metrics } from "../records";
import type { CongestionResult } from "../station/congestion";
import type { Publication, Station } from "../station/station";
import type { SimContext } from "../types";
import type { HourlyVector } from "../wearable/payloads";
import { type KeyPair, deriveKeyPair, signOrder } from "./signing";

/** Etiqueta de la clave del cardiólogo de guardia (la simulación usa una clave derivada fija). */
export const CLINICIAN_KEY_LABEL = "cardiologo-de-guardia";

export type AmbulancePhase = "idle" | "outbound" | "onsite" | "return";

export interface AmbulanceState {
  phase: AmbulancePhase;
  alertId?: string;
  departAt: number;
  arriveAt: number;
  leaveAt: number;
  backAt: number;
}

/** Plan de diurético: hasta tres órdenes diarias firmadas a la vez. */
interface DosePlan {
  orders: DoseOrder[];
  congestionAlert: AlertRecord;
  active: boolean;
}

export class Platform {
  readonly alerts: AlertRecord[] = [];
  readonly orders: DoseOrder[] = [];
  readonly vectors: HourlyVector[] = [];
  readonly weights: { t: number; kg: number; valid: boolean }[] = [];
  readonly congestion: (CongestionResult & { t: number })[] = [];
  readonly ambulance: AmbulanceState = { phase: "idle", departAt: 0, arriveAt: 0, leaveAt: 0, backAt: 0 };
  readonly clinicianKeys: KeyPair = deriveKeyPair(CLINICIAN_KEY_LABEL);
  fhirResources = 0;
  lastFhir: string | null = null;
  private readonly seen = new Set<string>();
  private orderSeq = 0;
  private lastVectorAt = 0;
  private lastStationMsgAt = 0;
  private presenceNotified = new Set<string>();
  private plans: DosePlan[] = [];
  /** Se llama con cada alerta que crea la propia plataforma (escenario base). */
  onAlertCreated: (alert: AlertRecord) => void = () => {};

  constructor(
    private readonly ctx: SimContext,
    private readonly cell: CellularLink,
    private readonly station: Station,
    private readonly patient: Patient,
    private readonly metrics: Metrics,
  ) {}

  start(): void {
    this.lastVectorAt = this.ctx.scheduler.now;
    this.lastStationMsgAt = this.ctx.scheduler.now;
    this.ctx.scheduler.every(600, 600, "platform-presence", (t) => this.checkPresence(t));
    this.ctx.scheduler.every(nextTimeOfDay(this.ctx.scheduler.now, 8.5), DAY, "platform-plan", (t) =>
      this.dailyPlan(t),
    );
  }

  // -------------------------------------------------------------------------
  // Ingesta
  // -------------------------------------------------------------------------

  onPublish(pub: Publication, t: number): void {
    const key = `${pub.stationId}:${pub.seq}`;
    if (this.seen.has(key)) {
      this.metrics.duplicatesDropped++;
      this.ctx.narrate(
        {
          level: "N4",
          title: "Duplicado descartado",
          text: "Se perdió una confirmación PUBACK y la estación reenvió el mensaje (QoS 1 garantiza «al menos una vez»). La ingesta lo reconoce por el par estación–secuencia y no lo guarda dos veces.",
          tone: "ok",
          focus: "cloud",
        },
        "duplicate",
      );
      return;
    }
    this.seen.add(key);
    this.lastStationMsgAt = t;
    if (pub.createdAt < t - 300) this.metrics.outOfOrder++;

    switch (pub.kind) {
      case "vector":
        if (pub.vector) {
          this.vectors.push(pub.vector);
          this.lastVectorAt = t;
          this.presenceNotified.delete("wearable-2h");
          this.presenceNotified.delete("wearable-6h");
          this.toFhir(pub.vector, t);
        }
        break;
      case "weight":
        if (pub.weight) this.weights.push(pub.weight);
        break;
      case "congestion":
        if (pub.congestion) this.congestion.push({ ...pub.congestion, t });
        break;
      case "alert":
        if (pub.alert) this.onAlert(pub.alert, t, pub.congestion);
        break;
      case "strip":
        if (pub.stripFor) pub.stripFor.stripAt = t;
        break;
      case "dispense":
        if (pub.dispenser?.kind === "taken" || pub.dispenser?.kind === "not-taken") {
          this.ctx.narrate(
            {
              level: "N7",
              title: pub.dispenser.kind === "taken" ? "Toma confirmada" : "Dosis no retirada",
              text:
                pub.dispenser.kind === "taken"
                  ? "El sensor del dispensador confirma que el paciente retiró la pastilla. El cardiólogo ve en la consola que la orden se entregó, se ejecutó y se tomó."
                  : "El paciente no ha retirado la dosis: enfermería llamará para comprobarlo.",
              tone: pub.dispenser.kind === "taken" ? "ok" : "warn",
              focus: "hospital",
            },
            pub.dispenser.orderId ? undefined : "basal-taken",
          );
        }
        break;
      case "raw":
        if (pub.rawWindows) this.analyzeRaw(pub, t);
        break;
      default:
        break;
    }
  }

  /** Traducción a FHIR en la frontera clínica (nivel 5). */
  private toFhir(v: HourlyVector, t: number): void {
    const obs = [
      observation("heartRate", v.hrMean, v.hourStart, "pac-7f3a", "wearable-0042"),
      observation("respRate", v.respRate, v.hourStart, "pac-7f3a", "wearable-0042"),
    ];
    this.fhirResources += obs.length;
    this.lastFhir = JSON.stringify(obs[0], null, 2);
    const bytes = new TextEncoder().encode(JSON.stringify(obs)).length;
    this.ctx.transmit({
      link: "hospital",
      from: "cloud",
      to: "hospital",
      kind: "console",
      label: "Observaciones FHIR a la historia clínica",
      bytes,
      payloadBytes: bytes,
      tStart: t + 0.5,
      tEnd: t + 1.2,
      details: { json: this.lastFhir, notes: ["HL7 FHIR R4 · códigos LOINC 8867-4 (FC) y 9279-1 (respiración)"] },
    });
  }

  // -------------------------------------------------------------------------
  // Alertas
  // -------------------------------------------------------------------------

  private onAlert(alert: AlertRecord, t: number, congestion?: CongestionResult): void {
    alert.brokerAt = t;
    const consoleAt = t + this.ctx.rng.logNormal(this.ctx.params.cloud.platformLatencyS, 1.5);
    this.ctx.scheduler.at(consoleAt, "console", (now) => this.showInConsole(alert, now, congestion));
  }

  private showInConsole(alert: AlertRecord, t: number, congestion?: CongestionResult): void {
    alert.consoleAt = t;
    this.alerts.push(alert);
    if (alert.alertClass === 1) this.metrics.consoleDelays.push(t - alert.detectedAt);
    this.ctx.transmit({
      link: "hospital",
      from: "cloud",
      to: "hospital",
      kind: "console",
      label: `Consola: ${alert.title}`,
      bytes: 420,
      payloadBytes: 420,
      tStart: t - 0.15,
      tEnd: t,
    });
    const delay = t - alert.detectedAt;
    this.ctx.narrate({
      level: "N6",
      title: `Alerta de clase ${alert.alertClass} en la consola`,
      text:
        alert.alertClass === 1
          ? `«${alert.title}» aparece en la consola ${delay.toFixed(1).replace(".", ",")} s después de confirmarse en el wearable (objetivo: ≤ 30 s). Enfermería debe atenderla; si nadie lo hace en 2 min se avisa a una segunda persona y en 5 min al centro coordinador.`
          : alert.alertClass === 2
            ? `«${alert.title}» entra en la lista de trabajo de enfermería, que debe revisarla en ≤ 4 h (de 8 a 22 h).`
            : `«${alert.title}»: tarea técnica para enfermería.`,
      tone: alert.alertClass === 1 ? "critical" : alert.alertClass === 2 ? "warn" : "info",
      focus: "hospital",
    });
    if (alert.alertClass === 1) this.scheduleCriticalHandling(alert, t);
    else this.scheduleRoutineHandling(alert, t);
    if (alert.code === "congestion" && congestion) this.proposeDiuretic(alert, congestion, t);
  }

  private scheduleCriticalHandling(alert: AlertRecord, t: number): void {
    const p = this.ctx.params.staff;
    const night = !isBetweenHours(t, 8, 22);
    // Escalado: a los 2 min, segunda persona; a los 5 min, centro coordinador.
    this.ctx.scheduler.at(t + 120, "escalate-2", (now) => {
      if (alert.status !== "open") return;
      alert.escalations.push({ t: now, to: night ? "Segundo cardiólogo de guardia" : "Segunda enfermera" });
      this.ctx.narrate({
        level: "N7",
        title: "Escalado: 2 minutos sin atender",
        text: "Nadie ha confirmado la alerta crítica: la plataforma avisa a una segunda persona.",
        tone: "critical",
        focus: "hospital",
      });
    });
    this.ctx.scheduler.at(t + 300, "escalate-5", (now) => {
      if (alert.status !== "open") return;
      alert.escalations.push({ t: now, to: "Centro coordinador (112)" });
      this.ctx.narrate({
        level: "N7",
        title: "Escalado al centro coordinador",
        text: "Cinco minutos sin respuesta: la alerta pasa al centro coordinador de emergencias, que activa la ambulancia.",
        tone: "critical",
        focus: "hospital",
      });
      this.acknowledge(alert.id, "Centro coordinador (112)", now);
    });
    if (p.mode === "auto") {
      const median = night ? p.nightAckMedianS : p.dayAckMedianS;
      const delay = this.ctx.rng.logNormal(median, 1.6);
      this.ctx.scheduler.at(t + delay, "ack", (now) =>
        this.acknowledge(alert.id, night ? "Cardiólogo de guardia" : "Enfermería de telemonitorización", now),
      );
    }
  }

  private scheduleRoutineHandling(alert: AlertRecord, t: number): void {
    if (this.ctx.params.staff.mode !== "auto") return;
    // Clase 2 en horario de 8 a 22 h (≤ 4 h); clase 3 a diario.
    let start = t;
    if (!isBetweenHours(t, 8, 22)) {
      const h = hourOfDay(t);
      start = h >= 22 ? timeAt(dayIndex(t) + 1, 8) : timeAt(dayIndex(t), 8);
    }
    const median = alert.alertClass === 2 ? 40 * MINUTE : 3 * HOUR;
    const at = start + Math.min(this.ctx.rng.logNormal(median, 1.8), alert.alertClass === 2 ? 3.8 * HOUR : 12 * HOUR);
    this.ctx.scheduler.at(at, "ack-routine", (now) =>
      this.acknowledge(alert.id, "Enfermería de telemonitorización", now),
    );
  }

  /** Atención de una alerta (por el personal simulado o por el usuario). */
  acknowledge(alertId: string, by: string, t: number): void {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (!alert || alert.status !== "open") return;
    alert.status = "acknowledged";
    alert.ackAt = t;
    alert.ackBy = by;
    if (alert.alertClass === 1) {
      if (alert.real === false) {
        alert.status = "dismissed";
        alert.outcome = "Falsa alarma: el paciente está bien (llamada telefónica)";
        this.ctx.narrate({
          level: "N7",
          title: "Falsa alarma descartada",
          text: `${by} llama al paciente y ve la tira: era un artefacto. No se activa la ambulancia.`,
          tone: "ok",
          focus: "hospital",
        });
        return;
      }
      this.dispatchAmbulance(alert, t);
    } else {
      alert.status = "resolved";
      alert.outcome =
        alert.code === "congestion"
          ? "Revisada: propuesta de diurético enviada al cardiólogo"
          : alert.code === "af" || alert.code === "afRapid"
            ? "Revisada: se adelanta la consulta y se valora anticoagulación"
            : "Revisada por enfermería";
    }
  }

  private dispatchAmbulance(alert: AlertRecord, t: number): void {
    if (this.ambulance.phase !== "idle") return;
    const travel = this.ctx.params.staff.ambulanceTravelMin * MINUTE * this.ctx.rng.uniform(0.9, 1.15);
    Object.assign(this.ambulance, {
      phase: "outbound" as const,
      alertId: alert.id,
      departAt: t + 60,
      arriveAt: t + 60 + travel,
      leaveAt: t + 60 + travel + 20 * MINUTE,
      backAt: t + 60 + 2 * travel + 20 * MINUTE,
    });
    alert.ambulance = { dispatchedAt: t };
    this.ctx.narrate({
      level: "N7",
      title: "Ambulancia activada",
      text: `Se confirma el evento y el centro coordinador envía una ambulancia con la ubicación, el resumen clínico y la última tira. La plataforma genera datos de emparejamiento de un solo uso para su pasarela móvil.`,
      tone: "critical",
      focus: "ambulance",
    });
    const s = this.ctx.scheduler;
    s.at(this.ambulance.arriveAt, "ambulance-arrive", (now) => {
      this.ambulance.phase = "onsite";
      if (alert.ambulance) {
        alert.ambulance.arrivedAt = now;
        alert.ambulance.pairedAt = now + 30;
      }
      this.patient.endRhythmEpisodes(now + 90);
      alert.status = "resolved";
      alert.outcome = "Atendido en el domicilio por el equipo de emergencias";
      this.ctx.narrate({
        level: "N7",
        title: "La ambulancia llega al domicilio",
        text: "La pasarela móvil se empareja con el wearable como segunda central (datos fuera de banda) y la monitorización continúa durante la atención y el traslado.",
        tone: "ok",
        focus: "ambulance",
      });
    });
    s.at(this.ambulance.leaveAt, "ambulance-leave", () => (this.ambulance.phase = "return"));
    s.at(this.ambulance.backAt, "ambulance-back", () => (this.ambulance.phase = "idle"));
  }

  // -------------------------------------------------------------------------
  // Protocolo de diurético (A3)
  // -------------------------------------------------------------------------

  private proposeDiuretic(alert: AlertRecord, c: CongestionResult, t: number): void {
    if (this.plans.some((p) => p.active)) return;
    const labs = this.ctx.params.staff.labsAvailable;
    const orders: DoseOrder[] = [0, 1, 2].map((k) => {
      const day = dayIndex(t) + k;
      return {
        orderId: `ORD-${day}-${++this.orderSeq}`,
        seq: this.orderSeq,
        patient: "pac-7f3a",
        drug: "Furosemida 40 mg (dosis adicional)",
        doseMg: 40,
        validFrom: k === 0 ? t : timeAt(day, 8),
        validUntil: timeAt(day + 1, 6),
        proposedAt: t,
        reason: `Índice de congestión ${c.index} (Δpeso ${c.deltaWeightKg.toFixed(1)} kg, Δimpedancia −${c.deltaImpedancePct.toFixed(1)} %)`,
        status: labs ? "propuesta" : "bloqueada",
        history: [
          {
            t,
            status: labs ? "propuesta" : "bloqueada",
            note: labs ? undefined : "sin potasio ni creatinina recientes",
          },
        ],
      };
    });
    this.orders.push(...orders);
    const plan: DosePlan = { orders, congestionAlert: alert, active: labs };
    this.plans.push(plan);
    this.ctx.narrate({
      level: "N6",
      title: labs ? "Propuesta de diurético (pendiente de firma)" : "Propuesta bloqueada",
      text: labs
        ? "El motor de protocolo propone una dosis adicional de furosemida al día durante 3 días. Es apoyo a la decisión: no se ejecuta nada hasta que el cardiólogo revise peso, impedancia y analítica y firme con su clave (nivel de autonomía A3)."
        : "Falta una analítica reciente (potasio y creatinina): el protocolo no permite proponer más diurético. Enfermería solicita la analítica.",
      tone: labs ? "warn" : "critical",
      focus: "hospital",
    });
    if (labs && this.ctx.params.staff.mode === "auto") {
      let start = t;
      if (!isBetweenHours(t, 8, 22)) start = hourOfDay(t) >= 22 ? timeAt(dayIndex(t) + 1, 8) : timeAt(dayIndex(t), 8);
      const at = start + this.ctx.rng.logNormal(this.ctx.params.staff.signMedianMin * MINUTE, 1.5);
      this.ctx.scheduler.at(at, "cardiologist-sign", (now) => this.signPlan(orders[0].orderId, now));
    }
  }

  /** El cardiólogo firma el plan (las tres órdenes) con su clave personal. */
  signPlan(orderId: string, t: number, by = "Cardiólogo de guardia"): void {
    const plan = this.plans.find((p) => p.orders.some((o) => o.orderId === orderId));
    if (!plan || plan.orders[0].status !== "propuesta") return;
    for (const o of plan.orders) {
      o.signedAt = t;
      o.signedBy = by;
      o.signature = signOrder(o, this.clinicianKeys.secretKey);
      o.status = "firmada";
      o.history.push({ t, status: "firmada", note: `ECDSA P-256 · ${by}` });
    }
    this.ctx.narrate({
      level: "N6",
      title: "Orden firmada por el cardiólogo",
      text: "La orden lleva identificador, número de secuencia, ventana de validez y la firma ECDSA del médico. Baja por la sesión MQTT que abrió la estación (tf/…/cmd/dosis); el dispensador solo la ejecutará si la firma es válida.",
      tone: "info",
      focus: "hospital",
    });
    this.sendOrder(plan.orders[0], t);
  }

  /** Rechazo de la propuesta por el cardiólogo. */
  rejectPlan(orderId: string, t: number): void {
    const plan = this.plans.find((p) => p.orders.some((o) => o.orderId === orderId));
    if (!plan) return;
    plan.active = false;
    for (const o of plan.orders) {
      if (o.status === "propuesta") {
        o.status = "caducada";
        o.history.push({ t, status: "caducada", note: "rechazada por el cardiólogo" });
      }
    }
  }

  /** Cada mañana se envía la orden del día si el plan sigue activo y no hay mejoría. */
  private dailyPlan(t: number): void {
    for (const plan of this.plans) {
      if (!plan.active) continue;
      const last = this.congestion.at(-1);
      const improved = last && last.index < this.ctx.params.cloud.congestionThreshold - 15;
      const next = plan.orders.find((o) => o.status === "firmada");
      if (!next) {
        plan.active = false;
        continue;
      }
      if (improved) {
        for (const o of plan.orders.filter((x) => x.status === "firmada")) {
          o.status = "caducada";
          o.history.push({ t, status: "caducada", note: "cancelada: el índice de congestión ha bajado" });
        }
        plan.active = false;
        this.ctx.narrate({
          level: "N6",
          title: "Plan de diurético terminado",
          text: "El índice de congestión ha vuelto por debajo del umbral: las dosis restantes se cancelan.",
          tone: "ok",
          focus: "hospital",
        });
        continue;
      }
      if (dayIndex(next.validFrom) <= dayIndex(t)) this.sendOrder(next, t);
    }
  }

  private sendOrder(order: DoseOrder, t: number): void {
    if (order.status !== "firmada") return;
    const payload = encodeCbor([
      order.orderId,
      order.seq,
      order.patient,
      order.doseMg,
      order.validFrom,
      order.validUntil,
      order.signature ?? "",
    ]).length;
    const wire = tlsTcpBytes(payload + 40).wire;
    const sent = this.cell.sendDown(t, wire);
    order.status = "enviada";
    order.history.push({ t, status: "enviada" });
    if (!sent) {
      // Sin red: la orden espera; si caduca, el dispensador la rechazaría igualmente.
      this.ctx.scheduler.after(600, "order-retry", (now) => {
        order.status = "firmada";
        this.sendOrder(order, now);
      });
      return;
    }
    this.ctx.transmit({
      link: this.cell.tech ?? "lte-m",
      from: "cloud",
      to: "station",
      kind: "order",
      label: `Orden firmada ${order.orderId}`,
      bytes: wire,
      payloadBytes: payload,
      tStart: sent.start,
      tEnd: sent.arrival,
      topic: `tf/${this.station.id}/cmd/dosis`,
      details: {
        notes: [
          `Firma: ${order.signature?.slice(0, 32)}…`,
          `Válida de ${simTimeToIso(order.validFrom)} a ${simTimeToIso(order.validUntil)}`,
        ],
      },
    });
    this.ctx.scheduler.at(sent.arrival, "order-rx", (now) =>
      this.station.receiveDownlink({ kind: "order", order }, now),
    );
  }

  /** Escenario de seguridad: un atacante inyecta una orden falsa o repite una antigua. */
  injectAttack(kind: "forged" | "replay", t: number): DoseOrder {
    const executed = this.orders.find((o) => o.status === "tomada" || o.status === "ejecutada");
    const order: DoseOrder =
      kind === "replay" && executed
        ? { ...structuredClone(executed), status: "enviada", history: [], forged: true }
        : {
            orderId: `ORD-FALSA-${Math.round(t)}`,
            seq: this.orderSeq + 100,
            patient: "pac-7f3a",
            drug: "Furosemida 40 mg",
            doseMg: 40,
            validFrom: t,
            validUntil: t + DAY,
            proposedAt: t,
            reason: "Orden inyectada por un atacante con control de la plataforma",
            signature: "ab".repeat(64),
            status: "enviada",
            history: [],
            forged: true,
          };
    order.history.push({
      t,
      status: "enviada",
      note: kind === "replay" ? "reenvío de una orden ya ejecutada" : "firma falsificada",
    });
    this.orders.push(order);
    const sent = this.cell.sendDown(t, 300);
    const arrival = sent?.arrival ?? t + 2;
    this.ctx.transmit({
      link: this.cell.tech ?? "lte-m",
      from: "cloud",
      to: "station",
      kind: "order",
      label: kind === "replay" ? "Orden repetida (ataque)" : "Orden falsificada (ataque)",
      bytes: 300,
      payloadBytes: 160,
      tStart: t,
      tEnd: arrival,
      note: "Ataque",
    });
    this.ctx.scheduler.at(arrival, "attack-rx", (now) => this.station.receiveDownlink({ kind: "order", order }, now));
    return order;
  }

  // -------------------------------------------------------------------------
  // Escenario base: análisis en la nube del flujo en bruto
  // -------------------------------------------------------------------------

  private analyzeRaw(pub: Publication, t: number): void {
    for (const w of pub.rawWindows ?? []) {
      for (const ev of w.events) {
        const alert: AlertRecord = {
          id: `N${Math.round(ev.t)}`,
          code: ev.code,
          alertClass: ev.alertClass,
          title: ev.title,
          detectedAt: ev.t,
          hr: ev.hr,
          confidence: ev.confidence,
          real: ev.code === "vt" ? w.rhythm === "vt" : null,
          origin: "cloud",
          escalations: [],
          status: "open",
          brokerAt: t,
          publishedAt: t,
        };
        this.ctx.narrate({
          level: "N6",
          title: "La nube detecta el evento en el flujo en bruto",
          text: `En el escenario base no hay decisión en el borde: la alerta solo existe cuando las señales llegan a la nube (${(t - ev.t).toFixed(0)} s después) y el aviso al paciente tiene que bajar por la red. Sin red, no hay detección.`,
          tone: "warn",
          focus: "cloud",
        });
        this.onAlertCreated(alert);
        this.onAlert(alert, t);
        if (alert.alertClass === 1) {
          const sent = this.cell.sendDown(t + 1, 200);
          if (sent) {
            this.ctx.scheduler.at(sent.arrival, "raw-alarm", (now) =>
              this.station.receiveDownlink({ kind: "alarm", alert }, now),
            );
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Supervisión de presencia (T4)
  // -------------------------------------------------------------------------

  private checkPresence(t: number): void {
    if (this.ctx.params.wearable.mode === "edge") {
      const silent = t - this.lastVectorAt;
      if (silent > 2 * HOUR + 600 && !this.presenceNotified.has("wearable-2h")) {
        this.presenceNotified.add("wearable-2h");
        this.ctx.narrate({
          level: "T",
          title: "Wearable sin vector horario (2 h)",
          text: "El vector horario es también el mensaje de presencia del wearable. Tras 2 h sin recibirlo la plataforma envía un recordatorio al paciente; a las 6 h, una tarea a enfermería.",
          tone: "warn",
          focus: "cloud",
        });
      }
    }
    if (t - this.lastStationMsgAt > HOUR + 600 && !this.presenceNotified.has("station-1h")) {
      this.presenceNotified.add("station-1h");
      this.ctx.narrate({
        level: "T",
        title: "Estación callada más de 1 h",
        text: "El broker publicó el mensaje de última voluntad de la estación y no ha vuelto a saber de ella: se genera una alerta técnica.",
        tone: "warn",
        focus: "cloud",
      });
    } else if (t - this.lastStationMsgAt < HOUR) {
      this.presenceNotified.delete("station-1h");
    }
  }
}
