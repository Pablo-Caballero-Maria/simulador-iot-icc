/**
 * Síntesis de la señal de ECG de una derivación torácica.
 *
 * Cada latido se dibuja como suma de gaussianas (ondas P, Q, R, S y T), un
 * método habitual para generar ECG sintético. Se añaden las perturbaciones
 * reales de un wearable: deriva de línea base por la respiración, ruido de red
 * de 50 Hz, ruido muscular según la actividad, ondas f en la fibrilación
 * auricular y artefactos de movimiento. El resultado se cuantiza como lo haría
 * el convertidor de 16 bit del front-end.
 */
import type { Rng } from "../core/rng";
import type { Beat, BeatMorph, SignalCondition } from "./rhythm";

/** Frecuencia de muestreo del ECG en el wearable (RF-01), Hz. */
export const ECG_FS = 256;

/** Fondo de escala del convertidor: ±10 mV con 16 bit. */
export const ECG_FULL_SCALE_MV = 10;
export const ECG_LSB_MV = (2 * ECG_FULL_SCALE_MV) / 65536;

interface Wave {
  /** Desplazamiento respecto al pico R, s. */
  at: number;
  /** Anchura (desviación de la gaussiana), s. */
  width: number;
  /** Amplitud, mV. */
  amp: number;
}

/** Ondas de un latido conducido normal. `qt` escala la posición de la onda T. */
function normalWaves(qt: number, withP: boolean): Wave[] {
  const waves: Wave[] = [
    { at: -0.032, width: 0.008, amp: -0.12 },
    { at: 0, width: 0.0095, amp: 1.15 },
    { at: 0.03, width: 0.009, amp: -0.3 },
    { at: 0.24 * qt, width: 0.048, amp: 0.32 },
  ];
  if (withP) waves.unshift({ at: -0.17, width: 0.022, amp: 0.13 });
  return waves;
}

/** Ondas de un latido ventricular: QRS ancho y onda T opuesta. */
function ventricularWaves(qt: number): Wave[] {
  return [
    { at: 0, width: 0.028, amp: 1.45 },
    { at: 0.065, width: 0.03, amp: -0.55 },
    { at: 0.28 * qt, width: 0.06, amp: -0.42 },
  ];
}

/** Alcance de un latido a cada lado del pico R, s. */
const BEAT_SUPPORT_BEFORE = 0.3;
const BEAT_SUPPORT_AFTER = 0.55;

/** Contexto de la señal que el modelo de paciente proporciona para cada bloque. */
export interface EcgContext {
  condition: SignalCondition;
  /** Actividad física (0 reposo – 1 caminar), aumenta el ruido muscular. */
  activity: number;
  /** Frecuencia respiratoria, rpm (deriva de línea base). */
  respRate: number;
  /** Hay fibrilación auricular (añade ondas f). */
  fibrillation: boolean;
}

/**
 * Sintetizador con estado: mantiene la fase de las perturbaciones entre
 * bloques para que la señal sea continua.
 */
export class EcgSynth {
  private artifactLevel = 0;
  private fPhase1 = 0;
  private fPhase2 = 0;
  private wanderPhase = 0;

  constructor(private readonly rng: Rng) {}

