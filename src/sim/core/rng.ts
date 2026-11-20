/**
 * Generador pseudoaleatorio determinista.
 *
 * Toda la aleatoriedad de la simulación pasa por esta clase, de modo que una
 * misma semilla reproduce exactamente la misma ejecución (requisito para los
 * tests y para comparar escenarios en la memoria).
 *
 * Algoritmo: mulberry32 (32 bits de estado, periodo 2^32), suficiente para
 * una simulación y mucho más rápido que un generador criptográfico.
 */
export class Rng {
  private state: number;
  private spareNormal: number | null = null;

  constructor(seed: number) {
    // Se mezcla la semilla para que semillas consecutivas den secuencias distintas.
    this.state = (seed ^ 0x9e3779b9) >>> 0;
    if (this.state === 0) this.state = 0x6d2b79f5;
  }

  /** Número uniforme en [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniforme en [min, max). */
  uniform(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Entero uniforme en [min, max] (ambos incluidos). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Devuelve `true` con probabilidad `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Normal de media `mean` y desviación `sd` (método de Box-Muller polar). */
  normal(mean = 0, sd = 1): number {
    if (this.spareNormal !== null) {
      const v = this.spareNormal;
      this.spareNormal = null;
      return mean + sd * v;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const factor = Math.sqrt((-2 * Math.log(s)) / s);
    this.spareNormal = v * factor;
    return mean + sd * u * factor;
  }

  /** Lognormal parametrizada por su mediana y el factor multiplicativo de una desviación. */
  logNormal(median: number, spreadFactor: number): number {
    return median * Math.exp(this.normal(0, Math.log(spreadFactor)));
  }

  /** Exponencial de media `mean`. */
  exponential(mean: number): number {
    return -mean * Math.log(1 - this.next());
  }

  /** Elemento aleatorio de una lista no vacía. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("pick() sobre una lista vacía");
    return items[Math.floor(this.next() * items.length)];
  }

  /**
   * Crea un generador hijo independiente. Se usa para que cada componente
   * tenga su propia secuencia y añadir un componente no altere a los demás.
   */
  fork(label: string): Rng {
    let h = this.int(0, 0x7fffffff);
    for (let i = 0; i < label.length; i++) {
      h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0;
    }
    return new Rng(h);
  }
}
