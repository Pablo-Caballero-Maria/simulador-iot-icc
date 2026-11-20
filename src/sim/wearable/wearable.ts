/**
 * Wearable torácico (nivel 1 y nivel 3 en el dispositivo).
 *
 * Cada segundo procesa el ECG (front-end de señal o de latido), cada 8 s
 * clasifica el ritmo con la red INT8 y aplica las reglas de actuación; cada
 * 15 min mide la bioimpedancia; cada hora envía un vector de 64 bytes. Ante
 * un evento crítico vibra y envía la alerta con 30 s de ECG. Sin conexión BLE
 * guarda los mensajes en su flash y los envía al reconectar.
 *
 * En el escenario base («raw») no clasifica: empaqueta las señales en bruto
 * (6 064 bit/s) y la decisión se toma en la nube.
 */
import { DAY, HOUR, MINUTE, START_OFFSET, hourOfDay, nextTimeOfDay } from "../core/time";
import { mean } from "../core/stats";
import { ECG_FS, EcgSynth } from "../physiology/ecg";
import type { Patient } from "../physiology/patient";
import { BeatGenerator, type Beat, type Rhythm } from "../physiology/rhythm";
import type { BleLink } from "../network/ble";
import type { AlertRecord, Metrics } from "../records";
import type { SimContext } from "../types";
import { RHYTHM_CLASSES, type RhythmClass } from "./classes";
import { RhythmClassifier, type Prediction } from "./classifier";
import type { DetectedBeat } from "./dsp";
import {
  ADVERTISING_CURRENT,
  BUZZER,
  Battery,
  CURRENT_TABLE,
  VIBRATION,
  radioByteCharge,
  radioKeepAliveCurrent,
  totalCurrent,
  type CurrentBreakdown,
} from "./energy";
import { WINDOW_SECONDS, type WindowFeatures } from "./features";
import { BeatFrontEnd, SignalFrontEnd, WindowAnalyzer, type FrontEnd } from "./frontend";
import {
  ALERT_BYTES,
  STRIP_BYTES,
  STRIP_SECONDS,
  VECTOR_BYTES,
  encodeAlert,
  encodeStrip,
  encodeVector,
  type EventCode,
  type HourlyVector,
  EVENT_CODES,
} from "./payloads";
import { RuleEngine, type RuleEvent } from "./rules";

/** Bit/s de las señales en bruto (ecuación 1): ECG + bioimpedancia + acelerómetro + temperatura. */
export const RAW_BITRATE = 256 * 16 + 32 * 24 + 3 * 25 * 16 + 16 / 60;
/** Bytes de señal en bruto por segundo. */
export const RAW_BYTES_PER_SECOND = RAW_BITRATE / 8;
/** Cada cuánto envía el wearable una ráfaga de datos en bruto en el escenario base, s. */
const RAW_BURST_SECONDS = 5;

/** Resultado de una ventana, para la interfaz y para la nube en el escenario base. */
export interface WindowResult {
  t: number;
  predicted: RhythmClass;
  truth: RhythmClass | null;
  rhythm: Rhythm;
  confidence: number;
  probs: number[];
  hr: number;
  sqi: number;
  features: number[];
  events: RuleEvent[];
}

export type BleMessage =
  | { kind: "vector"; seq: number; bytes: Uint8Array; createdAt: number; vector: HourlyVector }
  | { kind: "alert"; seq: number; bytes: Uint8Array; createdAt: number; alert: AlertRecord }
  | {
      kind: "strip";
      seq: number;
      bytes: Uint8Array;
      createdAt: number;
      code: EventCode;
      startTime: number;
      alert?: AlertRecord;
    }
  | { kind: "raw"; seq: number; size: number; createdAt: number; windows: WindowResult[] };

/** Receptor de los mensajes del wearable (la estación). */
export interface BleReceiver {
  onBleMessage(msg: BleMessage, t: number): void;
}

