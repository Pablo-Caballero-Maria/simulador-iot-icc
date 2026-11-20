/**
 * Motor de la simulación: crea los componentes, los conecta y avanza el
 * tiempo. No depende de React ni del navegador, de modo que los tests y el
 * script de resultados lo ejecutan igual que la web.
 */
import { BleLink } from "./network/ble";
import { CellularLink } from "./network/cellular";
import { Emitter } from "./core/emitter";
import { Rng } from "./core/rng";
import { Scheduler } from "./core/scheduler";
import { DAY, HOUR, dayIndex, formatSimTime, hourOfDay, timeAt } from "./core/time";
import { percentile } from "./core/stats";
import { CLINICIAN_KEY_LABEL, Platform } from "./cloud/platform";
import { deriveKeyPair } from "./cloud/signing";
import { SPOTS, roomAt, ROOMS } from "./physiology/home";
import { Patient } from "./physiology/patient";
import { RHYTHM_LABELS, type Rhythm } from "./physiology/rhythm";
import { type SimParams, cloneParams } from "./params";
import { type AlertRecord, Metrics } from "./records";
import { Dispenser } from "./station/dispenser";
import { Scale } from "./station/scale";
import { Station } from "./station/station";
import type { Narration, SimContext, SimEvents, Transmission } from "./types";
import { totalCurrent } from "./wearable/energy";
import { RAW_BYTES_PER_SECOND, Wearable } from "./wearable/wearable";

export interface SimulationOptions {
  params: SimParams;
  seed?: number;
}

/** Velocidad a partir de la cual el ECG se simula latido a latido (modo automático). */
export const SIGNAL_SPEED_LIMIT = 120;

export class Simulation {
  readonly scheduler = new Scheduler();
  readonly bus = new Emitter<SimEvents>();
  readonly rng: Rng;
  readonly params: SimParams;
  readonly metrics = new Metrics();
  readonly patient: Patient;
  readonly ble: BleLink;
  readonly cell: CellularLink;
  readonly wearable: Wearable;
  readonly dispenser: Dispenser;
  readonly station: Station;
  readonly platform: Platform;
  readonly scale: Scale;
  /** Todas las alertas generadas (también las que nunca llegan a la consola). */
  readonly allAlerts: AlertRecord[] = [];
  readonly transmissions: Transmission[] = [];
  readonly narrations: Narration[] = [];
  private txId = 0;
  private narrationId = 0;
  private readonly narrationCount = new Map<string, number>();
  private readonly ctx: SimContext;
  readonly seed: number;

  constructor({ params, seed = 42 }: SimulationOptions) {
    this.seed = seed;
    this.params = cloneParams(params);
    this.rng = new Rng(seed);
    this.ctx = {
      scheduler: this.scheduler,
      params: this.params,
      rng: this.rng,
      bus: this.bus,
      transmit: (tx) => this.recordTransmission(tx),
      narrate: (n, key) => this.recordNarration(n, key),
    };
    this.patient = new Patient(this.params, this.rng.fork("patient"), 0);
    this.ble = new BleLink(this.params, this.rng.fork("ble"));
    this.cell = new CellularLink(this.params, this.rng.fork("cell"));
    this.wearable = new Wearable(
      { ...this.ctx, rng: this.rng.fork("wearable") },
      this.patient,
      this.ble,
      this.metrics,
      (a) => this.allAlerts.push(a),
    );
    this.dispenser = new Dispenser(
      { ...this.ctx, rng: this.rng.fork("dispenser") },
      // La clave pública del cardiólogo se graba en el microcontrolador al preparar el kit.
      deriveKeyPair(CLINICIAN_KEY_LABEL).publicKey,
      (kind, t, order) => this.onDoseReleased(kind, t, order),
      (ev) => this.station.onDispenserEvent(ev),
    );
    this.station = new Station(
      { ...this.ctx, rng: this.rng.fork("station") },
      this.cell,
      this.ble,
      this.wearable,
      this.dispenser,
      this.patient,
      this.metrics,
    );
    this.platform = new Platform(
      { ...this.ctx, rng: this.rng.fork("platform") },
      this.cell,
      this.station,
      this.patient,
      this.metrics,
    );
    this.scale = new Scale({ ...this.ctx, rng: this.rng.fork("scale") }, this.patient, (kg, t) =>
      this.station.onWeight(kg, t),
    );
    this.station.onAlertCreated = (a) => this.allAlerts.push(a);
    this.platform.onAlertCreated = (a) => this.allAlerts.push(a);
    this.wearable.connect(this.station);
    this.station.attachBroker(this.platform);

    // Mundo físico: paciente y enlace BLE se actualizan cada segundo, antes que el wearable.
    this.scheduler.every(1, 1, "world", (t) => this.worldTick(t));
    this.wearable.start();
    this.station.start();
    this.dispenser.start();
    this.platform.start();
    this.scale.start();
  }

