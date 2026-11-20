/** Estadística elemental para las métricas de la simulación. */

/** Media aritmética (0 si la lista está vacía). */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/** Desviación típica muestral (0 con menos de dos valores). */
export function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) ** 2;
  return Math.sqrt(s / (values.length - 1));
}

/** Mediana (NaN si la lista está vacía). */
export function median(values: readonly number[]): number {
  return percentile(values, 50);
}

/** Percentil `p` (0–100) con interpolación lineal; NaN si la lista está vacía. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (Math.min(Math.max(p, 0), 100) / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/** Limita `value` al intervalo [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Interpolación lineal entre `a` y `b`. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Buffer circular de muestras (instante, valor) con capacidad fija. Se usa
 * para las series que se dibujan en pantalla sin que crezca la memoria.
 */
export class RingSeries {
  readonly times: Float64Array;
  readonly values: Float64Array;
  private start = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    this.times = new Float64Array(capacity);
    this.values = new Float64Array(capacity);
  }

  get length(): number {
    return this.count;
  }

  push(time: number, value: number): void {
    const idx = (this.start + this.count) % this.capacity;
    this.times[idx] = time;
    this.values[idx] = value;
    if (this.count < this.capacity) this.count++;
    else this.start = (this.start + 1) % this.capacity;
  }

  /** Muestra i-ésima en orden cronológico. */
  at(i: number): { time: number; value: number } {
    const idx = (this.start + i) % this.capacity;
    return { time: this.times[idx], value: this.values[idx] };
  }

  /** Copia en orden cronológico (para dibujar). */
  toArray(): { time: number; value: number }[] {
    const out: { time: number; value: number }[] = [];
    for (let i = 0; i < this.count; i++) out.push(this.at(i));
    return out;
  }

  clear(): void {
    this.start = 0;
    this.count = 0;
  }
}