interface HourAccumulator {
  start: number;
  hrs: number[];
  rmssd: number[];
  sdnn: number[];
  classWindows: Record<RhythmClass, number>;
  pauses: number;
  bradys: number;
  resp: number[];
  imp: number[];
  supineImp: number;
  activity: number[];
  posture: number[];
  sqi: number[];
  temp: number[];
  rssi: number[];
  leadOff: number;
  symptoms: number;
}

function newHour(start: number): HourAccumulator {
  return {
    start,
    hrs: [],
    rmssd: [],
    sdnn: [],
    classWindows: Object.fromEntries(RHYTHM_CLASSES.map((c) => [c, 0])) as Record<RhythmClass, number>,
    pauses: 0,
    bradys: 0,
    resp: [],
    imp: [],
    supineImp: 0,
    activity: [],
    posture: [],
    sqi: [],
    temp: [],
    rssi: [],
    leadOff: 0,
    symptoms: 0,
  };
}

const POSTURE_CODE = { supine: 0, sitting: 1, upright: 2, walking: 3 } as const;

export class Wearable {
  readonly battery: Battery;
  private readonly rules: RuleEngine;
  private readonly classifier = new RhythmClassifier();
  private readonly beatGen: BeatGenerator;
  private readonly beatFE: BeatFrontEnd;
  private signalFE: SignalFrontEnd | null = null;
  private readonly analyzer: WindowAnalyzer;
  private readonly beats: Beat[] = [];
  private secInWindow = 0;
  private skipWindows = 0;
  private seq = 0;
  private bleBusyUntil = 0;
  private readonly flash: BleMessage[] = [];
  private hour: HourAccumulator;
  private rawBuffer = 0;
  private rawWindows: WindowResult[] = [];
  private rawSecs = 0;
  private receiver: BleReceiver | null = null;
  private lowBatteryNotified = new Set<number>();
  private consumedMas = 0;
  private elapsed = 0;
  /** Desglose de la corriente media acumulada (para la interfaz), mA·s. */
  private readonly chargeByBlock: Record<keyof CurrentBreakdown | "events", number> = {
    ecgFrontEnd: 0,
    bioimpedance: 0,
    accelTemp: 0,
    mcuSleep: 0,
    mcuStreaming: 0,
    mcuProcessing: 0,
    radio: 0,
    misc: 0,
    events: 0,
  };

  /** Modo de solo alarmas (batería < 5 %): se apagan bioimpedancia y acelerómetro. */
  alarmOnly = false;
  /** Sin batería: deja de funcionar. */
  off = false;
  /** Fin de la vibración en curso (para la animación). */
  vibratingUntil = -1;
  readonly recentWindows: WindowResult[] = [];
  readonly recentDetections: DetectedBeat[] = [];
  /** Instantes de los latidos reales recientes (para la interfaz). */
  get trueBeats(): readonly Beat[] {
    return this.beats;
  }

  constructor(
    private readonly ctx: SimContext,
    private readonly patient: Patient,
    private readonly ble: BleLink,
    private readonly metrics: Metrics,
    private readonly alertSink: (alert: AlertRecord) => void,
  ) {
    const p = ctx.params.wearable;
    this.battery = new Battery(p.batteryCapacityMah, p.usableFraction, p.batteryHealth, p.initialSocPct);
    this.rules = new RuleEngine(p);
    this.beatGen = new BeatGenerator(ctx.rng.fork("beats"), -1);
    this.beatFE = new BeatFrontEnd(ctx.rng.fork("beat-fe"));
    this.analyzer = new WindowAnalyzer(this.beatFE);
    this.hour = newHour(0);
  }

  get mode() {
    return this.ctx.params.wearable.mode;
  }

  get frontEndKind(): FrontEnd["kind"] {
    return this.analyzer.frontEnd.kind;
  }

