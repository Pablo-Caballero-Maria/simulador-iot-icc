/** Utilidades de tiempo. La simulación cuenta en segundos desde el inicio. */

export const MINUTE = 60;
export const HOUR = 3600;
export const DAY = 86400;

/**
 * La simulación arranca el lunes a las 06:00 (hora local del domicilio), de
 * modo que en los primeros minutos ya hay actividad y el pesaje cae pronto.
 */
export const START_OFFSET = 6 * HOUR;

/** Hora del día (0–24, decimal) correspondiente a un instante de simulación. */
export function hourOfDay(t: number): number {
  return ((((t + START_OFFSET) % DAY) + DAY) % DAY) / HOUR;
}

/** Número de día (0 = primer día) de un instante de simulación. */
export function dayIndex(t: number): number {
  return Math.floor((t + START_OFFSET) / DAY);
}

/** Instante de simulación de la hora `hour` del día `day`. */
export function timeAt(day: number, hour: number): number {
  return day * DAY + hour * HOUR - START_OFFSET;
}

/** Próximo instante (≥ `t`) en que el reloj marca la hora `hour`. */
export function nextTimeOfDay(t: number, hour: number): number {
  let candidate = timeAt(dayIndex(t), hour);
  if (candidate < t) candidate += DAY;
  return candidate;
}

/** `true` si la hora del día está en [from, to) (admite intervalos que cruzan medianoche). */
export function isBetweenHours(t: number, from: number, to: number): boolean {
  const h = hourOfDay(t);
  return from <= to ? h >= from && h < to : h >= from || h < to;
}

const DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** Formato legible: «día 2 (miércoles) 14:05:09». */
export function formatSimTime(t: number, withSeconds = true): string {
  const d = dayIndex(t);
  const h = hourOfDay(t);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ss = Math.floor(((h - hh) * 60 - mm) * 60);
  const clock = withSeconds ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(hh)}:${pad(mm)}`;
  return `día ${d + 1} (${DAY_NAMES[d % 7]}) ${clock}`;
}

/** Duración legible: «850 ms», «12,4 s», «3 min 20 s», «2 h 05 min», «3,2 días». */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "∞";
  const s = Math.abs(seconds);
  if (s < 1) return `${Math.round(s * 1000)} ms`;
  if (s < 60) return `${formatNumber(s, s < 10 ? 1 : 0)} s`;
  if (s < HOUR) {
    const m = Math.floor(s / 60);
    return `${m} min ${pad(Math.round(s - m * 60))} s`;
  }
  if (s < 2 * DAY) {
    const h = Math.floor(s / HOUR);
    return `${h} h ${pad(Math.round((s - h * HOUR) / 60))} min`;
  }
  return `${formatNumber(s / DAY, 1)} días`;
}

/** Número con coma decimal y separador de miles (formato español). */
export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Tamaño legible en bytes con prefijos decimales (KB = 1000 B), como en la memoria. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${formatNumber(bytes)} B`;
  if (bytes < 1e6) return `${formatNumber(bytes / 1000, bytes < 1e4 ? 2 : 1)} KB`;
  if (bytes < 1e9) return `${formatNumber(bytes / 1e6, 1)} MB`;
  return `${formatNumber(bytes / 1e9, 2)} GB`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
