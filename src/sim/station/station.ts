/**
 * Estación domiciliaria: pasarela Fog del domicilio (niveles 2 y 3).
 *
 * - Recibe por BLE los mensajes del wearable y de la báscula.
 * - Confirma los eventos con la tira de ECG (ruta de señal completa).
 * - Calcula cada mañana el índice de congestión.
 * - Traduce GATT → SenML/CBOR y publica por MQTT 5 con QoS 1 sobre TLS,
 *   escalonando el envío horario según su identificador.
 * - Sin red guarda los mensajes (almacenamiento diferido) y al reconectar
 *   espera un tiempo aleatorio y los envía por prioridad.
 * - Entrega al dispensador las órdenes firmadas que bajan de la plataforma.
 */
import { DAY, HOUR, MINUTE, START_OFFSET, dayIndex, hourOfDay, nextTimeOfDay } from "../core/time";
import { mean } from "../core/stats";
import type { BleLink } from "../network/ble";
import type { CellularLink } from "../network/cellular";
import {
  keepAliveCost,
  publishQos1Cost,
  sessionSetupCost,
  sessionTeardownCost,
  tlsTcpBytes,
} from "../network/transport";
import { ECG_FS } from "../physiology/ecg";
import type { Patient } from "../physiology/patient";
import { SPOTS, distance } from "../physiology/home";
import { cborDiagnostic, hexDump } from "../protocols/cbor";
import { encodePublish } from "../protocols/mqtt";
import { encodeSenmlCbor, senmlToCborValue, senmlToJson, type SenmlRecord } from "../protocols/senml";
import type { AlertRecord, DoseOrder, Metrics } from "../records";
import type { MessageKind, SimContext } from "../types";
import { RhythmClassifier } from "../wearable/classifier";
import { PanTompkins, type DetectedBeat } from "../wearable/dsp";
import { computeFeatures, signalQualityIndex } from "../wearable/features";
import { STRIP_HEADER_BYTES, decodeVector, type HourlyVector } from "../wearable/payloads";
import type { BleMessage, BleReceiver, Wearable, WindowResult } from "../wearable/wearable";
import { type CongestionResult, type DayRecord, congestionIndex } from "./congestion";
import type { Dispenser, DispenserEvent } from "./dispenser";

/** Época Unix del inicio de la simulación (lunes 23/11/2026, 06:00 en Madrid). */
export const SIM_EPOCH = Date.UTC(2026, 10, 23, 5, 0, 0) / 1000;

export interface Publication {
  stationId: string;
  topic: string;
  kind: MessageKind;
  seq: number;
  dup: boolean;
  payloadBytes: number;
  createdAt: number;
  alert?: AlertRecord;
  vector?: HourlyVector;
  weight?: { kg: number; valid: boolean; t: number };
  congestion?: CongestionResult;
  dispenser?: DispenserEvent;
  rawWindows?: WindowResult[];
  telemetry?: Record<string, number | string>;
  stripFor?: AlertRecord;
}

export type Downlink = { kind: "order"; order: DoseOrder } | { kind: "alarm"; alert: AlertRecord };

/** Receptor de las publicaciones (el broker de la plataforma). */
export interface BrokerInbox {
  onPublish(pub: Publication, t: number): void;
}

interface Pending {
  topic: string;
  kind: MessageKind;
  pack?: SenmlRecord[];
  binary?: number;
  priority: 0 | 1 | 2;
  retain?: boolean;
  createdAt: number;
  pub: Omit<Publication, "seq" | "dup" | "payloadBytes" | "topic" | "kind" | "stationId" | "createdAt">;
  label: string;
}

export class Station implements BleReceiver {
  readonly history: DayRecord[] = [];
  readonly congestionResults: CongestionResult[] = [];
  private readonly queue: Pending[] = [];
  private readonly hourly: Pending[] = [];
  private sessionUp = false;
  private reconnecting = false;
  private readonly aliases = new Map<string, number>();
  private packetId = 1;
  private pubSeq = 0;
  private lastUplinkAt = 0;
  private broker: BrokerInbox | null = null;
  private readonly classifier = new RhythmClassifier();
  private rawBytes = 0;
  private rawWindows: WindowResult[] = [];
  private nightZ: { day: number; values: number[]; resp: number[] } | null = null;
  private dayAct: { day: number; values: number[] } | null = null;
  private lastValidWeight: number | null = null;
  private readonly stripWaiters = new Map<AlertRecord, (verdict: AlertRecord["stationVerdict"]) => void>();
  /** Desfase del envío horario según el identificador (2.5). */
  readonly slotOffset: number;
  lastWeight: { kg: number; valid: boolean; t: number } | null = null;
  /** Se llama con cada alerta que crea la propia estación (congestión). */
  onAlertCreated: (alert: AlertRecord) => void = () => {};

