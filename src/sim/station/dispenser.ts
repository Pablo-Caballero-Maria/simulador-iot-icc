/**
 * Microcontrolador de seguridad del dispensador (nivel 1 y 3).
 *
 * Es independiente de Linux y de la nube: ejecuta la pauta basal sin red,
 * solo acepta órdenes firmadas por un cardiólogo, descarta las repetidas, las
 * antiguas y las caducadas, y respeta el máximo diario y el intervalo mínimo
 * entre aperturas que impone un temporizador hardware (apartado 6.13).
 */
import { DAY, HOUR, dayIndex, nextTimeOfDay, timeAt } from "../core/time";
import { verifyOrder } from "../cloud/signing";
import type { DoseOrder } from "../records";
import type { SimContext } from "../types";

export type DispenserEventKind = "basal" | "extra" | "taken" | "not-taken" | "rejected" | "scheduled";

export interface DispenserEvent {
  kind: DispenserEventKind;
  t: number;
  orderId?: string;
  doseMg?: number;
  reason?: string;
}

/** Compartimentos del casete semanal precintado. */
export const CASSETTE_SLOTS = 28;

export class Dispenser {
  private openings: number[] = [];
  private readonly executed = new Set<string>();
  private lastSeq = 0;
  private pills = CASSETTE_SLOTS;
  private pendingExtra: { order: DoseOrder; at: number } | null = null;
  readonly log: DispenserEvent[] = [];
  /** Instante hasta el que la bandeja está abierta (para la animación). */
  trayOpenUntil = -1;

  constructor(
    private readonly ctx: SimContext,
    private readonly clinicianPublicKey: Uint8Array,
    /** Libera una dosis: el paciente acude y decide si la toma. */
    private readonly onRelease: (kind: "basal" | "extra", t: number, order?: DoseOrder) => void,
    /** Notifica a la estación cada evento (para publicarlo). */
    private readonly onEvent: (ev: DispenserEvent) => void,
  ) {}

  get pillsLeft(): number {
    return this.pills;
  }

  get scheduledExtra(): { order: DoseOrder; at: number } | null {
    return this.pendingExtra;
  }

  /** Registra una orden ya ejecutada antes del inicio (para el escenario de ataque). */
  markExecuted(order: DoseOrder): void {
    this.executed.add(order.orderId);
    this.lastSeq = Math.max(this.lastSeq, order.seq);
  }

  start(): void {
    const s = this.ctx.scheduler;
    s.every(nextTimeOfDay(s.now, this.ctx.params.dispenser.basalHour), DAY, "dispenser-basal", (t) =>
      this.release("basal", t),
    );
  }

