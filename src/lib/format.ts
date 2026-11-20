/** Formatos de números para la interfaz (coma decimal, como en la memoria). */
export { formatBytes, formatDuration, formatNumber, formatSimTime } from "@/sim/core/time";

import { formatNumber } from "@/sim/core/time";

export function formatPct(fraction: number, decimals = 1): string {
  return `${formatNumber(fraction * 100, decimals)} %`;
}

export function formatEuros(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${formatNumber(Math.round(value))} €`;
}

export function formatMonths(months: number): string {
  if (!Number.isFinite(months)) return "no se recupera";
  if (months > 120) return "> 10 años";
  return `${formatNumber(months, 0)} meses`;
}

/** Hora del día «hh:mm» a partir de horas decimales. */
export function formatClock(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