  /** Señal de ECG acondicionada de los últimos 10 s (solo con la ruta de señal). */
  get ecgDisplay(): { samples: Float32Array; end: number } | null {
    if (!this.signalFE || this.analyzer.frontEnd !== this.signalFE) return null;
    return { samples: this.signalFE.display, end: this.signalFE.displayEnd };
  }

  get bufferedMessages(): number {
    return this.flash.length;
  }

  connect(receiver: BleReceiver): void {
    this.receiver = receiver;
  }

  /** Cambia la resolución del modelo de ECG. */
  setFrontEnd(kind: FrontEnd["kind"]): void {
    if (kind === this.analyzer.frontEnd.kind) return;
    const now = this.ctx.scheduler.now;
    if (kind === "signal") {
      this.signalFE = new SignalFrontEnd(this.ctx.rng.fork(`sig-${Math.round(now)}`), now);
      this.analyzer.setFrontEnd(this.signalFE);
    } else {
      this.analyzer.setFrontEnd(this.beatFE);
    }
    this.skipWindows = 1;
  }

  start(): void {
    const s = this.ctx.scheduler;
    s.every(1, 1, "wearable-tick", (t) => this.tick(t));
    const nextHour = Math.ceil((s.now + START_OFFSET) / HOUR) * HOUR - START_OFFSET;
    this.hour = newHour(nextHour - HOUR);
    s.every(nextHour, this.ctx.params.wearable.vectorPeriodS, "wearable-vector", (t) => this.sendVector(t));
    s.every(5, 15 * MINUTE, "wearable-impedance", (t) => this.measureImpedance(t));
    if (this.ctx.params.wearable.dailyStrip) {
      s.every(nextTimeOfDay(s.now, 12), DAY, "wearable-daily-strip", (t) => this.sendStrip(t, "scheduled"));
    }
  }

  // -------------------------------------------------------------------------
  // Procesado de cada segundo
  // -------------------------------------------------------------------------

  private tick(t: number): void {
    if (this.off) return;
    const t0 = t - 1;
    this.integrateEnergy(1);
    this.checkBattery(t);
    if (this.off) return;

    const condition = this.patient.conditionAt(t0 + 0.5);
    const heart = this.patient.heartStateAt(t0 + 0.5);
    this.beatGen.generate(t + 1.4, (x) => this.patient.heartStateAt(x), this.beats);
    while (this.beats.length > 0 && this.beats[0].t < t - 45) this.beats.shift();
    const relevant = this.beats.filter((b) => b.t > t0 - 0.6 && b.t < t + 0.4);
    const detected = this.analyzer.feedSecond({
      t0,
      beats: relevant,
      ctx: {
        condition,
        activity: this.patient.activityAt(t0),
        respRate: heart.respRate,
        fibrillation: heart.rhythm === "af",
      },
    });
    this.recentDetections.push(...detected);
    while (this.recentDetections.length > 0 && this.recentDetections[0].t < t - 12) this.recentDetections.shift();
    if (condition === "lead-off") this.hour.leadOff++;

    // Reglas de cada segundo: pausa y electrodo desconectado.
    const fe = this.analyzer.frontEnd;
    const events = this.rules.onSecond(
      t,
      this.analyzer.lastDetected?.t ?? null,
      condition === "lead-off",
      fe.warmingUp(t) || this.skipWindows > 0,
    );
    for (const ev of events) this.onRuleEvent(ev, t, heart.rhythm);

    if (++this.secInWindow >= WINDOW_SECONDS) {
      this.secInWindow = 0;
      this.closeWindow(t);
    }

    if (this.mode === "raw") {
      this.rawBuffer += RAW_BYTES_PER_SECOND;
      if (++this.rawSecs >= RAW_BURST_SECONDS) {
        this.rawSecs = 0;
        const size = Math.round(this.rawBuffer);
        this.rawBuffer -= size;
        const windows = this.rawWindows;
        this.rawWindows = [];
        this.send({ kind: "raw", seq: this.seq++, size, createdAt: t, windows });
      }
    }
  }