  /** Recibe una orden por la UART desde la estación. Devuelve si se acepta. */
  receiveOrder(order: DoseOrder, t: number): boolean {
    const p = this.ctx.params.dispenser;
    const reject = (reason: string) => {
      order.status = "rechazada";
      order.rejectReason = reason;
      order.history.push({ t, status: "rechazada", note: reason });
      this.emit({ kind: "rejected", t, orderId: order.orderId, reason });
      this.ctx.narrate({
        level: "T",
        title: "El dispensador rechaza la orden",
        text: `Motivo: ${reason}. El microcontrolador de seguridad no ejecuta nada que no lleve una firma válida del cardiólogo, que no sea nuevo y que no respete los límites.`,
        tone: "ok",
        focus: "dispenser",
      });
      return false;
    };
    if (!verifyOrder(order, this.clinicianPublicKey)) return reject("firma no válida");
    if (this.executed.has(order.orderId)) return reject("orden ya ejecutada (repetida)");
    if (order.seq <= this.lastSeq) return reject("número de secuencia antiguo");
    if (t > order.validUntil) return reject("orden caducada");
    if (order.doseMg > 40) return reject("dosis fuera de los límites del casete");

    // Primer instante permitido: la hora preferida si aún no ha pasado, el
    // intervalo mínimo desde la última apertura y el máximo diario.
    let at = Math.max(t + 60, order.validFrom);
    const preferred = timeAt(dayIndex(at), p.extraDoseHour);
    if (preferred > at && preferred <= order.validUntil) at = preferred;
    const last = this.openings.at(-1);
    if (last !== undefined) at = Math.max(at, last + p.minIntervalH * HOUR);
    if (this.openingsOnDay(dayIndex(at)) >= p.maxDailyOpenings) {
      at = Math.max(at, timeAt(dayIndex(at) + 1, p.basalHour) + p.minIntervalH * HOUR);
    }
    if (at > order.validUntil) return reject("no cabe en la ventana de validez sin superar los límites");

    this.lastSeq = order.seq;
    this.executed.add(order.orderId);
    order.status = "verificada";
    order.history.push({ t, status: "verificada", note: "firma válida y dentro de límites" });
    this.pendingExtra = { order, at };
    this.emit({ kind: "scheduled", t, orderId: order.orderId, doseMg: order.doseMg });
    this.ctx.narrate({
      level: "N3",
      title: "Orden verificada por el dispensador",
      text: `La firma ECDSA es válida, la orden es nueva y está vigente. Se programa la dosis respetando el intervalo mínimo de ${p.minIntervalH} h y el máximo de ${p.maxDailyOpenings} aperturas al día.`,
      tone: "ok",
      focus: "dispenser",
    });
    this.ctx.scheduler.at(at, "dispenser-extra", (now) => {
      if (this.pendingExtra?.order === order) this.pendingExtra = null;
      this.release("extra", now, order);
    });
    return true;
  }

  private openingsOnDay(day: number): number {
    return this.openings.filter((o) => dayIndex(o) === day).length;
  }

  private release(kind: "basal" | "extra", t: number, order?: DoseOrder): void {
    const p = this.ctx.params.dispenser;
    const last = this.openings.at(-1);
    // Salvaguarda hardware: nunca dos aperturas a menos del intervalo mínimo.
    if (last !== undefined && t - last < p.minIntervalH * HOUR - 1) {
      this.emit({ kind: "rejected", t, orderId: order?.orderId, reason: "temporizador hardware: intervalo mínimo" });
      return;
    }
    if (this.pills <= 0) {
      this.emit({ kind: "rejected", t, reason: "casete vacío" });
      return;
    }
    this.pills--;
    if (this.pills <= 0) this.pills = CASSETTE_SLOTS; // la farmacia repone el casete semanal
    this.openings.push(t);
    this.trayOpenUntil = t + 600;
    if (order) {
      order.status = "ejecutada";
      order.executedAt = t;
      order.history.push({ t, status: "ejecutada" });
    }
    this.emit({ kind, t, orderId: order?.orderId, doseMg: order?.doseMg ?? 40 });
    this.ctx.narrate(
      {
        level: "N1",
        title: kind === "basal" ? "Toma basal liberada" : "Dosis adicional liberada",
        text:
          kind === "basal"
            ? "El dispensador libera la toma de la mañana por sí solo, aunque no haya red: la pauta basal vive en su microcontrolador. Un sensor óptico detectará si el paciente retira la pastilla."
            : "El dispensador abre el compartimento de la dosis adicional que firmó el cardiólogo. El paciente acude a tomarla.",
        tone: "info",
        focus: "dispenser",
      },
      kind === "basal" ? "basal" : undefined,
    );
    this.onRelease(kind, t, order);
  }

  /** El sensor óptico detecta si se retira la pastilla. */
  reportTaken(t: number, taken: boolean, kind: "basal" | "extra", order?: DoseOrder): void {
    this.trayOpenUntil = t;
    if (order) {
      order.status = taken ? "tomada" : "no tomada";
      order.history.push({ t, status: order.status });
    }
    this.emit({
      kind: taken ? "taken" : "not-taken",
      t,
      orderId: order?.orderId,
      doseMg: kind === "extra" ? order?.doseMg : 40,
    });
  }

  private emit(ev: DispenserEvent): void {
    this.log.push(ev);
    if (this.log.length > 200) this.log.shift();
    this.onEvent(ev);
  }
}
