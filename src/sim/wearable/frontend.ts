/**
 * «Front-end» del wearable: convierte el corazón simulado en latidos
 * detectados y en un índice de calidad por ventana.
 *
 * Hay dos resoluciones con la misma interfaz:
 * - SignalFrontEnd sintetiza el ECG a 256 Hz y ejecuta el detector de
 *   Pan–Tompkins sobre la señal, como el firmware real.
 * - BeatFrontEnd trabaja con los instantes de los latidos y aplica un modelo
 *   estadístico del detector (aciertos, fallos y falsos positivos calibrados
 *   con la ruta de señal). Permite simular días en segundos.
 */
import type { Rng } from "../core/rng";
import { ECG_FS, EcgSynth, beatTemplate, type EcgContext } from "../physiology/ecg";
import type { Beat, BeatMorph, SignalCondition } from "../physiology/rhythm";
import { PanTompkins, measureQrsWidth, type DetectedBeat } from "./dsp";
import { computeFeatures, signalQualityIndex, type WindowFeatures } from "./features";

export interface FrontEndInput {
  /** Inicio del bloque de 1 s. */
  t0: number;
  /** Latidos reales que pueden influir en el bloque. */
  beats: readonly Beat[];
  ctx: EcgContext;
}

export interface FrontEnd {
  readonly kind: "signal" | "beat";
  /** Procesa un bloque de 1 s y devuelve los QRS detectados en él. */
  processSecond(input: FrontEndInput): DetectedBeat[];
  /** Calidad de la señal desde la última llamada (y reinicia el acumulador). */
  takeWindowSqi(windowBeats: readonly DetectedBeat[]): number;
  /** `true` mientras el detector todavía está aprendiendo sus umbrales. */
  warmingUp(t: number): boolean;
}

/** Ruta de señal completa: síntesis a 256 Hz + Pan–Tompkins. */
export class SignalFrontEnd implements FrontEnd {
  readonly kind = "signal" as const;
  private readonly synth: EcgSynth;
  private readonly detector = new PanTompkins();
  private readonly raw = new Float32Array(ECG_FS);
  private readonly cond = new Float32Array(ECG_FS);
  private windowCond: number[] = [];
  private windowT0: number | null = null;
  private leadOffSeen = false;
  private readonly startedAt: number;
  /** Últimos 10 s de señal acondicionada y su instante inicial, para mostrar en pantalla. */
  readonly display = new Float32Array(ECG_FS * 10);
  displayEnd = 0;

  constructor(rng: Rng, startedAt: number) {
    this.synth = new EcgSynth(rng);
    this.startedAt = startedAt;
  }

  processSecond({ t0, beats, ctx }: FrontEndInput): DetectedBeat[] {
    this.synth.render(t0, beats, ctx, this.raw);
    const detected = this.detector.processBlock(t0, this.raw, this.cond);
    if (this.windowT0 === null) this.windowT0 = t0;
    for (let i = 0; i < this.cond.length; i++) this.windowCond.push(this.cond[i]);
    if (ctx.condition === "lead-off") this.leadOffSeen = true;
    // Desplaza el buffer de visualización y añade el bloque nuevo.
    this.display.copyWithin(0, ECG_FS);
    this.display.set(this.cond, this.display.length - ECG_FS);
    this.displayEnd = t0 + 1;
    return detected;
  }

  takeWindowSqi(windowBeats: readonly DetectedBeat[]): number {
    const sqi = signalQualityIndex(
      Float32Array.from(this.windowCond),
      this.windowT0 ?? 0,
      ECG_FS,
      windowBeats,
      this.leadOffSeen,
    );
    this.windowCond = [];
    this.windowT0 = null;
    this.leadOffSeen = false;
    return sqi;
  }

  warmingUp(t: number): boolean {
    return t - this.startedAt < 3;
  }
}

/** Anchura del QRS medida sobre la plantilla limpia de cada morfología (se calcula una vez). */
const TEMPLATE_WIDTH: Record<BeatMorph, number> = (() => {
  const out = {} as Record<BeatMorph, number>;
  for (const morph of ["N", "V"] as const) {
    const { samples, rIndex } = beatTemplate(morph, morph === "N");
    out[morph] = measureQrsWidth(samples, rIndex, ECG_FS, false);
  }
  return out;
})();