  private closeWindow(t: number): void {
    const f = this.analyzer.closeWindow(t - WINDOW_SECONDS, t);
    if (this.skipWindows > 0) {
      this.skipWindows--;
      return;
    }
    const pred: Prediction = this.classifier.predict(f.values);
    const heart = this.patient.heartStateAt(t - WINDOW_SECONDS / 2);
    const truth = this.truthLabel(t - WINDOW_SECONDS, t);
    this.metrics.recordWindow(truth, pred.cls);
    this.accumulateWindow(pred.cls, f);

    const events = this.rules.onWindow(t, pred.cls, pred.confidence, f);
    const result: WindowResult = {
      t,
      predicted: pred.cls,
      truth,
      rhythm: heart.rhythm,
      confidence: pred.confidence,
      probs: pred.probs,
      hr: f.hr,
      sqi: f.sqi,
      features: f.values,
      events,
    };
    this.recentWindows.push(result);
    if (this.recentWindows.length > 60) this.recentWindows.shift();

    if (this.mode === "raw") {
      // En el escenario base la clasificación la hace la nube con el flujo en bruto.
      this.rawWindows.push(result);
      return;
    }
    for (const ev of events) this.onRuleEvent(ev, t, heart.rhythm);
  }

  /** Etiqueta verdadera de la ventana según el paciente simulado (null si es ambigua). */
  private truthLabel(start: number, end: number): RhythmClass | null {
    const votes = new Map<RhythmClass | null, number>();
    // En el ritmo con extrasístoles, una ventana sin latidos ventriculares es normal.
    const ventricular = this.beats.filter((b) => b.morph === "V" && b.t >= start && b.t < end).length;
    for (let k = 0; k < 8; k++) {
      const x = start + ((k + 0.5) * (end - start)) / 8;
      const cond = this.patient.conditionAt(x);
      const r = this.patient.heartStateAt(x).rhythm;
      let label: RhythmClass | null;
      if (cond !== "clean") label = "noise";
      else if (r === "pause") label = null;
      else if (r === "sinus" || r === "brady") label = "normal";
      else if (r === "ectopy") label = ventricular > 0 ? "ectopy" : "normal";
      else label = r;
      votes.set(label, (votes.get(label) ?? 0) + 1);
    }
    let best: RhythmClass | null = null;
    let bestVotes = 0;
    for (const [label, v] of votes) {
      if (v > bestVotes) {
        best = label;
        bestVotes = v;
      }
    }
    return bestVotes >= 6 ? best : null;
  }

  private accumulateWindow(cls: RhythmClass, f: WindowFeatures): void {
    const h = this.hour;
    h.classWindows[cls]++;
    h.sqi.push(f.sqi);
    if (cls !== "noise" && Number.isFinite(f.hr)) {
      h.hrs.push(f.hr);
      h.sdnn.push(f.values[3] * 1000);
      h.rmssd.push(f.values[4] * 1000);
    }
    h.rssi.push(this.ble.rssi);
    h.activity.push(this.patient.activityAt(this.ctx.scheduler.now));
    h.posture.push(POSTURE_CODE[this.patient.postureAt(this.ctx.scheduler.now)]);
  }

  // -------------------------------------------------------------------------
  // Eventos y alertas
  // -------------------------------------------------------------------------

