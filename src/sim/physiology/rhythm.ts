/**
 * Ritmo cardíaco a nivel de latido.
 *
 * El modelo genera los instantes de cada latido (la «verdad» de la
 * simulación) según el ritmo vigente. A partir de ellos se sintetiza la señal
 * de ECG (ecg.ts) y se evalúa el clasificador del wearable.
 */
import type { Rng } from "../core/rng";

/** Ritmos que puede presentar el paciente simulado. */
export type Rhythm = "sinus" | "af" | "vt" | "ectopy" | "pause" | "brady";

/** Calidad de la señal: limpia, con artefactos de movimiento o electrodo desconectado. */
export type SignalCondition = "clean" | "noisy" | "lead-off";

/** Morfología del latido: conducido (QRS estrecho) o ventricular (QRS ancho). */
export type BeatMorph = "N" | "V";

export interface Beat {
  /** Instante del pico R, s. */
  t: number;
  morph: BeatMorph;
  /** Tiene onda P (no la tiene en FA ni en latidos ventriculares). */
  p: boolean;
}

export const RHYTHM_LABELS: Record<Rhythm, string> = {
  sinus: "Ritmo sinusal",
  af: "Fibrilación auricular",
  vt: "Taquicardia ventricular",
  ectopy: "Extrasístoles frecuentes",
  pause: "Pausa (asistolia)",
  brady: "Bradicardia",
};

/** Estado del corazón en un instante, que proporciona el modelo de paciente. */
export interface HeartState {
  rhythm: Rhythm;
  /** Frecuencia objetivo del ritmo vigente, lpm. */
  hr: number;
  /** Fin del episodio actual (para saltar las pausas), s. */
  episodeEnd: number;
  /** Frecuencia respiratoria, rpm (modula el intervalo RR en ritmo sinusal). */
  respRate: number;
}

/** Probabilidad de que un latido sea una extrasístole ventricular en el ritmo «ectopy». */
const PVC_PROBABILITY = 0.2;

/**
 * Generador de latidos. Avanza latido a latido y nunca retrocede, de modo que
 * puede alimentar a la vez la síntesis de señal y las métricas.
 */
export class BeatGenerator {
  private last: Beat;
  private pending: Beat | null = null;
  private compensatoryPending = false;
  private normalRr = 0.9;
  private prematureRr = 0.5;

  constructor(
    private readonly rng: Rng,
    startTime: number,
  ) {
    this.last = { t: startTime, morph: "N", p: true };
  }

  /** Último latido generado. */
  get lastBeat(): Beat {
    return this.last;
  }

  /**
   * Genera todos los latidos con instante ≤ `until` y los añade a `out`.
   * `stateAt` devuelve el estado del corazón en un instante dado.
   */
  generate(until: number, stateAt: (t: number) => HeartState, out: Beat[]): void {
    for (let guard = 0; guard < 100000; guard++) {
      const next = this.pending ?? this.nextBeat(stateAt);
      if (next.t > until) {
        // Se guarda para entregarlo en la próxima llamada sin volver a sortearlo.
        this.pending = next;
        return;
      }
      this.pending = null;
      this.last = next;
      out.push(next);
    }
  }

  private nextBeat(stateAt: (t: number) => HeartState): Beat {
    const prev = this.last;
    const s0 = stateAt(prev.t);
    const base = 60 / Math.max(s0.hr, 15);
    let t: number;
    let ectopic = false;

    switch (s0.rhythm) {
      case "pause":
        t = Math.max(s0.episodeEnd, prev.t + 0.3);
        break;
      case "af":
        // Irregularmente irregular: gran dispersión sin patrón.
        t = prev.t + clamp(base * (1 + this.rng.normal(0, 0.22)), 0.3, 1.8);
        break;
      case "vt":
        t = prev.t + clamp(base * (1 + this.rng.normal(0, 0.015)), 0.25, 0.6);
        break;
      case "ectopy": {
        const sinus = this.sinusRr(base, s0, prev.t);
        if (this.compensatoryPending) {
          // Pausa compensadora: los dos RR alrededor de la extrasístole suman unos 2 RR normales.
          t = prev.t + clamp(2 * this.normalRr - this.prematureRr, 0.5, 2.5);
          this.compensatoryPending = false;
        } else if (this.rng.chance(PVC_PROBABILITY)) {
          this.normalRr = sinus;
          this.prematureRr = sinus * 0.6;
          t = prev.t + this.prematureRr;
          ectopic = true;
          this.compensatoryPending = true;
        } else {
          this.normalRr = sinus;
          t = prev.t + sinus;
        }
        break;
      }
      default:
        t = prev.t + this.sinusRr(base, s0, prev.t);
    }

    // Si en el intervalo empieza una pausa, el latido no llega hasta que termina.
    let s1 = stateAt(t);
    if (s1.rhythm === "pause") {
      t = Math.max(s1.episodeEnd, t);
      s1 = stateAt(t);
    }
    if (s1.rhythm === "vt" || ectopic) return { t, morph: "V", p: false };
    if (s1.rhythm === "af") return { t, morph: "N", p: false };
    return { t, morph: "N", p: true };
  }

  private sinusRr(base: number, state: HeartState, t: number): number {
    // Arritmia sinusal respiratoria y variabilidad aleatoria.
    const resp = 0.035 * Math.sin((2 * Math.PI * state.respRate * t) / 60);
    return clamp(base * (1 + resp + this.rng.normal(0, 0.012)), 0.3, 2.4);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
