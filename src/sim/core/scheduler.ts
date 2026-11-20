/**
 * Planificador de eventos discretos.
 *
 * La simulación avanza saltando de evento en evento (envío de un mensaje,
 * llegada a la estación, toma programada…). Los eventos se guardan en un
 * montículo binario ordenado por instante y, a igualdad de instante, por orden
 * de inserción, lo que hace la ejecución determinista.
 */

/** Instante de simulación en segundos desde el inicio. */
export type SimTime = number;

export type EventHandler = (now: SimTime) => void;

interface ScheduledEvent {
  time: SimTime;
  seq: number;
  label: string;
  handler: EventHandler;
  cancelled: boolean;
}

/** Referencia opaca a un evento planificado, para poder cancelarlo. */
export interface EventHandle {
  readonly id: number;
}

export class Scheduler {
  private heap: ScheduledEvent[] = [];
  private bySeq = new Map<number, ScheduledEvent>();
  private seq = 0;
  private current: SimTime = 0;
  private processed = 0;

  /** Instante actual de la simulación. */
  get now(): SimTime {
    return this.current;
  }

  /** Número de eventos ejecutados desde el inicio. */
  get processedCount(): number {
    return this.processed;
  }

  /** Eventos pendientes (incluidos los cancelados que aún no se han purgado). */
  get pendingCount(): number {
    return this.heap.length;
  }

  /** Planifica `handler` en el instante absoluto `time`. */
  at(time: SimTime, label: string, handler: EventHandler): EventHandle {
    if (!Number.isFinite(time)) throw new Error(`Instante no válido para «${label}»`);
    const ev: ScheduledEvent = {
      time: Math.max(time, this.current),
      seq: this.seq++,
      label,
      handler,
      cancelled: false,
    };
    this.push(ev);
    this.bySeq.set(ev.seq, ev);
    return { id: ev.seq };
  }

  /** Planifica `handler` dentro de `delay` segundos. */
  after(delay: number, label: string, handler: EventHandler): EventHandle {
    return this.at(this.current + Math.max(0, delay), label, handler);
  }

  /**
   * Planifica una tarea periódica. El primer disparo ocurre en `firstAt` y los
   * siguientes cada `period` segundos. Devuelve una función que la detiene.
   */
  every(firstAt: SimTime, period: number, label: string, handler: EventHandler): () => void {
    if (period <= 0) throw new Error("El periodo debe ser positivo");
    let stopped = false;
    let handle: EventHandle | null = null;
    const tick = (now: SimTime) => {
      if (stopped) return;
      handler(now);
      if (!stopped) handle = this.at(now + period, label, tick);
    };
    handle = this.at(firstAt, label, tick);
    return () => {
      stopped = true;
      if (handle) this.cancel(handle);
    };
  }

  /** Cancela un evento pendiente (no hace nada si ya se ejecutó). */
  cancel(handle: EventHandle): void {
    const ev = this.bySeq.get(handle.id);
    if (ev) {
      ev.cancelled = true;
      this.bySeq.delete(handle.id);
    }
  }

  /**
   * Ejecuta en orden todos los eventos con instante ≤ `until` y deja el reloj
   * en `until`. Devuelve el número de eventos ejecutados.
   */
  runUntil(until: SimTime): number {
    let count = 0;
    while (this.heap.length > 0 && this.heap[0].time <= until) {
      const ev = this.pop()!;
      if (ev.cancelled) continue;
      this.bySeq.delete(ev.seq);
      this.current = ev.time;
      ev.handler(ev.time);
      count++;
    }
    this.current = Math.max(this.current, until);
    this.processed += count;
    return count;
  }

  /** Instante del próximo evento no cancelado, o `null` si no hay ninguno. */
  peekTime(): SimTime | null {
    while (this.heap.length > 0 && this.heap[0].cancelled) this.pop();
    return this.heap.length > 0 ? this.heap[0].time : null;
  }

  private less(a: ScheduledEvent, b: ScheduledEvent): boolean {
    return a.time < b.time || (a.time === b.time && a.seq < b.seq);
  }

  private push(ev: ScheduledEvent): void {
    const h = this.heap;
    h.push(ev);
    let i = h.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(h[i], h[parent])) break;
      [h[i], h[parent]] = [h[parent], h[i]];
      i = parent;
    }
  }

  private pop(): ScheduledEvent | undefined {
    const h = this.heap;
    if (h.length === 0) return undefined;
    const top = h[0];
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && this.less(h[l], h[m])) m = l;
        if (r < h.length && this.less(h[r], h[m])) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    }
    return top;
  }
}