  private onRuleEvent(ev: RuleEvent, t: number, rhythmNow: Rhythm): void {
    if (ev.code === "pause") this.hour.pauses++;
    if (ev.code === "brady" || ev.code === "severeBrady") this.hour.bradys++;
    const real = this.isReal(ev.code, rhythmNow);
    const alert: AlertRecord = {
      id: `A${String(this.seq).padStart(4, "0")}`,
      code: ev.code,
      alertClass: ev.alertClass,
      title: ev.title,
      detectedAt: ev.t,
      hr: ev.hr,
      confidence: ev.confidence,
      real,
      origin: "wearable",
      escalations: [],
      status: "open",
    };
    this.alertSink(alert);
    if (ev.alertClass === 1) this.localAlarm(t, alert);
    this.sendAlert(t, alert);
    if (ev.alertClass <= 2) this.sendStrip(t, ev.code, alert);
    this.ctx.narrate({
      level: "N3",
      title: `El wearable detecta: ${ev.title}`,
      text:
        ev.code === "pause" || ev.code === "brady" || ev.code === "severeBrady"
          ? `Una regla independiente de la red neuronal lo detecta (${ev.code === "pause" ? `${this.ctx.params.wearable.pauseSeconds} s sin latidos` : `${Math.round(ev.hr)} lpm`}). ${ev.alertClass === 1 ? "Vibra y suena al momento, sin esperar a la red, y " : ""}envía por BLE la alerta (${ALERT_BYTES} B) y la tira de 30 s de ECG (${STRIP_BYTES.toLocaleString("es-ES")} B).`
          : ev.code === "leadOff"
            ? "El front-end detecta el electrodo despegado más de 1 min: aviso técnico (clase 3), sin confundirlo con una pausa."
            : `La red INT8 lo ha clasificado así en ${ev.code === "vt" ? "dos ventanas seguidas de 8 s" : "las últimas ventanas de 8 s"} (FC ${Math.round(ev.hr)} lpm, confianza ${Math.round(ev.confidence * 100)} %). ${ev.alertClass === 1 ? "Al ser crítica vibra y suena en 50 ms, sin esperar a la red, y " : "Es de clase 2: "}envía por BLE la alerta (${ALERT_BYTES} B) y la tira de 30 s de ECG (${STRIP_BYTES.toLocaleString("es-ES")} B).`,
      tone: ev.alertClass === 1 ? "critical" : ev.alertClass === 2 ? "warn" : "info",
      focus: "wearable",
    });
  }

  private isReal(code: EventCode, rhythm: Rhythm): boolean | null {
    switch (code) {
      case "vt":
        return rhythm === "vt";
      case "af":
      case "afRapid":
        return rhythm === "af";
      case "pause":
        return rhythm === "pause" || this.patient.heartStateAt(this.ctx.scheduler.now - 3).rhythm === "pause";
      case "brady":
      case "severeBrady":
        return rhythm === "brady";
      case "leadOff":
        return true;
      default:
        return null;
    }
  }

  /** Vibración y tono: el aviso local no depende de ninguna red. */
  localAlarm(t: number, alert?: AlertRecord): void {
    const at = t + 0.05;
    this.vibratingUntil = at + 20;
    this.battery.drain(VIBRATION.currentMa + BUZZER.currentMa, VIBRATION.seconds);
    this.chargeByBlock.events += (VIBRATION.currentMa + BUZZER.currentMa) * VIBRATION.seconds;
    if (alert) {
      alert.localAlarmAt = at;
      this.metrics.localAlarmDelays.push(at - alert.detectedAt);
    }
  }

  /** El paciente pulsa el botón de síntomas. */
  pressSymptomButton(t: number): void {
    this.hour.symptoms++;
    const alert: AlertRecord = {
      id: `A${String(this.seq).padStart(4, "0")}`,
      code: "symptom",
      alertClass: 2,
      title: "Evento sintomático (botón)",
      detectedAt: t,
      hr: this.recentWindows.at(-1)?.hr ?? 0,
      confidence: 1,
      real: null,
      origin: "wearable",
      escalations: [],
      status: "open",
    };
    this.alertSink(alert);
    this.sendAlert(t, alert);
    this.sendStrip(t, "symptom", alert);
  }

  private sendAlert(t: number, alert: AlertRecord): void {
    if (this.mode === "raw") return;
    const bytes = encodeAlert({
      seq: this.seq,
      code: alert.code,
      alertClass: alert.alertClass,
      detectedAt: alert.detectedAt,
      hr: alert.hr,
      confidence: alert.confidence,
      sqi: 1,
    });
    this.send({ kind: "alert", seq: this.seq++, bytes, createdAt: t, alert }, true);
  }

