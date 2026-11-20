/**
 * Procesado de señal del wearable: filtros IIR y detector de QRS de tipo
 * Pan–Tompkins, ambos en tiempo real (muestra a muestra y con estado), como
 * se ejecutarían en el microcontrolador.
 */
import { ECG_FS } from "../physiology/ecg";

/** Sección bicuadrática (filtro IIR de 2.º orden) en forma directa II transpuesta. */
export class Biquad {
  private z1 = 0;
  private z2 = 0;

  constructor(
    private readonly b0: number,
    private readonly b1: number,
    private readonly b2: number,
    private readonly a1: number,
    private readonly a2: number,
  ) {}

  /** Paso bajo Butterworth (Q = 1/√2), según el «Audio EQ Cookbook» de R. Bristow-Johnson. */
  static lowPass(fc: number, fs: number, q = Math.SQRT1_2): Biquad {
    const w = (2 * Math.PI * fc) / fs;
    const alpha = Math.sin(w) / (2 * q);
    const cos = Math.cos(w);
    const a0 = 1 + alpha;
    return new Biquad((1 - cos) / 2 / a0, (1 - cos) / a0, (1 - cos) / 2 / a0, (-2 * cos) / a0, (1 - alpha) / a0);
  }

  /** Paso alto Butterworth (Q = 1/√2). */
  static highPass(fc: number, fs: number, q = Math.SQRT1_2): Biquad {
    const w = (2 * Math.PI * fc) / fs;
    const alpha = Math.sin(w) / (2 * q);
    const cos = Math.cos(w);
    const a0 = 1 + alpha;
    return new Biquad((1 + cos) / 2 / a0, -(1 + cos) / a0, (1 + cos) / 2 / a0, (-2 * cos) / a0, (1 - alpha) / a0);
  }

  /** Banda eliminada (notch) centrada en `f0`. */
  static notch(f0: number, fs: number, q = 8): Biquad {
    const w = (2 * Math.PI * f0) / fs;
    const alpha = Math.sin(w) / (2 * q);
    const cos = Math.cos(w);
    const a0 = 1 + alpha;
    return new Biquad(1 / a0, (-2 * cos) / a0, 1 / a0, (-2 * cos) / a0, (1 - alpha) / a0);
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  reset(): void {
    this.z1 = 0;
    this.z2 = 0;
  }
}

/** Cadena de filtros: paso banda 0,5–40 Hz y rechazo de 50 Hz (señal para mostrar y medir). */
export class EcgConditioner {
  private readonly stages: Biquad[];

  constructor(fs = ECG_FS) {
    this.stages = [Biquad.highPass(0.5, fs), Biquad.lowPass(40, fs), Biquad.notch(50, fs)];
  }

  process(x: number): number {
    let y = x;
    for (const s of this.stages) y = s.process(y);
    return y;
  }
}

/** Un QRS detectado. */
export interface DetectedBeat {
  /** Instante estimado del pico R, s. */
  t: number;
  /** Anchura estimada del QRS, s. */
  qrsWidth: number;
  /** Amplitud del pico R en la señal filtrada, mV. */
  amplitude: number;
}

/** Duración de la ventana de integración de Pan–Tompkins (150 ms). */
const MWI_SECONDS = 0.15;
/** Periodo refractario tras un QRS (200 ms). */
const REFRACTORY = 0.2;
/** Historial de señal filtrada para localizar el pico R y medir el QRS, s. */
const HISTORY_SECONDS = 1.2;

/**
 * Detector de QRS de Pan y Tompkins (1985) adaptado a 256 Hz:
 * paso banda 5–15 Hz → derivada → cuadrado → integración de 150 ms →
 * umbrales adaptativos con periodo refractario y búsqueda hacia atrás.
 */
export class PanTompkins {
  private readonly bandHp: Biquad;
  private readonly bandLp: Biquad;
  private readonly cond = new EcgConditioner();
  private readonly deriv = new Float64Array(5);
  private readonly mwiBuf: Float64Array;
  private mwiSum = 0;
  private mwiIdx = 0;
  private readonly hist: Float32Array;
  private histIdx = 0;
  private sampleCount = 0;

  // Umbrales adaptativos (nivel de señal y de ruido de la integración).
  private spki = 0;
  private npki = 0;
  private learning = true;
  private learnMax = 0;
  private learnSum = 0;

  // Seguimiento del pico candidato.
  private inPeak = false;
  private peakVal = 0;
  private peakIdx = 0;
  private lastQrsIdx = -1e9;
  private rrAvg = 0.8;
  private lastNoisePeak = 0;

  constructor(private readonly fs = ECG_FS) {
    this.bandHp = Biquad.highPass(5, fs);
    this.bandLp = Biquad.lowPass(15, fs);
    this.mwiBuf = new Float64Array(Math.round(MWI_SECONDS * fs));
    this.hist = new Float32Array(Math.round(HISTORY_SECONDS * fs));
  }

  /** Últimas muestras de la señal acondicionada (0,5–40 Hz), para mostrar. */
  get conditionedHistory(): Float32Array {
    return this.hist;
  }

  /**
   * Procesa un bloque de muestras que empieza en el instante `t0` y devuelve
   * los QRS detectados en él.
   */
  processBlock(t0: number, samples: Float32Array, conditionedOut?: Float32Array): DetectedBeat[] {
    const out: DetectedBeat[] = [];
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i];
      const y = this.cond.process(x);
      if (conditionedOut) conditionedOut[i] = y;
      this.hist[this.histIdx] = y;
      this.histIdx = (this.histIdx + 1) % this.hist.length;