  /**
   * Rellena `out` con `out.length` muestras a partir del instante `t0`.
   * `beats` debe contener los latidos que puedan influir en el bloque
   * (desde t0 − 0,55 s hasta el final del bloque + 0,3 s).
   */
  render(t0: number, beats: readonly Beat[], ctx: EcgContext, out: Float32Array): void {
    const n = out.length;
    const dt = 1 / ECG_FS;
    out.fill(0);

    if (ctx.condition !== "lead-off") {
      for (const beat of beats) this.addBeat(beat, t0, out);
    }

    const emgSd = 0.006 + 0.03 * ctx.activity + (ctx.condition === "noisy" ? 0.12 : 0);
    const wanderHz = Math.max(ctx.respRate, 6) / 60;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * dt;
      let v = out[i];
      if (ctx.condition === "lead-off") {
        // Electrodo suelto: la entrada queda flotando cerca de un extremo.
        v = 0.02 * this.rng.normal();
        out[i] = quantize(v);
        continue;
      }
      // Deriva de línea base con la respiración.
      this.wanderPhase += 2 * Math.PI * wanderHz * dt;
      v += 0.09 * Math.sin(this.wanderPhase) + 0.03 * Math.sin(0.37 * this.wanderPhase);
      // Interferencia de la red eléctrica (50 Hz).
      v += 0.012 * Math.sin(2 * Math.PI * 50 * t);
      // Ruido muscular.
      v += emgSd * this.rng.normal();
      // Ondas f de la fibrilación auricular (4–9 Hz, amplitud pequeña).
      if (ctx.fibrillation) {
        this.fPhase1 += 2 * Math.PI * 5.6 * dt + 0.02 * this.rng.normal();
        this.fPhase2 += 2 * Math.PI * 7.1 * dt + 0.02 * this.rng.normal();
        v += 0.045 * Math.sin(this.fPhase1) + 0.03 * Math.sin(this.fPhase2);
      }
      // Artefactos de movimiento: escalones y picos que imitan complejos QRS.
      if (ctx.condition === "noisy") {
        this.artifactLevel = 0.995 * this.artifactLevel + (this.rng.chance(0.012) ? this.rng.normal(0, 0.9) : 0);
        v += this.artifactLevel;
        if (this.rng.chance(0.006)) v += this.rng.normal(0, 1.4);
      }
      out[i] = quantize(v);
    }
  }

  private addBeat(beat: Beat, t0: number, out: Float32Array): void {
    const n = out.length;
    const first = Math.max(0, Math.ceil((beat.t - BEAT_SUPPORT_BEFORE - t0) * ECG_FS));
    const last = Math.min(n - 1, Math.floor((beat.t + BEAT_SUPPORT_AFTER - t0) * ECG_FS));
    if (first > last) return;
    const waves = beatWaves(beat.morph, beat.p, 1);
    const ampJitter = 1 + 0.03 * this.rng.normal();
    for (let i = first; i <= last; i++) {
      const dt = t0 + i / ECG_FS - beat.t;
      let v = 0;
      for (const w of waves) {
        const z = (dt - w.at) / w.width;
        v += w.amp * Math.exp(-0.5 * z * z);
      }
      out[i] += v * ampJitter;
    }
  }
}

function beatWaves(morph: BeatMorph, p: boolean, qt: number): Wave[] {
  return morph === "V" ? ventricularWaves(qt) : normalWaves(qt, p);
}

/** Cuantiza al paso del convertidor y satura en el fondo de escala. */
function quantize(mv: number): number {
  const clipped = Math.max(-ECG_FULL_SCALE_MV, Math.min(ECG_FULL_SCALE_MV - ECG_LSB_MV, mv));
  return Math.round(clipped / ECG_LSB_MV) * ECG_LSB_MV;
}

/**
 * Plantilla limpia de un latido muestreada a 256 Hz, centrada en el pico R.
 * La usa el modelo rápido (a nivel de latido) para estimar la anchura del QRS
 * con el mismo método que se aplica a la señal completa.
 */
export function beatTemplate(morph: BeatMorph, p: boolean): { samples: Float32Array; rIndex: number } {
  const before = Math.round(BEAT_SUPPORT_BEFORE * ECG_FS);
  const after = Math.round(BEAT_SUPPORT_AFTER * ECG_FS);
  const samples = new Float32Array(before + after + 1);
  const waves = beatWaves(morph, p, 1);
  for (let i = 0; i < samples.length; i++) {
    const dt = (i - before) / ECG_FS;
    let v = 0;
    for (const w of waves) {
      const z = (dt - w.at) / w.width;
      v += w.amp * Math.exp(-0.5 * z * z);
    }
    samples[i] = v;
  }
  return { samples, rIndex: before };
}