  constructor(
    private readonly ctx: SimContext,
    private readonly cell: CellularLink,
    private readonly ble: BleLink,
    private readonly wearable: Wearable,
    private readonly dispenser: Dispenser,
    private readonly patient: Patient,
    private readonly metrics: Metrics,
  ) {
    let h = 0;
    for (const c of ctx.params.station.stationId) h = (h * 31 + c.charCodeAt(0)) % 3600;
    this.slotOffset = 60 + (h % 3000);
  }

  get id(): string {
    return this.ctx.params.station.stationId;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  get connected(): boolean {
    return this.sessionUp;
  }

  attachBroker(broker: BrokerInbox): void {
    this.broker = broker;
  }

  start(): void {
    const s = this.ctx.scheduler;
    this.seedHistory();
    this.openSession(s.now);
    const nextSlot = Math.ceil((s.now + START_OFFSET) / HOUR) * HOUR - START_OFFSET + this.slotOffset;
    s.every(nextSlot, HOUR, "station-hourly", (t) => this.hourlyPublish(t));
    s.every(nextTimeOfDay(s.now, 8), DAY, "station-congestion", (t) => this.dailyCongestion(t));
    s.every(nextTimeOfDay(s.now, 3) + this.slotOffset / 10, DAY, "station-session-refresh", (t) =>
      this.refreshSession(t),
    );
    s.every(60, 60, "station-keepalive", (t) => this.keepAlive(t));
    s.every(10, 10, "station-wan", (t) => this.checkWan(t));
    s.every(nextSlot - 30, HOUR, "station-time-sync", (t) => this.timeSync(t));
    if (this.ctx.params.wearable.mode === "raw") {
      s.every(this.ctx.params.station.rawUploadPeriodS, this.ctx.params.station.rawUploadPeriodS, "station-raw", (t) =>
        this.flushRaw(t),
      );
    }
  }

  /** Datos de las dos semanas anteriores (el kit se entregó al alta), para la línea basal. */
  private seedHistory(): void {
    const rng = this.ctx.rng.fork("history");
    const dry = this.ctx.params.patient.dryWeightKg;
    for (let d = -15; d < 0; d++) {
      const patchExcluded = d % 4 === -1;
      this.history.push({
        day: d,
        weight: dry + rng.normal(0, 0.25),
        nightImpedance: 50 + rng.normal(0, 0.15),
        nightResp: 13 + rng.normal(0, 0.3),
        dayActivity: 0.19 + rng.normal(0, 0.005),
        patchExcluded,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Entrada por BLE
  // -------------------------------------------------------------------------

  onBleMessage(msg: BleMessage, t: number): void {
    switch (msg.kind) {
      case "vector":
        return this.onVector(msg.bytes, t);
      case "alert":
        return this.onAlert(msg.alert, t);
      case "strip":
        return this.onStrip(msg.bytes, msg.startTime, msg.code, t, msg.alert);
      case "raw":
        this.rawBytes += msg.size;
        this.rawWindows.push(...msg.windows);
        return;
    }
  }

  private onVector(bytes: Uint8Array, t: number): void {
    const v = decodeVector(bytes); // comprueba el CRC
    this.accumulateDaily(v);
    const pack = this.vectorPack(v);
    this.ctx.narrate(
      {
        level: "N5",
        title: "Traducción a SenML-CBOR",
        text: `La estación decodifica los 64 bytes (comprueba el CRC) y los convierte en ${pack.length} medidas SenML con nombre, unidad e instante, codificadas en CBOR (${encodeSenmlCbor(pack).length} B). Las guarda y las publica en su minuto del envío horario (${this.slotLabel}), distinto para cada estación para no coincidir todas a la vez.`,
        tone: "info",
        focus: "station",
      },
      "vector-senml",
    );
    this.hourly.push({
      topic: "obs/vector",
      kind: "vector",
      pack,
      priority: 1,
      createdAt: t,
      pub: { vector: v },
      label: "Vector horario en SenML-CBOR",
    });
  }

  /** Acumula las medidas nocturnas y diurnas para el índice de congestión. */
  private accumulateDaily(v: HourlyVector): void {
    const h = hourOfDay(v.hourStart);
    const day = dayIndex(v.hourStart);
    if (h < 6 && v.supineImpedanceCount > 0) {
      if (!this.nightZ || this.nightZ.day !== day) this.nightZ = { day, values: [], resp: [] };
      this.nightZ.values.push(v.impedanceMean);
      this.nightZ.resp.push(v.respRate);
    }
    if (h >= 8 && h < 22) {
      if (!this.dayAct || this.dayAct.day !== day) this.dayAct = { day, values: [] };
      this.dayAct.values.push(v.activity);
    }
  }

  private vectorPack(v: HourlyVector): SenmlRecord[] {
    const r1 = (x: number) => Math.round(x * 10) / 10;
    const r2 = (x: number) => Math.round(x * 100) / 100;
    return [
      { bn: `urn:dev:tf:${this.id}:w:`, bt: SIM_EPOCH + v.hourStart, n: "hr", u: "beat/min", v: r1(v.hrMean) },
      { n: "hr_min", u: "beat/min", v: Math.round(v.hrMin) },
      { n: "hr_max", u: "beat/min", v: Math.round(v.hrMax) },
      { n: "rmssd", u: "s", v: r2(v.rmssdMs / 1000) },
      { n: "sdnn", u: "s", v: r2(v.sdnnMs / 1000) },
      { n: "rr", u: "/min", v: r1(v.respRate) },
      { n: "z", u: "Ohm", v: r2(v.impedanceMean) },
      { n: "z_min", u: "Ohm", v: r2(v.impedanceMin) },
      { n: "act", u: "/", v: r2(v.activity) },
      { n: "post", v: v.posture },
      { n: "sqi", u: "/", v: r2(v.sqiMean) },
      { n: "temp", u: "Cel", v: r1(v.temperature) },
      { n: "bat", u: "%EL", v: Math.round(v.batteryPct) },
      { n: "w_af", v: v.classWindows.af },
      { n: "w_vt", v: v.classWindows.vt },
      { n: "w_ect", v: v.classWindows.ectopy },
      { n: "w_noise", v: v.classWindows.noise },
      { n: "seq", v: v.seq },
    ];
  }

  private onAlert(alert: AlertRecord, t: number): void {
    alert.stationAt = t;
    this.ctx.narrate({
      level: "N3",
      title: "La estación recibe la alerta",
      text:
        alert.alertClass === 1
          ? `Llega por BLE ${(t - alert.detectedAt).toFixed(1).replace(".", ",")} s después de la detección. Al ser crítica la publica enseguida en tf/${this.id}/evt/alerta (MQTT con QoS 1 sobre TLS, por ${this.cell.tech?.toUpperCase() ?? "la red móvil"}); la tira de 30 s solo servirá para anotar su confianza.`
          : alert.alertClass === 2
            ? "No es crítica: la estación espera a la tira de 30 s y la vuelve a analizar con el detector de QRS y la red. Solo la envía si confirma el ritmo; así filtra falsas alarmas."
            : "Aviso técnico: se publica para que enfermería lo revise.",
      tone: alert.alertClass === 1 ? "critical" : "info",
      focus: "station",
    });
    if (alert.alertClass === 1) {
      // Críticas: se publican ya; la confirmación con la tira solo anota la confianza.
      alert.stationVerdict = "confirmada";
      this.ctx.scheduler.after(0.15, "station-alert", (now) => this.publishAlert(alert, now));
      return;
    }
    if (alert.alertClass === 3) {
      this.ctx.scheduler.after(0.1, "station-alert", (now) => this.publishAlert(alert, now));
      return;
    }
    // Clase 2: se espera a la tira para confirmar con el análisis de 30 s.
    this.stripWaiters.set(alert, (verdict) => {
      alert.stationVerdict = verdict;
      if (verdict === "no confirmada" && alert.code !== "symptom") {
        alert.status = "dismissed";
        alert.outcome = "Descartada por la estación: la tira no confirma el ritmo";
        this.ctx.narrate(
          {
            level: "N3",
            title: "La estación filtra una falsa alarma",
            text: `La tira de 30 s no confirma «${alert.title}». La alerta no se envía a enfermería (se registra en el vector), lo que evita trabajo inútil.`,
            tone: "ok",
            focus: "station",
          },
          "station-filter",
        );
        return;
      }
      this.publishAlert(alert, this.ctx.scheduler.now);
    });
  }

  /**
   * Confirmación en la estación: analiza la tira completa con el detector de
   * QRS y la misma red, ventana a ventana, y vota.
   */
  private onStrip(bytes: Uint8Array, startTime: number, code: string, t: number, alert?: AlertRecord): void {
    const n = (bytes.length - STRIP_HEADER_BYTES) / 2;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const lsb = view.getFloat32(10, true);
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) samples[i] = view.getInt16(STRIP_HEADER_BYTES + 2 * i, true) * lsb;
    const detector = new PanTompkins();
    const cond = new Float32Array(n);
    const beats: DetectedBeat[] = detector.processBlock(startTime, samples, cond);
    // Se ignoran los 3 primeros segundos (aprendizaje del detector) y se clasifica en ventanas de 8 s.
    const votes: Record<string, number> = {};
    let prev: DetectedBeat | null = null;
    for (let w0 = startTime + 3; w0 + 8 <= startTime + n / ECG_FS; w0 += 8) {
      const inWin = beats.filter((b) => b.t >= w0 && b.t < w0 + 8);
      const i0 = Math.round((w0 - startTime) * ECG_FS);
      const sqi = signalQualityIndex(cond.subarray(i0, i0 + 8 * ECG_FS), w0, ECG_FS, inWin, false);
      const f = computeFeatures(inWin, prev, sqi, w0, w0 + 8);
      prev = inWin.at(-1) ?? prev;
      const cls = this.classifier.predict(f.values).cls;
      votes[cls] = (votes[cls] ?? 0) + 1;
    }
    const total = Object.values(votes).reduce((a, b) => a + b, 0);
    const expected = alert ? ({ af: "af", afRapid: "af", vt: "vt" } as Record<string, string>)[alert.code] : undefined;
    let verdict: AlertRecord["stationVerdict"] = "confirmada";
    if (expected) {
      const share = (votes[expected] ?? 0) / Math.max(total, 1);
      verdict = share >= 0.5 ? "confirmada" : share > 0 ? "dudosa" : "no confirmada";
    }
    if (alert) {
      const waiter = this.stripWaiters.get(alert);
      this.stripWaiters.delete(alert);
      // Proceso en la CPU de la estación: unos cientos de milisegundos.
      this.ctx.scheduler.after(0.4, "station-confirm", (now) => {
        alert.confirmedAt = now;
        if (alert.alertClass === 1) alert.stationVerdict = verdict === "no confirmada" ? "dudosa" : verdict;
        waiter?.(verdict);
      });
    }
    this.enqueue(
      {
        topic: "evt/tira",
        kind: "strip",
        pack: [
          { bn: `urn:dev:tf:${this.id}:w:`, bt: SIM_EPOCH + startTime, n: "ecg", u: "V", vd: bytes },
          { n: "evt", vs: code },
        ],
        priority: 2,
        createdAt: t,
        pub: { stripFor: alert },
        label: "Tira de ECG de 30 s",
      },
      t + 0.5,
    );
  }

  // -------------------------------------------------------------------------
  // Báscula, dispensador e índice de congestión
  // -------------------------------------------------------------------------

  /** Pesaje recibido por BLE (perfil Weight Scale). */
  onWeight(kg: number, t: number): void {
    // Solo es válido si el wearable del paciente está cerca de la báscula (≈ 2 m).
    const near = distance(this.patient.position(), SPOTS.scale) <= 2;
    let valid = near;
    let note = near ? "" : "el wearable del paciente no está junto a la báscula";
    if (valid && this.lastValidWeight !== null && Math.abs(kg - this.lastValidWeight) > 2) {
      valid = false;
      note = "cambio de más de 2 kg en un día: se pide repetir el pesaje";
    }
    this.metrics.weighings++;
    if (!valid) this.metrics.weighingsRejected++;
    if (valid) {
      this.lastValidWeight = kg;
      const day = dayIndex(t);
      this.dayRecord(day).weight = kg;
    }
    this.lastWeight = { kg, valid, t };
    this.ctx.narrate(
      valid
        ? {
            level: "N3",
            title: `Pesaje: ${kg.toFixed(1)} kg`,
            text: "La báscula envía el peso por BLE (perfil Weight Scale). La estación lo valida porque el wearable está a menos de 2 m y lo guarda para el índice de congestión.",
            tone: "info",
            focus: "scale",
          }
        : {
            level: "N3",
            title: `Pesaje descartado (${kg.toFixed(1)} kg)`,
            text: `La estación no lo asigna al paciente: ${note}. Así no se mezcla el peso de otra persona.`,
            tone: "warn",
            focus: "scale",
          },
      valid ? "weight-ok" : undefined,
    );
    this.hourly.push({
      topic: "obs/peso",
      kind: "weight",
      pack: [
        { bn: `urn:dev:tf:${this.id}:b:`, bt: SIM_EPOCH + t, n: "weight", u: "kg", v: Math.round(kg * 10) / 10 },
        { n: "valid", vb: valid },
      ],
      priority: 1,
      createdAt: t,
      pub: { weight: { kg, valid, t } },
      label: "Peso en SenML-CBOR",
    });
  }

  onDispenserEvent(ev: DispenserEvent): void {
    this.enqueue(
      {
        topic: "disp/evento",
        kind: "dispense",
        pack: [
          { bn: `urn:dev:tf:${this.id}:d:`, bt: SIM_EPOCH + ev.t, n: "evt", vs: ev.kind },
          ...(ev.orderId ? [{ n: "order", vs: ev.orderId }] : []),
          ...(ev.doseMg ? [{ n: "dose", u: "mg", v: ev.doseMg }] : []),
          ...(ev.reason ? [{ n: "reason", vs: ev.reason }] : []),
        ],
        priority: 1,
        createdAt: ev.t,
        pub: { dispenser: ev },
        label: "Evento del dispensador",
      },
      ev.t,
    );
  }

  private dayRecord(day: number): DayRecord {
    let r = this.history.find((h) => h.day === day);
    if (!r) {
      r = { day };
      this.history.push(r);
      this.history.sort((a, b) => a.day - b.day);
    }
    return r;
  }

  private dailyCongestion(t: number): void {
    const day = dayIndex(t);
    const rec = this.dayRecord(day);
    if (this.nightZ?.day === day && this.nightZ.values.length > 0) {
      rec.nightImpedance = mean(this.nightZ.values);
      rec.nightResp = mean(this.nightZ.resp);
    }
    // El wearable detecta el cambio de parche (electrodos desconectados y vueltos a conectar).
    const night = t - 5 * HOUR;
    const sinceNight = night - this.patient.lastPatchChange(night);
    rec.patchExcluded = sinceNight < 2 * DAY;
    rec.patchRecent = sinceNight < DAY;
    if (this.dayAct && this.dayAct.day === day - 1) this.dayRecord(day - 1).dayActivity = mean(this.dayAct.values);
    const res = congestionIndex(this.history, day);
    this.congestionResults.push(res);
    const threshold = this.ctx.params.cloud.congestionThreshold;
    this.enqueue(
      {
        topic: "obs/congestion",
        kind: "congestion",
        pack: [
          { bn: `urn:dev:tf:${this.id}:`, bt: SIM_EPOCH + t, n: "ci", v: res.index },
          { n: "d_w", u: "kg", v: Math.round(res.deltaWeightKg * 100) / 100 },
          { n: "d_z", u: "%", v: Math.round(res.deltaImpedancePct * 10) / 10 },
          { n: "d_rr", u: "/min", v: Math.round(res.deltaRespRpm * 10) / 10 },
          { n: "d_act", u: "%", v: Math.round(res.deltaActivityPct) },
        ],
        priority: 1,
        createdAt: t,
        pub: { congestion: res },
        label: "Índice de congestión",
      },
      t,
    );
    this.ctx.narrate(
      {
        level: "N3",
        title: `Índice de congestión: ${res.index}`,
        text: `Peso ${fmtSigned(res.deltaWeightKg, 1)} kg, impedancia nocturna ${fmtSigned(-res.deltaImpedancePct, 1)} %, respiración ${fmtSigned(res.deltaRespRpm, 1)} rpm y actividad ${fmtSigned(-res.deltaActivityPct, 0)} % frente a la línea basal del paciente. ${res.index >= threshold ? "Supera el umbral: se genera una alerta de clase 2." : "Por debajo del umbral."}`,
        tone: res.index >= threshold ? "warn" : "info",
        focus: "station",
      },
      res.index >= threshold ? undefined : "congestion-ok",
    );
    if (res.index >= threshold) {
      const alert: AlertRecord = {
        id: `C${day}`,
        code: "congestion",
        alertClass: 2,
        title: `Riesgo de congestión (índice ${res.index})`,
        detectedAt: t,
        hr: 0,
        confidence: Math.min(1, res.index / 100),
        real: this.patient.congestionAt(t) >= 0.25,
        origin: "station",
        escalations: [],
        status: "open",
        stationAt: t,
        stationVerdict: "confirmada",
      };
      this.onAlertCreated(alert);
      this.publishAlert(alert, t, res);
    }
  }

  // -------------------------------------------------------------------------
  // Publicación MQTT
  // -------------------------------------------------------------------------

  private publishAlert(alert: AlertRecord, t: number, congestion?: CongestionResult): void {
    this.enqueue(
      {
        topic: "evt/alerta",
        kind: "alert",
        pack: [
          { bn: `urn:dev:tf:${this.id}:`, bt: SIM_EPOCH + alert.detectedAt, n: "alert", vs: String(alert.code) },
          { n: "class", v: alert.alertClass },
          { n: "hr", u: "beat/min", v: Math.round(alert.hr) },
          { n: "conf", u: "/", v: Math.round(alert.confidence * 100) / 100 },
          { n: "verdict", vs: alert.stationVerdict ?? "" },
        ],
        priority: 0,
        createdAt: t,
        pub: { alert, congestion },
        label: `Alerta: ${alert.title}`,
      },
      t,
    );
    if (alert.alertClass === 1 && this.ctx.params.station.smsFallback) {
      this.ctx.scheduler.after(30, "station-sms-check", (now) => this.smsFallback(alert, now));
    }
  }

  private smsFallback(alert: AlertRecord, t: number): void {
    if (alert.brokerAt !== undefined || alert.smsAt !== undefined) return;
    if (!this.cell.hasRadioCoverage) return;
    alert.smsAt = t + 5;
    this.metrics.smsSent++;
    this.ctx.transmit({
      link: "sms",
      from: "station",
      to: "hospital",
      kind: "sms",
      label: "SMS de respaldo al centro coordinador",
      bytes: 140,
      payloadBytes: 140,
      tStart: t,
      tEnd: t + 5,
      details: {
        notes: [`«TF ${this.id}: alerta crítica ${alert.code} ${Math.round(alert.hr)} lpm. Llamar al domicilio.»`],
      },
    });
    this.ctx.narrate({
      level: "N2",
      title: "SMS de respaldo",
      text: "La plataforma no ha confirmado la alerta crítica en 30 s, pero hay cobertura: la estación envía un SMS sin datos identificables al centro coordinador.",
      tone: "warn",
      focus: "station",
    });
  }

  private enqueue(item: Pending, t: number): void {
    if (!this.sessionUp || !this.cell.available) {
      this.queue.push(item);
      this.metrics.storedAndForwarded++;
      return;
    }
    this.sendPublish(item, t);
  }

  private hourlyPublish(t: number): void {
    // Telemetría propia de la estación (mensaje retenido de estado).
    this.hourly.push({
      topic: "estado",
      kind: "telemetry",
      pack: [
        { bn: `urn:dev:tf:${this.id}:`, bt: SIM_EPOCH + t, n: "rsrp", u: "dBm", v: this.ctx.params.cellular.rsrpDbm },
        { n: "rat", vs: this.cell.tech ?? "sin servicio" },
        { n: "queue", v: this.queue.length },
        { n: "ble_rssi", u: "dBm", v: Math.round(this.ble.rssi) },
        { n: "w_buf", v: this.wearable.bufferedMessages },
        { n: "pills", v: this.dispenser.pillsLeft },
      ],
      priority: 2,
      retain: true,
      createdAt: t,
      pub: {},
      label: "Estado de la estación (retenido)",
    });
    const items = this.hourly.splice(0);
    for (const item of items) this.enqueue(item, t);
  }

  private flushRaw(t: number): void {
    if (this.rawBytes <= 0) return;
    const bytes = Math.round(this.rawBytes);
    const windows = this.rawWindows;
    this.rawBytes = 0;
    this.rawWindows = [];
    this.enqueue(
      {
        topic: "raw/senales",
        kind: "raw",
        binary: bytes,
        priority: 1,
        createdAt: t,
        pub: { rawWindows: windows },
        label: `Señales en bruto (${bytes} B)`,
      },
      t,
    );
  }

  private sendPublish(item: Pending, t: number, dupOf?: { seq: number; packetId: number }): void {
    const payload = item.pack ? encodeSenmlCbor(item.pack) : new Uint8Array(item.binary ?? 0);
    const topic = `tf/${this.id}/${item.topic}`;
    const useAlias = this.ctx.params.station.topicAlias;
    let alias: number | undefined;
    let established = false;
    if (useAlias) {
      alias = this.aliases.get(topic);
      established = alias !== undefined;
      if (alias === undefined) {
        alias = this.aliases.size + 1;
        this.aliases.set(topic, alias);
      }
    }
    const packetId = dupOf?.packetId ?? (this.packetId = (this.packetId % 65535) + 1);
    const seq = dupOf?.seq ?? ++this.pubSeq;
    const packet = encodePublish({
      topic,
      payload,
      qos: 1,
      retain: item.retain,
      dup: !!dupOf,
      packetId,
      topicAlias: alias,
      aliasEstablished: established,
    });
    const cost = publishQos1Cost(packet.bytes.length);
    const sent = this.cell.sendUp(t, cost.up);
    if (!sent) {
      this.queue.push(item);
      return;
    }
    this.cell.account(0, cost.down);
    this.lastUplinkAt = t;
    if (!dupOf) this.metrics.addWanPayload(item.kind, payload.length);
    const link = this.cell.tech ?? "lte-m";
    const internetDelay = 0.03;
    this.ctx.transmit({
      link,
      from: "station",
      to: "cloud",
      kind: item.kind,
      label: item.label,
      bytes: cost.up + cost.down,
      payloadBytes: payload.length,
      tStart: sent.start,
      tEnd: sent.arrival + internetDelay,
      topic,
      note: dupOf ? "Reenvío (DUP) por PUBACK perdido" : undefined,
      details: item.pack
        ? {
            hex: hexDump(payload, 48),
            diagnostic: cborDiagnostic(senmlToCborValue(item.pack)),
            json: senmlToJson(item.pack),
            parts: [
              ...packet.parts,
              {
                label: "TLS 1.3 (cabecera y etiqueta)",
                bytes:
                  tlsTcpBytes(packet.bytes.length).wire -
                  packet.bytes.length -
                  52 * tlsTcpBytes(packet.bytes.length).segments,
              },
              { label: "TCP/IP", bytes: 52 * tlsTcpBytes(packet.bytes.length).segments },
              { label: "Confirmaciones (PUBACK y ACK)", bytes: cost.down + 52 },
            ],
          }
        : { parts: packet.parts },
    });
    const pub: Publication = {
      ...item.pub,
      stationId: this.id,
      topic,
      kind: item.kind,
      seq,
      dup: !!dupOf,
      payloadBytes: payload.length,
      createdAt: item.createdAt,
    };
    if (item.pub.alert && !dupOf) item.pub.alert.publishedAt ??= sent.start;
    this.ctx.scheduler.at(sent.arrival + internetDelay, "broker-rx", (now) => this.broker?.onPublish(pub, now));
    // QoS 1: si se pierde el PUBACK, la estación reenvía el mensaje con DUP.
    if (!dupOf && this.ctx.rng.chance(this.ctx.params.cellular.pubackLoss)) {
      this.ctx.scheduler.at(sent.arrival + 20, "station-retransmit", (now) => {
        if (this.cell.available && this.sessionUp) this.sendPublish(item, now, { seq, packetId });
      });
    }
  }

  // -------------------------------------------------------------------------
  // Sesión, keepalive y cortes
  // -------------------------------------------------------------------------

  private openSession(t: number): void {
    if (!this.cell.available) return;
    const cost = sessionSetupCost(this.id);
    this.cell.account(cost.up, cost.down);
    this.aliases.clear();
    this.sessionUp = true;
    this.lastUplinkAt = t;
    this.ctx.transmit({
      link: this.cell.tech ?? "lte-m",
      from: "station",
      to: "cloud",
      kind: "control",
      label: "Sesión TLS 1.3 + MQTT CONNECT",
      bytes: cost.up + cost.down,
      payloadBytes: 0,
      tStart: t,
      tEnd: t + 1.2,
      details: {
        notes: [
          "Autenticación mutua con certificados X.509 (clave en el elemento seguro)",
          "CONNECT con mensaje de última voluntad en tf/…/estado",
          "Suscripción a tf/…/cmd/# para recibir órdenes",
        ],
      },
    });
  }

  private refreshSession(t: number): void {
    if (!this.sessionUp) return;
    const down = sessionTeardownCost();
    this.cell.account(down.up, down.down);
    this.sessionUp = false;
    this.openSession(t);
  }

  private keepAlive(t: number): void {
    if (!this.sessionUp || !this.cell.available) return;
    if (t - this.lastUplinkAt >= this.ctx.params.station.keepAliveS) {
      const c = keepAliveCost();
      this.cell.account(c.up, c.down);
      this.lastUplinkAt = t;
    }
  }

  private checkWan(t: number): void {
    if (this.sessionUp && !this.cell.available) {
      this.sessionUp = false;
      this.ctx.narrate({
        level: "N2",
        title: "Sin conexión con la plataforma",
        text: "La estación pierde la red móvil. Sigue funcionando sola: alarmas locales, pauta del dispensador y almacenamiento de todo lo que llegue (hasta 72 h).",
        tone: "warn",
        focus: "station",
      });
      return;
    }
    if (!this.sessionUp && !this.reconnecting && this.cell.available) {
      this.reconnecting = true;
      const wait = this.ctx.rng.uniform(0, this.ctx.params.station.backoffMaxS);
      this.ctx.narrate({
        level: "N2",
        title: "Vuelve la red móvil",
        text: `La estación espera ${Math.round(wait)} s al azar antes de reconectar (entre 0 y ${this.ctx.params.station.backoffMaxS} s) para que miles de estaciones no saturen a la vez la plataforma. Luego envía primero las alertas, después los vectores y por último las tiras.`,
        tone: "info",
        focus: "station",
      });
      this.ctx.scheduler.after(wait, "station-reconnect", (now) => {
        this.reconnecting = false;
        if (!this.cell.available) return;
        this.openSession(now);
        this.flushQueue(now);
      });
    }
    if (this.sessionUp && this.queue.length > 0 && this.cell.available) this.flushQueue(t);
  }

  private flushQueue(t: number): void {
    const items = this.queue.splice(0);
    items.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
    for (const item of items) this.sendPublish(item, t);
  }

  /** Sincroniza cada hora el reloj del wearable (Current Time Service). */
  private timeSync(t: number): void {
    if (!this.ble.connected) return;
    const delay = this.ble.downlinkDelay(10);
    this.metrics.addBle("control", 10);
    this.ble.bytesDown += 10;
    this.ctx.transmit({
      link: "ble",
      from: "station",
      to: "wearable",
      kind: "control",
      label: "Sincronización horaria (Current Time Service)",
      bytes: 10,
      payloadBytes: 10,
      tStart: t,
      tEnd: t + delay,
    });
  }

  // -------------------------------------------------------------------------
  // Bajada: órdenes y avisos
  // -------------------------------------------------------------------------

  receiveDownlink(dl: Downlink, t: number): void {
    if (dl.kind === "order") {
      // UART interna hacia el microcontrolador del dispensador.
      const order = dl.order;
      this.ctx.transmit({
        link: "uart",
        from: "station",
        to: "dispenser",
        kind: "order",
        label: `Orden ${order.orderId} al microcontrolador`,
        bytes: 180,
        payloadBytes: 180,
        tStart: t,
        tEnd: t + 0.05,
      });
      this.ctx.scheduler.after(0.05, "dispenser-order", (now) => {
        const ok = this.dispenser.receiveOrder(order, now);
        if (!ok) this.metrics.ordersRejected++;
      });
      return;
    }
    // Escenario base: la nube ordena activar la alarma local del wearable.
    if (!this.ble.connected) return;
    const delay = this.ble.downlinkDelay(8);
    this.ctx.transmit({
      link: "ble",
      from: "station",
      to: "wearable",
      kind: "control",
      label: "Orden de aviso local",
      bytes: 8,
      payloadBytes: 8,
      tStart: t,
      tEnd: t + delay,
    });
    this.ctx.scheduler.after(delay, "wearable-remote-alarm", (now) => this.wearable.remoteAlarm(now, dl.alert));
  }

  /** Ritmo de llegada de la cola de subida (para la interfaz). */
  uplinkBacklog(t: number): number {
    return this.cell.backlog(t);
  }

  /** Minuto del envío horario de esta estación (para explicarlo). */
  get slotLabel(): string {
    return `hh:${String(Math.floor(this.slotOffset / MINUTE)).padStart(2, "0")}:${String(Math.round(this.slotOffset % MINUTE)).padStart(2, "0")}`;
  }
}

function fmtSigned(v: number, decimals: number): string {
  const s = v.toFixed(decimals).replace(".", ",");
  return v > 0 ? `+${s}` : s;
}