  get now(): number {
    return this.scheduler.now;
  }

  /** Avanza `dt` segundos de simulación. */
  advance(dt: number): void {
    this.scheduler.runUntil(this.scheduler.now + dt);
  }

  /** Avanza hasta un instante absoluto. */
  runUntil(t: number): void {
    this.scheduler.runUntil(t);
  }

  /** Elige la resolución del ECG según la velocidad de reproducción. */
  adaptFidelity(speed: number): void {
    const f = this.params.wearable.fidelity;
    const kind = f === "auto" ? (speed <= SIGNAL_SPEED_LIMIT ? "signal" : "beat") : f;
    this.wearable.setFrontEnd(kind);
  }

  private worldTick(t: number): void {
    this.patient.update(t);
    const res = this.ble.update(t, this.patient.position(), SPOTS.station, this.patient.bodyLossDb(t));
    if (res.disconnected) {
      this.recordNarration(
        {
          level: "N2",
          title: "Wearable fuera de alcance",
          text: `Se pierde el enlace BLE (${Math.round(this.ble.rssi)} dBm). El wearable sigue detectando arritmias y avisando localmente, y guarda en su flash los vectores, alertas y tiras hasta reconectar.`,
          tone: "warn",
          focus: "wearable",
        },
        "ble-lost",
      );
    }
    if (res.connected) {
      const n = this.wearable.flushBuffer();
      this.recordNarration(
        {
          level: "N2",
          title: "Enlace BLE recuperado",
          text:
            n > 0
              ? `Al reconectar, el wearable envía ${n} mensajes guardados, primero las alertas.`
              : "El wearable vuelve a estar conectado con la estación.",
          tone: "ok",
          focus: "wearable",
        },
        "ble-back",
      );
    }
    if (res.phyChanged) {
      this.recordNarration(
        {
          level: "N2",
          title: res.phyChanged === "coded" ? "Cambio a LE Coded" : "Vuelta a LE 1M",
          text:
            res.phyChanged === "coded"
              ? `La señal ha bajado a ${Math.round(this.ble.rssi)} dBm: el enlace pasa a LE Coded, que llega unas cuatro veces más lejos a cambio de tardar más en enviar cada byte.`
              : "La señal vuelve a ser buena y el enlace recupera LE 1M.",
          tone: "info",
          focus: "wearable",
        },
        `phy-${res.phyChanged}`,
      );
    }
  }

  private onDoseReleased(kind: "basal" | "extra", t: number, order?: Parameters<Dispenser["reportTaken"]>[3]): void {
    this.metrics.dosesDispensed++;
    if (kind === "extra") this.patient.requestVisit("stationFront", t, 8 * 60, "Toma de la dosis adicional");
    const delay = this.rng.uniform(90, 480);
    const taken = this.rng.chance(this.params.patient.adherence);
    this.scheduler.at(t + delay, "dose-taken", (now) => {
      if (taken) {
        this.metrics.dosesTaken++;
        if (kind === "extra") this.patient.takeExtraDiuretic(now);
      } else if (kind === "basal") {
        this.patient.missBasalDose(now);
      }
      this.dispenser.reportTaken(now, taken, kind, order);
    });
  }

  private recordTransmission(tx: Omit<Transmission, "id">): Transmission {
    const full: Transmission = { ...tx, id: ++this.txId };
    this.transmissions.push(full);
    if (this.transmissions.length > 500) this.transmissions.splice(0, this.transmissions.length - 400);
    this.bus.emit("transmission", full);
    return full;
  }

  private recordNarration(n: Omit<Narration, "id" | "t">, key?: string): void {
    if (key) {
      const count = this.narrationCount.get(key) ?? 0;
      this.narrationCount.set(key, count + 1);
      // Las explicaciones repetitivas solo se muestran las dos primeras veces.
      if (count >= 2) return;
    }
    const full: Narration = { ...n, id: ++this.narrationId, t: this.scheduler.now };
    this.narrations.push(full);
    if (this.narrations.length > 300) this.narrations.splice(0, 100);
    this.bus.emit("narration", full);
  }

  /** Publica una explicación desde fuera del motor (escenarios, recorrido guiado). */
  narrate(n: Omit<Narration, "id" | "t">, key?: string): void {
    this.recordNarration(n, key);
  }

  // -------------------------------------------------------------------------
  // Acciones del usuario
  // -------------------------------------------------------------------------