      // Paso banda estrecho para resaltar el QRS.
      const b = this.bandLp.process(this.bandHp.process(x));
      // Derivada de cinco puntos.
      const d = this.deriv;
      d[4] = d[3];
      d[3] = d[2];
      d[2] = d[1];
      d[1] = d[0];
      d[0] = b;
      const deriv = (2 * d[0] + d[1] - d[3] - 2 * d[4]) * (this.fs / 8);
      // Cuadrado e integración en ventana móvil.
      const sq = deriv * deriv;
      this.mwiSum += sq - this.mwiBuf[this.mwiIdx];
      this.mwiBuf[this.mwiIdx] = sq;
      this.mwiIdx = (this.mwiIdx + 1) % this.mwiBuf.length;
      const mwi = this.mwiSum / this.mwiBuf.length;

      const n = this.sampleCount++;
      const beat = this.detect(n, mwi, t0 + i / this.fs);
      if (beat) out.push(beat);
    }
    return out;
  }

  private detect(n: number, mwi: number, t: number): DetectedBeat | null {
    // Fase de aprendizaje: 2 s para fijar los umbrales iniciales.
    if (this.learning) {
      this.learnMax = Math.max(this.learnMax, mwi);
      this.learnSum += mwi;
      if (n >= 2 * this.fs) {
        this.spki = 0.25 * this.learnMax;
        this.npki = 0.5 * (this.learnSum / n);
        this.learning = false;
      }
      return null;
    }

    const sinceLast = (n - this.lastQrsIdx) / this.fs;
    let threshold = this.npki + 0.25 * (this.spki - this.npki);
    // Búsqueda hacia atrás simplificada: si falta un latido, se baja el umbral.
    if (sinceLast > 1.66 * this.rrAvg) threshold *= 0.5;

    if (!this.inPeak) {
      if (mwi > threshold && sinceLast > REFRACTORY) {
        this.inPeak = true;
        this.peakVal = mwi;
        this.peakIdx = n;
      } else if (mwi > this.lastNoisePeak) {
        this.lastNoisePeak = mwi;
      } else if (this.lastNoisePeak > 0 && mwi < 0.5 * this.lastNoisePeak) {
        // Pico de ruido terminado: actualiza el nivel de ruido.
        this.npki = 0.125 * this.lastNoisePeak + 0.875 * this.npki;
        this.lastNoisePeak = 0;
      }
      return null;
    }

    if (mwi > this.peakVal) {
      this.peakVal = mwi;
      this.peakIdx = n;
      return null;
    }
    if (mwi > 0.5 * this.peakVal) return null;

    // Fin del pico: es un QRS.
    this.inPeak = false;
    this.spki = 0.125 * this.peakVal + 0.875 * this.spki;
    const rr = (this.peakIdx - this.lastQrsIdx) / this.fs;
    if (rr > 0.25 && rr < 3) this.rrAvg = 0.875 * this.rrAvg + 0.125 * rr;
    this.lastQrsIdx = this.peakIdx;

    // Localiza el pico R en la señal acondicionada: el máximo de |x| en los
    // 250 ms anteriores al máximo de la integración (que llega con retraso).
    const lag = n - this.peakIdx;
    const searchLen = Math.round(0.25 * this.fs);
    const len = this.hist.length;
    let best = 0;
    let bestOffset = 0;
    for (let k = 0; k < searchLen; k++) {
      const back = lag + k + 1;
      if (back >= len) break;
      const v = this.hist[(this.histIdx - back + len * 2) % len];
      if (Math.abs(v) > Math.abs(best)) {
        best = v;
        bestOffset = back;
      }
    }
    const rTime = t - (bestOffset - 1) / this.fs;
    const qrsWidth = measureQrsWidth(
      this.hist,
      (this.histIdx - bestOffset + len * 2) % len,
      this.fs,
      true,
      bestOffset - 1,
    );
    return { t: rTime, qrsWidth, amplitude: Math.abs(best) };
  }
}

/**
 * Anchura del QRS: tiempo durante el que |x − línea base| supera el 30 % de la
 * amplitud del pico, contando hacia los dos lados desde el pico R. `buf` es un
 * buffer circular (o lineal si `circular` es falso), `rIdx` el índice del pico
 * y `maxRight` el número de muestras disponibles tras él.
 */
export function measureQrsWidth(
  buf: Float32Array,
  rIdx: number,
  fs: number,
  circular = true,
  maxRight = Number.POSITIVE_INFINITY,
): number {
  const len = buf.length;
  const at = (i: number) => (circular ? buf[((i % len) + len) % len] : buf[Math.min(Math.max(i, 0), len - 1)]);
  // Línea base: media del segmento entre 250 y 150 ms antes del pico (segmento PR).
  const b0 = Math.round(0.25 * fs);
  const b1 = Math.round(0.15 * fs);
  let base = 0;
  for (let k = b1; k <= b0; k++) base += at(rIdx - k);
  base /= b0 - b1 + 1;
  const peak = at(rIdx) - base;
  const thr = 0.3 * Math.abs(peak);
  const maxSteps = Math.round(0.2 * fs);
  let left = 0;
  while (left < maxSteps && Math.abs(at(rIdx - left - 1) - base) > thr) left++;
  let right = 0;
  const rightLimit = Math.min(maxSteps, maxRight);
  while (right < rightLimit && Math.abs(at(rIdx + right + 1) - base) > thr) right++;
  return (left + right + 1) / fs;
}
