/**
 * Índice de congestión que calcula la estación cada mañana (RF-05).
 *
 * Compara cuatro señales con la línea basal del propio paciente:
 *   - peso: media de los 3 últimos días frente a la de los 7 anteriores;
 *   - impedancia nocturna en decúbito frente a la media de 14 noches (cae al
 *     acumularse líquido); las noches de las 48 h siguientes a un cambio de
 *     parche no entran en la línea basal y la de las primeras 24 h no se compara;
 *   - frecuencia respiratoria nocturna frente a su media de 14 noches;
 *   - actividad diurna frente a su media de 14 días.
 * Cada término se normaliza con el cambio que se considera significativo
 * (1,5 kg, 6 %, 3 rpm, 25 %), se limita a [0, 1,5] y se pondera.
 */
import { mean } from "../core/stats";

export interface DayRecord {
  day: number;
  /** Peso válido de la mañana, kg. */
  weight?: number;
  /** Impedancia media nocturna en decúbito, Ω. */
  nightImpedance?: number;
  nightResp?: number;
  dayActivity?: number;
  /** La noche cae en las 48 h siguientes a un cambio de parche: no entra en la línea basal. */
  patchExcluded?: boolean;
  /** La noche cae en las 24 h siguientes: tampoco se compara (los electrodos aún se asientan). */
  patchRecent?: boolean;
}

export interface CongestionResult {
  day: number;
  index: number;
  deltaWeightKg: number;
  deltaImpedancePct: number;
  deltaRespRpm: number;
  deltaActivityPct: number;
  /** Datos insuficientes para alguno de los términos. */
  partial: boolean;
}

export const CONGESTION_WEIGHTS = { weight: 0.3, impedance: 0.35, resp: 0.2, activity: 0.15 } as const;
export const CONGESTION_SCALES = { weightKg: 1.5, impedancePct: 6, respRpm: 3, activityPct: 25 } as const;

const norm = (v: number, scale: number) => Math.min(1.5, Math.max(0, v / scale));

export function congestionIndex(history: readonly DayRecord[], day: number): CongestionResult {
  const byDay = new Map(history.map((r) => [r.day, r]));
  const vals = (from: number, to: number, pick: (r: DayRecord) => number | undefined, skipPatch = false) => {
    const out: number[] = [];
    for (let d = from; d <= to; d++) {
      const r = byDay.get(d);
      if (!r || (skipPatch && r.patchExcluded)) continue;
      const v = pick(r);
      if (v !== undefined && Number.isFinite(v)) out.push(v);
    }
    return out;
  };

  let partial = false;
  const recentW = vals(day - 2, day, (r) => r.weight);
  const baseW = vals(day - 9, day - 3, (r) => r.weight);
  const deltaWeightKg = recentW.length && baseW.length ? mean(recentW) - mean(baseW) : ((partial = true), 0);

  const today = byDay.get(day);
  const baseZ = vals(day - 14, day - 1, (r) => r.nightImpedance, true);
  const zNight = today?.patchRecent ? undefined : today?.nightImpedance;
  const deltaImpedancePct =
    zNight !== undefined && baseZ.length >= 5 ? ((mean(baseZ) - zNight) / mean(baseZ)) * 100 : ((partial = true), 0);

  const baseR = vals(day - 14, day - 1, (r) => r.nightResp);
  const deltaRespRpm =
    today?.nightResp !== undefined && baseR.length >= 5 ? today.nightResp - mean(baseR) : ((partial = true), 0);

  const yesterday = byDay.get(day - 1);
  const baseA = vals(day - 15, day - 2, (r) => r.dayActivity);
  const deltaActivityPct =
    yesterday?.dayActivity !== undefined && baseA.length >= 5
      ? ((mean(baseA) - yesterday.dayActivity) / mean(baseA)) * 100
      : ((partial = true), 0);

  const w = CONGESTION_WEIGHTS;
  const s = CONGESTION_SCALES;
  const raw =
    w.weight * norm(deltaWeightKg, s.weightKg) +
    w.impedance * norm(deltaImpedancePct, s.impedancePct) +
    w.resp * norm(deltaRespRpm, s.respRpm) +
    w.activity * norm(deltaActivityPct, s.activityPct);
  return {
    day,
    index: Math.min(100, Math.round(100 * raw)),
    deltaWeightKg,
    deltaImpedancePct,
    deltaRespRpm,
    deltaActivityPct,
    partial,
  };
}