  /** Provoca un episodio de arritmia a partir de ahora. */
  triggerRhythm(rhythm: Rhythm, durationS: number, hr?: number, delayS = 0): void {
    const start = this.now + delayS;
    this.patient.addRhythmEpisode({ start, end: start + durationS, rhythm, hr });
    this.recordNarration({
      level: "N1",
      title: `Episodio simulado: ${RHYTHM_LABELS[rhythm]}`,
      text: `El corazón del paciente simulado presenta «${RHYTHM_LABELS[rhythm].toLowerCase()}» durante ${Math.round(durationS)} s. El sistema no lo sabe: tiene que descubrirlo a partir de la señal.`,
      tone: "info",
      focus: "wearable",
    });
  }

  /** Desconecta el electrodo (o simula artefactos) durante un tiempo. */
  triggerCondition(condition: "noisy" | "lead-off", durationS: number): void {
    this.patient.addConditionEpisode({ start: this.now, end: this.now + durationS, condition });
  }

  pressSymptomButton(): void {
    this.wearable.pressSymptomButton(this.now);
  }

  /** Otra persona usa la báscula. */
  visitorWeighs(kg = 64.3): void {
    this.scale.measure(kg, this.now);
  }

  setCellularOutage(on: boolean): void {
    this.cell.outage = on;
  }

  acknowledgeAlert(id: string): void {
    this.platform.acknowledge(id, "Usuario (consola)", this.now);
  }

  signOrder(orderId: string): void {
    this.platform.signPlan(orderId, this.now, "Usuario (cardiólogo)");
  }

  rejectOrder(orderId: string): void {
    this.platform.rejectPlan(orderId, this.now);
  }

  injectAttack(kind: "forged" | "replay"): void {
    this.platform.injectAttack(kind, this.now);
    this.recordNarration({
      level: "T",
      title: kind === "forged" ? "Ataque: orden de dosis falsificada" : "Ataque: repetición de una orden",
      text:
        kind === "forged"
          ? "Un atacante con control de la plataforma envía una orden de dosis. No tiene la clave privada del cardiólogo, así que la firma no puede ser válida."
          : "Un atacante reenvía una orden auténtica que ya se ejecutó, con su firma válida.",
      tone: "critical",
      focus: "dispenser",
    });
  }

  /** Cambia un parámetro en caliente. */
  setParam<G extends keyof SimParams>(
    group: G,
    key: keyof SimParams[G],
    value: SimParams[G][keyof SimParams[G]],
  ): void {
    (this.params[group] as Record<string, unknown>)[key as string] = value;
  }

  // -------------------------------------------------------------------------
  // Estado para la interfaz
  // -------------------------------------------------------------------------

  snapshot(): SimSnapshot {
    const t = this.now;
    const days = Math.max(t / DAY, 1e-9);
    const heart = this.patient.heartStateAt(t);
    const pos = this.patient.position();
    const lastWindow = this.wearable.recentWindows.at(-1) ?? null;
    const wanTotal = this.cell.bytesUp + this.cell.bytesDown;
    const consoleDelays = this.metrics.consoleDelays;
    const lastCritical = [...this.allAlerts].reverse().find((a) => a.alertClass === 1) ?? null;
    return {
      t,
      clock: formatSimTime(t),
      day: dayIndex(t),
      hour: hourOfDay(t),
      patient: {
        x: pos.x,
        z: pos.z,
        room: ROOMS[roomAt(pos)].name,
        activity: this.patient.activityLabel(),
        posture: this.patient.postureAt(t),
        rhythm: heart.rhythm,
        rhythmLabel: RHYTHM_LABELS[heart.rhythm],
        hr: heart.rhythm === "pause" ? 0 : heart.hr,
        congestion: this.patient.congestionAt(t),
        admittedAt: this.patient.admittedAt,
        condition: this.patient.conditionAt(t),
      },
      wearable: {
        mode: this.params.wearable.mode,
        frontEnd: this.wearable.frontEndKind,
        socPct: this.wearable.battery.socPct,
        instantCurrent: totalCurrent(this.wearable.currentBreakdown()),
        averageCurrent: this.wearable.averageCurrent,
        autonomyDays: this.wearable.projectedAutonomyDays,
        usableMah: this.wearable.battery.usableMah,
        buffered: this.wearable.bufferedMessages,
        vibrating: this.wearable.vibratingUntil > t,
        off: this.wearable.off,
        alarmOnly: this.wearable.alarmOnly,
        lastWindow,
      },
      ble: { state: this.ble.state, phy: this.ble.phy, rssi: this.ble.rssi, timeIn: { ...this.ble.timeIn } },
      cellular: {
        tech: this.cell.tech,
        rsrp: this.params.cellular.rsrpDbm,
        outage: this.cell.outage,
        backlogS: this.cell.backlog(t),
        bytesUp: this.cell.bytesUp,
        bytesDown: this.cell.bytesDown,
      },
      station: {
        connected: this.station.connected,
        queue: this.station.queueLength,
        lastWeight: this.station.lastWeight,
        congestion: this.station.congestionResults.at(-1) ?? null,
        slot: this.station.slotLabel,
      },
      dispenser: {
        pills: this.dispenser.pillsLeft,
        trayOpen: this.dispenser.trayOpenUntil > t,
        nextExtraAt: this.dispenser.scheduledExtra?.at ?? null,
      },
      ambulance: { ...this.platform.ambulance },
      data: {
        bleBytes: this.metrics.bleTotal,
        blePerDay: this.metrics.bleTotal / days,
        wanBytes: wanTotal,
        wanPerDay: wanTotal / days,
        wanPayloadPerDay: this.metrics.wanPayloadTotal / days,
        rawBlePerDay: RAW_BYTES_PER_SECOND * DAY,
        elapsedDays: t / DAY,
        costPerYear: (wanTotal / days / 1e6) * 365 * this.params.economy.eurPerMb,
      },
      alerts: {
        total: this.allAlerts.length,
        critical: this.allAlerts.filter((a) => a.alertClass === 1).length,
        lastCritical,
        consoleP95: consoleDelays.length ? percentile(consoleDelays, 95) : null,
        consoleLast: consoleDelays.at(-1) ?? null,
        localAlarmLast: this.metrics.localAlarmDelays.at(-1) ?? null,
      },
      classifier: { windows: this.metrics.windows, accuracy: this.metrics.accuracy },
      metrics: {
        duplicates: this.metrics.duplicatesDropped,
        storedAndForwarded: this.metrics.storedAndForwarded,
        sms: this.metrics.smsSent,
        dosesDispensed: this.metrics.dosesDispensed,
        dosesTaken: this.metrics.dosesTaken,
        ordersRejected: this.metrics.ordersRejected,
        weighings: this.metrics.weighings,
        weighingsRejected: this.metrics.weighingsRejected,
        fhirResources: this.platform.fhirResources,
      },
    };
  }