/** Probabilidad de detectar un latido real según la calidad de la señal. */
const DETECT_PROB: Record<SignalCondition, number> = { clean: 0.997, noisy: 0.82, "lead-off": 0 };
/** Falsos QRS por segundo según la calidad de la señal. */
const FALSE_RATE: Record<SignalCondition, number> = { clean: 0.0005, noisy: 0.6, "lead-off": 1.4 };

/** Ruta rápida: modelo estadístico del detector sobre los latidos reales. */
export class BeatFrontEnd implements FrontEnd {
  readonly kind = "beat" as const;
  private secondsInWindow = 0;
  private noisySeconds = 0;
  private leadOffSeconds = 0;
  private activitySum = 0;

  constructor(private readonly rng: Rng) {}

  processSecond({ t0, beats, ctx }: FrontEndInput): DetectedBeat[] {
    const out: DetectedBeat[] = [];
    const pDetect = DETECT_PROB[ctx.condition];
    for (const b of beats) {
      if (b.t < t0 || b.t >= t0 + 1) continue;
      if (!this.rng.chance(pDetect)) continue;
      out.push({
        t: b.t + this.rng.normal(0, 0.004),
        qrsWidth: TEMPLATE_WIDTH[b.morph] + this.rng.normal(0, 0.002),
        amplitude: b.morph === "V" ? 1.4 : 1.1,
      });
    }
    // Falsos positivos (artefactos que el detector toma por QRS).
    const falseCount = this.poisson(FALSE_RATE[ctx.condition]);
    for (let k = 0; k < falseCount; k++) {
      out.push({ t: t0 + this.rng.next(), qrsWidth: this.rng.uniform(0.015, 0.11), amplitude: 0.6 });
    }
    out.sort((a, b) => a.t - b.t);
    // Periodo refractario de 200 ms, como en el detector real.
    const filtered: DetectedBeat[] = [];
    for (const d of out) {
      if (filtered.length === 0 || d.t - filtered[filtered.length - 1].t > 0.2) filtered.push(d);
    }
    this.secondsInWindow++;
    if (ctx.condition === "noisy") this.noisySeconds++;
    if (ctx.condition === "lead-off") this.leadOffSeconds++;
    this.activitySum += ctx.activity;
    return filtered;
  }

  takeWindowSqi(): number {
    const n = Math.max(this.secondsInWindow, 1);
    const activity = this.activitySum / n;
    const cleanSqi = Math.min(1, Math.max(0, 1 - 0.18 * Math.max(0, activity - 0.3) + this.rng.normal(0, 0.015)));
    const noisyFraction = this.noisySeconds / n;
    let sqi = (1 - noisyFraction) * cleanSqi + noisyFraction * this.rng.uniform(0, 0.12);
    if (this.leadOffSeconds > 0) sqi = 0;
    this.secondsInWindow = 0;
    this.noisySeconds = 0;
    this.leadOffSeconds = 0;
    this.activitySum = 0;
    return sqi;
  }

  warmingUp(): boolean {
    return false;
  }

  private poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    const l = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.rng.next();
    } while (p > l);
    return k - 1;
  }
}

/**
 * Agrupa los latidos detectados en ventanas de clasificación. Los QRS se
 * detectan con unos 200 ms de retraso, así que una ventana usa todos los
 * latidos detectados desde la anterior (no solo los de su intervalo exacto):
 * así no se pierde ningún intervalo RR en las fronteras.
 */
export class WindowAnalyzer {
  private pending: DetectedBeat[] = [];
  private prev: DetectedBeat | null = null;

  constructor(private fe: FrontEnd) {}

  get frontEnd(): FrontEnd {
    return this.fe;
  }

  /** Cambia de resolución (señal ↔ latido); el siguiente análisis empieza de cero. */
  setFrontEnd(fe: FrontEnd): void {
    this.fe = fe;
    this.pending = [];
    this.prev = null;
  }

  /** Último latido detectado (para la regla de pausa). */
  get lastDetected(): DetectedBeat | null {
    return this.pending.length > 0 ? this.pending[this.pending.length - 1] : this.prev;
  }

  feedSecond(input: FrontEndInput): DetectedBeat[] {
    const detected = this.fe.processSecond(input);
    this.pending.push(...detected);
    return detected;
  }

  /** Cierra la ventana [start, end) y devuelve sus rasgos. */
  closeWindow(start: number, end: number): WindowFeatures {
    const beats = this.pending;
    const sqi = this.fe.takeWindowSqi(beats);
    const features = computeFeatures(beats, this.prev, sqi, start, end);
    if (beats.length > 0) this.prev = beats[beats.length - 1];
    this.pending = [];
    return features;
  }
}
