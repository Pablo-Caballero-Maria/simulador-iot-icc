/**
 * Lógica de actuación del wearable (apartado 6.11 de la memoria).
 *
 * Clase 1 (crítica, aviso local inmediato):
 *   - taquiarritmia ventricular en dos ventanas seguidas con FC > umbral y señal válida;
 *   - pausa ≥ 4 s;
 *   - bradicardia < 30 lpm sostenida (dos ventanas).
 * Clase 2 (revisión en ≤ 4 h):
 *   - FA nueva ≥ 30 s;
 *   - FA con respuesta > 110 lpm durante 10 min;
 *   - bradicardia < 40 lpm ≥ 30 s.
 * Clase 3 (técnica): electrodo desconectado más de 1 min.
 *
 * Las pausas y las bradicardias se detectan con reglas independientes de la
 * red neuronal, como exige el análisis de riesgos.
 */
import type { RhythmClass } from "./classes";
import type { EventCode } from "./payloads";
import { WINDOW_SECONDS, type WindowFeatures } from "./features";

export interface RuleConfig {
  vtHrThreshold: number;
  afMinSeconds: number;
  pauseSeconds: number;
}

export interface RuleEvent {
  code: EventCode;
  alertClass: 1 | 2 | 3;
  /** Instante en que se cumple la condición. */
  t: number;
  hr: number;
  confidence: number;
  sqi: number;
  title: string;
}

/** Calidad mínima para dar por válida una ventana. */
const MIN_SQI = 0.5;

export class RuleEngine {
  private vtRun = 0;
  private vtFired = false;
  private afRun = 0;
  private afFired = false;
  private afRapidRun = 0;
  private afRapidFired = false;
  private severeBradyRun = 0;
  private severeBradyFired = false;
  private bradyRun = 0;
  private bradyFired = false;
  private pauseFired = false;
  private leadOffSince: number | null = null;
  private leadOffFired = false;

  constructor(private readonly cfg: RuleConfig) {}

  /** Evalúa una ventana clasificada. */
  onWindow(t: number, cls: RhythmClass, confidence: number, f: WindowFeatures): RuleEvent[] {
    const out: RuleEvent[] = [];
    const valid = f.sqi >= MIN_SQI;

    // Taquiarritmia ventricular: dos ventanas seguidas.
    if (valid && cls === "vt" && f.hr > this.cfg.vtHrThreshold) this.vtRun++;
    else {
      this.vtRun = 0;
      if (cls !== "vt") this.vtFired = false;
    }
    if (this.vtRun >= 2 && !this.vtFired) {
      this.vtFired = true;
      out.push(this.event("vt", 1, t, f, confidence, "Taquiarritmia ventricular"));
    }

    // Fibrilación auricular nueva de al menos `afMinSeconds`.
    if (valid && cls === "af") this.afRun++;
    else if (cls !== "noise") {
      this.afRun = 0;
      this.afFired = false;
      this.afRapidRun = 0;
      this.afRapidFired = false;
    }
    if (!this.afFired && this.afRun * WINDOW_SECONDS >= this.cfg.afMinSeconds) {
      this.afFired = true;
      out.push(this.event("af", 2, t, f, confidence, "Fibrilación auricular"));
    }
    if (valid && cls === "af" && f.hr > 110) this.afRapidRun++;
    else if (cls !== "noise") this.afRapidRun = 0;
    if (!this.afRapidFired && this.afRapidRun * WINDOW_SECONDS >= 600) {
      this.afRapidFired = true;
      out.push(this.event("afRapid", 2, t, f, confidence, "FA con respuesta rápida (> 110 lpm, 10 min)"));
    }

    // Bradicardias (reglas independientes de la red).
    const beatsOk = valid && f.beatCount >= 2;
    if (beatsOk && f.hr < 30) this.severeBradyRun++;
    else {
      this.severeBradyRun = 0;
      if (beatsOk) this.severeBradyFired = false;
    }
    if (this.severeBradyRun >= 2 && !this.severeBradyFired) {
      this.severeBradyFired = true;
      out.push(this.event("severeBrady", 1, t, f, 1, "Bradicardia extrema (< 30 lpm)"));
    }
    if (beatsOk && f.hr < 40) this.bradyRun++;
    else {
      this.bradyRun = 0;
      if (beatsOk) this.bradyFired = false;
    }
    if (this.bradyRun * WINDOW_SECONDS >= 30 && !this.bradyFired && !this.severeBradyFired) {
      this.bradyFired = true;
      out.push(this.event("brady", 2, t, f, 1, "Bradicardia (< 40 lpm, ≥ 30 s)"));
    }
    return out;
  }

  /**
   * Comprobación de cada segundo: pausa sin latidos y electrodo desconectado.
   * `lastBeatT` es el último QRS detectado.
   */
  onSecond(t: number, lastBeatT: number | null, leadOff: boolean, warmingUp: boolean): RuleEvent[] {
    const out: RuleEvent[] = [];
    if (leadOff) {
      this.leadOffSince ??= t;
      if (!this.leadOffFired && t - this.leadOffSince >= 60) {
        this.leadOffFired = true;
        out.push({
          code: "leadOff",
          alertClass: 3,
          t,
          hr: 0,
          confidence: 1,
          sqi: 0,
          title: "Electrodo desconectado",
        });
      }
      return out;
    }
    this.leadOffSince = null;
    this.leadOffFired = false;
    if (warmingUp || lastBeatT === null) return out;
    const gap = t - lastBeatT;
    if (gap >= this.cfg.pauseSeconds && !this.pauseFired) {
      this.pauseFired = true;
      out.push({
        code: "pause",
        alertClass: 1,
        t: lastBeatT + this.cfg.pauseSeconds,
        hr: 0,
        confidence: 1,
        sqi: 1,
        title: `Pausa ≥ ${this.cfg.pauseSeconds} s`,
      });
    } else if (gap < 2) {
      this.pauseFired = false;
    }
    return out;
  }

  private event(
    code: EventCode,
    alertClass: 1 | 2 | 3,
    t: number,
    f: WindowFeatures,
    confidence: number,
    title: string,
  ): RuleEvent {
    return { code, alertClass, t, hr: f.hr, confidence, sqi: f.sqi, title };
  }
}