  /** Avanza sin interfaz hasta la hora `hour` del día actual (o del siguiente), en modo rápido. */
  fastForwardTo(hour: number): void {
    let target = timeAt(dayIndex(this.now), hour);
    if (target <= this.now) target += DAY;
    this.wearable.setFrontEnd("beat");
    this.runUntil(target);
    this.narrations.length = 0;
    this.transmissions.length = 0;
  }

  /** Duración de un día de simulación en segundos (para la interfaz). */
  static readonly DAY = DAY;
  static readonly HOUR = HOUR;
}

export interface SimSnapshot {
  t: number;
  clock: string;
  day: number;
  hour: number;
  patient: {
    x: number;
    z: number;
    room: string;
    activity: string;
    posture: string;
    rhythm: Rhythm;
    rhythmLabel: string;
    hr: number;
    congestion: number;
    admittedAt: number | null;
    condition: string;
  };
  wearable: {
    mode: SimParams["wearable"]["mode"];
    frontEnd: "signal" | "beat";
    socPct: number;
    instantCurrent: number;
    averageCurrent: number;
    autonomyDays: number;
    usableMah: number;
    buffered: number;
    vibrating: boolean;
    off: boolean;
    alarmOnly: boolean;
    lastWindow: Wearable["recentWindows"][number] | null;
  };
  ble: { state: string; phy: string; rssi: number; timeIn: Record<string, number> };
  cellular: {
    tech: string | null;
    rsrp: number;
    outage: boolean;
    backlogS: number;
    bytesUp: number;
    bytesDown: number;
  };
  station: {
    connected: boolean;
    queue: number;
    lastWeight: { kg: number; valid: boolean; t: number } | null;
    congestion: Station["congestionResults"][number] | null;
    slot: string;
  };
  dispenser: { pills: number; trayOpen: boolean; nextExtraAt: number | null };
  ambulance: Platform["ambulance"];
  data: {
    bleBytes: number;
    blePerDay: number;
    wanBytes: number;
    wanPerDay: number;
    wanPayloadPerDay: number;
    rawBlePerDay: number;
    elapsedDays: number;
    costPerYear: number;
  };
  alerts: {
    total: number;
    critical: number;
    lastCritical: AlertRecord | null;
    consoleP95: number | null;
    consoleLast: number | null;
    localAlarmLast: number | null;
  };
  classifier: { windows: number; accuracy: number };
  metrics: {
    duplicates: number;
    storedAndForwarded: number;
    sms: number;
    dosesDispensed: number;
    dosesTaken: number;
    ordersRejected: number;
    weighings: number;
    weighingsRejected: number;
    fhirResources: number;
  };
}
