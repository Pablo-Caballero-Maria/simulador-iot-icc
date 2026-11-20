/** Emisor de eventos tipado y síncrono. */
export class Emitter<Events extends object> {
  private listeners: { [K in keyof Events]?: Set<(payload: Events[K]) => void> } = {};

  /** Suscribe `fn` al evento `type`; devuelve la función para anular la suscripción. */
  on<K extends keyof Events>(type: K, fn: (payload: Events[K]) => void): () => void {
    let set = this.listeners[type];
    if (!set) {
      set = new Set();
      this.listeners[type] = set;
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.listeners[type];
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  clear(): void {
    this.listeners = {};
  }
}
