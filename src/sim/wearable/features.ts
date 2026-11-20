/**
 * Rasgos de cada ventana de 8 s que alimentan la red neuronal del wearable.
 *
 * Son los rasgos clásicos del intervalo RR (frecuencia, variabilidad,
 * irregularidad) más la anchura del QRS y un índice de calidad de la señal:
 * con ellos se distinguen el ritmo normal, la fibrilación auricular
 * (RR irregular), la taquicardia ventricular (rápida y con QRS ancho), las
 * extrasístoles (latidos prematuros) y el ruido.
 */
import { median } from "../core/stats";
import type { DetectedBeat } from "./dsp";

/** Duración de la ventana de clasificación (RF-02), s. */
export const WINDOW_SECONDS = 8;

export const FEATURE_NAMES = [
  "FC media (lpm)",
  "RR mínimo (s)",
  "RR máximo (s)",
  "SDNN (s)",
  "RMSSD (s)",
  "Irregularidad",
  "pNN50",
  "Anchura QRS (s)",
  "Prematuros",
  "Calidad de señal",
] as const;

export const FEATURE_COUNT = FEATURE_NAMES.length;

/** Resultado del análisis de una ventana. */
export interface WindowFeatures {
  /** Vector de rasgos en el orden de FEATURE_NAMES. */
  values: number[];
  /** Latidos detectados en la ventana. */
  beatCount: number;
  /** FC media, lpm (NaN si no hay latidos suficientes). */
  hr: number;
  /** Calidad de señal (0–1). */
  sqi: number;
  /** Mayor intervalo sin latidos dentro de la ventana, s. */
  longestGap: number;
}

/**
 * Calcula los rasgos a partir de los QRS detectados en la ventana
 * [`start`, `end`). `prev` es el último latido de la ventana anterior, para
 * no perder el primer intervalo RR.
 */
export function computeFeatures(
  beats: readonly DetectedBeat[],
  prev: DetectedBeat | null,
  sqi: number,
  start: number,
  end: number,
): WindowFeatures {
  const all = prev ? [prev, ...beats] : [...beats];
  const rr: number[] = [];
  for (let i = 1; i < all.length; i++) rr.push(all[i].t - all[i - 1].t);

  // Mayor hueco sin latidos (incluye el tramo hasta el final de la ventana).
  let longestGap = 0;
  let lastT = prev ? prev.t : start;
  for (const b of beats) {
    longestGap = Math.max(longestGap, b.t - lastT);
    lastT = b.t;
  }
  longestGap = Math.max(longestGap, end - lastT);

  if (rr.length < 2) {
    // Muy pocos latidos: se codifica como ritmo muy lento con calidad dudosa.
    const hr = rr.length === 1 ? 60 / rr[0] : 60 / Math.max(longestGap, WINDOW_SECONDS);
    const width = beats.length > 0 ? median(beats.map((b) => b.qrsWidth)) : 0.03;
    return {
      values: [hr, longestGap, longestGap, 0, 0, 0, 0, width, 0, sqi],
      beatCount: beats.length,
      hr,
      sqi,
      longestGap,
    };
  }

  const meanRr = rr.reduce((a, b) => a + b, 0) / rr.length;
  const sdnn = Math.sqrt(rr.reduce((a, b) => a + (b - meanRr) ** 2, 0) / (rr.length - 1));
  const diffs: number[] = [];
  for (let i = 1; i < rr.length; i++) diffs.push(rr[i] - rr[i - 1]);
  const rmssd = Math.sqrt(diffs.reduce((a, b) => a + b * b, 0) / Math.max(diffs.length, 1));
  const irregularity = diffs.reduce((a, b) => a + Math.abs(b), 0) / Math.max(diffs.length, 1) / meanRr;
  const pnn50 = diffs.filter((d) => Math.abs(d) > 0.05).length / Math.max(diffs.length, 1);
  const medRr = median(rr);
  // Prematuro: RR < 80 % de la mediana seguido de un RR > 115 % (pausa compensadora).
  let premature = 0;
  for (let i = 0; i + 1 < rr.length; i++) if (rr[i] < 0.8 * medRr && rr[i + 1] > 1.15 * medRr) premature++;
  const prematureFraction = premature / rr.length;
  const qrsWidth = median(beats.length > 0 ? beats.map((b) => b.qrsWidth) : [prev?.qrsWidth ?? 0.03]);
  const hr = 60 / meanRr;

  return {
    values: [hr, Math.min(...rr), Math.max(...rr), sdnn, rmssd, irregularity, pnn50, qrsWidth, prematureFraction, sqi],
    beatCount: beats.length,
    hr,
    sqi,
    longestGap,
  };
}

/**
 * Índice de calidad de la señal (0–1) para la ruta de señal completa.
 * Combina la proporción de intervalos RR plausibles con el nivel de ruido de
 * la señal fuera de los complejos QRS: los artefactos de movimiento lo elevan
 * mucho, el ECG limpio lo deja bajo.
 */
export function signalQualityIndex(
  conditioned: Float32Array,
  t0: number,
  fs: number,
  beats: readonly DetectedBeat[],
  leadOff: boolean,
): number {
  if (leadOff) return 0;
  const n = conditioned.length;
  const mask = new Uint8Array(n);
  for (const b of beats) {
    const c = Math.round((b.t - t0) * fs);
    for (let k = c - Math.round(0.1 * fs); k <= c + Math.round(0.12 * fs); k++) if (k >= 0 && k < n) mask[k] = 1;
  }
  // Mediana del valor absoluto de la segunda diferencia fuera del QRS: resalta el
  // ruido de alta frecuencia y no las ondas lentas (T, línea base), y es robusta
  // frente a algún QRS no detectado.
  const diffs: number[] = [];
  for (let i = 2; i < n; i++) {
    if (!mask[i] && !mask[i - 2]) diffs.push(Math.abs(conditioned[i] - 2 * conditioned[i - 1] + conditioned[i - 2]));
  }
  const residual = diffs.length > 0 ? 1.4826 * median(diffs) : 0;
  const noiseScore = Math.max(0, Math.min(1, 1 - (residual - 0.008) / 0.035));
  let plausible = 1;
  if (beats.length >= 2) {
    let ok = 0;
    for (let i = 1; i < beats.length; i++) {
      const rr = beats[i].t - beats[i - 1].t;
      if (rr >= 0.27 && rr <= 2.2) ok++;
    }
    plausible = ok / (beats.length - 1);
  }
  return Math.max(0, Math.min(1, noiseScore * (0.4 + 0.6 * plausible)));
}