  private sendStrip(t: number, code: EventCode, alert?: AlertRecord): void {
    if (this.mode === "raw" || this.off) return;
    const start = t - STRIP_SECONDS;
    const bytes = encodeStrip(this.stripSamples(start), start, EVENT_CODES[code], this.seq);
    this.send({ kind: "strip", seq: this.seq++, bytes, createdAt: t, code, startTime: start, alert });
  }

  /** Últimos 30 s de ECG: se sintetizan a partir de los latidos guardados. */
  private stripSamples(start: number): Float32Array {
    const out = new Float32Array(STRIP_SECONDS * ECG_FS);
    const synth = new EcgSynth(this.ctx.rng.fork(`strip-${Math.round(start)}`));
    const block = new Float32Array(ECG_FS);
    for (let s = 0; s < STRIP_SECONDS; s++) {
      const t0 = start + s;
      const heart = this.patient.heartStateAt(t0);
      synth.render(
        t0,
        this.beats.filter((b) => b.t > t0 - 0.6 && b.t < t0 + 1.4),
        {
          condition: this.patient.conditionAt(t0),
          activity: this.patient.activityAt(t0),
          respRate: heart.respRate,
          fibrillation: heart.rhythm === "af",
        },
        block,
      );
      out.set(block, s * ECG_FS);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Medidas periódicas y vector horario
  // -------------------------------------------------------------------------

  private measureImpedance(t: number): void {
    if (this.off || this.alarmOnly) return;
    const z = this.patient.thoracicImpedance(t);
    this.hour.imp.push(z);
    if (this.patient.postureAt(t) === "supine") this.hour.supineImp++;
    this.hour.resp.push(this.patient.respRateAt(t) + this.ctx.rng.normal(0, 0.5));
    this.hour.temp.push(this.patient.skinTemperature(t));
  }

  private sendVector(t: number): void {
    const h = this.hour;
    this.hour = newHour(t);
    if (this.off || this.mode === "raw") return;
    const modePosture = (() => {
      const counts = [0, 0, 0, 0];
      for (const p of h.posture) counts[p]++;
      return counts.indexOf(Math.max(...counts));
    })();
    const vector: HourlyVector = {
      seq: this.seq,
      hourStart: h.start,
      hrMean: mean(h.hrs),
      hrMin: h.hrs.length ? Math.min(...h.hrs) : 0,
      hrMax: h.hrs.length ? Math.max(...h.hrs) : 0,
      rmssdMs: mean(h.rmssd),
      sdnnMs: mean(h.sdnn),
      classWindows: h.classWindows,
      pauseEvents: h.pauses,
      bradyEvents: h.bradys,
      respRate: mean(h.resp),
      impedanceMean: mean(h.imp),
      impedanceMin: h.imp.length ? Math.min(...h.imp) : 0,
      activity: mean(h.activity),
      posture: modePosture,
      sqiMean: mean(h.sqi),
      temperature: mean(h.temp),
      batteryPct: this.battery.socPct,
      rssiMean: mean(h.rssi),
      symptomPresses: h.symptoms,
      leadOffSeconds: h.leadOff,
      supineImpedanceCount: h.supineImp,
      flags: (h.leadOff > 0 ? 1 : 0) | (this.battery.socPct < 20 ? 2 : 0) | (this.flash.length > 0 ? 4 : 0),
    };
    const bytes = encodeVector(vector);
    this.send({ kind: "vector", seq: this.seq++, bytes, createdAt: t, vector });
    this.ctx.narrate(
      {
        level: "N3",
        title: "Vector horario (64 bytes)",
        text: `Cada hora el wearable resume ${RHYTHM_CLASSES.reduce((a, c) => a + h.classWindows[c], 0)} ventanas en 64 bytes: FC media ${vector.hrMean.toFixed(0)} lpm, variabilidad, minutos de cada ritmo, impedancia, respiración, actividad y batería. Es también su mensaje de presencia. Enviar la señal de esa hora en bruto serían ${((RAW_BYTES_PER_SECOND * 3600) / 1e6).toFixed(1).replace(".", ",")} MB.`,
        tone: "info",
        focus: "wearable",
      },
      "vector",
    );
  }

  // -------------------------------------------------------------------------
  // Envío por BLE y almacenamiento sin conexión
  // -------------------------------------------------------------------------

  private messageBytes(msg: BleMessage): number {
    return msg.kind === "raw" ? msg.size : msg.bytes.length;
  }

  private send(msg: BleMessage, priority = false): void {
    if (!this.ble.connected) {
      if (priority) this.flash.unshift(msg);
      else this.flash.push(msg);
      // Capacidad de la flash: 72 h; si se llena se descartan los mensajes en bruto más antiguos.
      if (this.flash.length > 5000)
        this.flash.splice(
          this.flash.findIndex((m) => m.kind === "raw"),
          1,
        );
      this.metrics.storedAndForwarded++;
      return;
    }
    this.transmit(msg);
  }

  private transmit(msg: BleMessage, note?: string): void {
    const now = this.ctx.scheduler.now;
    const bytes = this.messageBytes(msg);
    const coded = this.ble.phy === "coded";
    const start = Math.max(now, this.bleBusyUntil);
    const arrival = start + this.ble.uplinkDelay(bytes);
    this.bleBusyUntil = start + this.ble.airtime(bytes);
    if (this.mode === "edge") {
      const q = radioByteCharge(bytes, coded);
      this.battery.drainCharge(q);
      this.chargeByBlock.radio += q;
      this.consumedMas += q;
    }
    this.metrics.addBle(msg.kind, bytes);
    this.ble.bytesUp += bytes;
    const labels: Record<BleMessage["kind"], string> = {
      vector: `Vector horario (${VECTOR_BYTES} B)`,
      alert: `Alerta (${ALERT_BYTES} B)`,
      strip: `Tira de ECG de 30 s (${STRIP_BYTES} B)`,
      raw: `Señales en bruto (${bytes} B)`,
    };
    this.ctx.transmit({
      link: "ble",
      from: "wearable",
      to: "station",
      kind: msg.kind,
      label: labels[msg.kind],
      bytes,
      payloadBytes: bytes,
      tStart: start,
      tEnd: arrival,
      note,
      details:
        msg.kind === "raw"
          ? undefined
          : {
              hex: Array.from(msg.bytes.subarray(0, 48), (b) => b.toString(16).padStart(2, "0")).join(" "),
              notes:
                msg.kind === "vector"
                  ? [`FC media ${msg.vector.hrMean.toFixed(1)} lpm`, `Batería ${msg.vector.batteryPct.toFixed(0)} %`]
                  : undefined,
            },
    });
    this.ctx.scheduler.at(arrival, "ble-rx", (t) => {
      if (!this.ble.connected) {
        // La conexión cayó durante la transferencia: el mensaje vuelve a la flash.
        this.flash.unshift(msg);
        return;
      }
      this.receiver?.onBleMessage(msg, t);
    });
  }

  /** Al reconectar, envía lo guardado: primero alertas, luego el resto por orden. */
  flushBuffer(): number {
    if (!this.ble.connected || this.flash.length === 0) return 0;
    const pending = this.flash.splice(0);
    pending.sort((a, b) => (a.kind === "alert" ? -1 : 0) - (b.kind === "alert" ? -1 : 0) || a.createdAt - b.createdAt);
    for (const msg of pending) this.transmit(msg, "Enviado tras reconectar");
    return pending.length;
  }

  // -------------------------------------------------------------------------
  // Energía
  // -------------------------------------------------------------------------

  /** Corriente instantánea de cada bloque, mA. */
  currentBreakdown(): CurrentBreakdown {
    const p = this.ctx.params;
    const base = { ...CURRENT_TABLE[p.wearable.mode] };
    if (p.wearable.mode === "edge") {
      base.radio = this.ble.connected
        ? radioKeepAliveCurrent(p.ble.connIntervalS, p.ble.peripheralLatency, this.ble.phy === "coded")
        : ADVERTISING_CURRENT;
    }
    if (this.alarmOnly) {
      base.bioimpedance = 0;
      base.accelTemp = 0;
    }
    return base;
  }

  private integrateEnergy(seconds: number): void {
    const b = this.currentBreakdown();
    for (const k of Object.keys(b) as (keyof CurrentBreakdown)[]) this.chargeByBlock[k] += b[k] * seconds;
    const i = totalCurrent(b);
    this.battery.drain(i, seconds);
    this.consumedMas += i * seconds;
    this.elapsed += seconds;
  }

  /** Corriente media desde el inicio, incluidos envíos y vibraciones, mA. */
  get averageCurrent(): number {
    const total = Object.values(this.chargeByBlock).reduce((a, b) => a + b, 0);
    return this.elapsed > 0 ? total / this.elapsed : totalCurrent(this.currentBreakdown());
  }

  /** Corriente media por bloque desde el inicio, mA. */
  averageBreakdown(): Record<keyof CurrentBreakdown | "events", number> {
    const out = { ...this.chargeByBlock };
    for (const k of Object.keys(out) as (keyof typeof out)[]) out[k] = this.elapsed > 0 ? out[k] / this.elapsed : 0;
    return out;
  }

  /** Autonomía estimada con la batería llena y la corriente media, días. */
  get projectedAutonomyDays(): number {
    return Battery.autonomyDays(this.battery.usableMah, this.averageCurrent);
  }

  private checkBattery(t: number): void {
    const soc = this.battery.socPct;
    for (const level of [20, 10, 5]) {
      if (soc <= level && !this.lowBatteryNotified.has(level)) {
        this.lowBatteryNotified.add(level);
        if (level === 5) this.alarmOnly = true;
        this.ctx.narrate(
          {
            level: "N1",
            title: `Batería del wearable al ${level} %`,
            text:
              level === 5
                ? "El wearable pasa a modo de solo alarmas: apaga la bioimpedancia y el acelerómetro y mantiene el ECG y la detección de arritmias."
                : level === 10
                  ? "Avisa al paciente y la plataforma crea una tarea para enfermería: hay que cargarlo."
                  : "El wearable avisa al paciente con un pitido para que lo cargue esta noche.",
            tone: level === 5 ? "critical" : "warn",
            focus: "wearable",
          },
          `battery-${level}`,
        );
        if (level === 10) {
          const alert: AlertRecord = {
            id: `A${String(this.seq).padStart(4, "0")}`,
            code: "lowBattery",
            alertClass: 3,
            title: "Batería del wearable baja (10 %)",
            detectedAt: t,
            hr: 0,
            confidence: 1,
            real: true,
            origin: "wearable",
            escalations: [],
            status: "open",
          };
          this.alertSink(alert);
          this.sendAlert(t, alert);
        }
      }
    }
    if (this.battery.empty && !this.off) {
      this.off = true;
      this.ctx.narrate(
        {
          level: "N1",
          title: "Wearable sin batería",
          text: "El wearable se apaga: deja de detectar. La plataforma lo notará porque falta el vector horario (función T4).",
          tone: "critical",
          focus: "wearable",
        },
        "battery-empty",
      );
    }
  }

  /** Activa la alarma local por orden remota (escenario base: la decide la nube). */
  remoteAlarm(t: number, alert: AlertRecord): void {
    this.localAlarm(t, alert);
  }

  /** Hora actual del día (para la interfaz). */
  get hourOfDay(): number {
    return hourOfDay(this.ctx.scheduler.now);
  }
}
