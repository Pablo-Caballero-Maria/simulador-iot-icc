/**
 * Experimentos sin interfaz que repiten los resultados de la memoria. Los usan `npm run results`
 * (scripts/run-scenarios.ts) y la página «Cómo funciona», que los ejecuta en el navegador dentro
 * de un Web Worker.
 */
import { DAY } from "./core/time";
import { DEFAULT_PARAMS } from "./params";
import { Simulation } from "./simulation";

/** Cifras de una «semana normal» con una semilla (apartado 7 de la memoria), sin redondear. */
export interface NormalWeekRun {
  seed: number;
  days: number;
  /** Bytes BLE y WAN (facturables) por día, y la carga útil WAN por día. */
  blePerDay: number;
  wanPerDay: number;
  payloadPerDay: number;
  /** Autonomía estimada del wearable, días, y su corriente media, mA. */
  autonomy: number;
  current: number;
  /** Acierto del clasificador (0–1) y ventanas clasificadas. */
  accuracy: number;
  windows: number;
  /** Falsas alertas que llegaron a la consola, y alertas críticas. */
  falseAlerts: number;
  critical: number;
  /** % del tiempo en LE Coded y sin enlace BLE. */
  bleCodedPct: number;
  bleDisconnectedPct: number;
  duplicates: number;
}

/** Simula `days` días de un paciente estable con los parámetros por defecto y la semilla dada. */
export function runNormalWeek(seed: number, days = 7): NormalWeekRun {
  const sim = new Simulation({ params: DEFAULT_PARAMS, seed });
  sim.adaptFidelity(1e5);
  sim.advance(days * DAY);
  const s = sim.snapshot();
  return {
    seed,
    days,
    blePerDay: s.data.blePerDay,
    wanPerDay: s.data.wanPerDay,
    payloadPerDay: s.data.wanPayloadPerDay,
    autonomy: s.wearable.autonomyDays,
    current: s.wearable.averageCurrent,
    accuracy: s.classifier.accuracy,
    windows: s.classifier.windows,
    falseAlerts: sim.allAlerts.filter((a) => a.real === false && a.consoleAt !== undefined).length,
    critical: s.alerts.critical,
    bleCodedPct: (s.ble.timeIn.coded / (days * DAY)) * 100,
    bleDisconnectedPct: (s.ble.timeIn.disconnected / (days * DAY)) * 100,
    duplicates: s.metrics.duplicates,
  };
}
