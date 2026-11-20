/**
 * Registros que recorren el sistema de extremo a extremo (alertas y órdenes)
 * y contadores para las estadísticas. Cada componente rellena los instantes
 * de su tramo, de modo que al final se conoce el retardo de cada salto.
 */
import { RHYTHM_CLASSES, type RhythmClass } from "./wearable/classes";
import type { EventCode } from "./wearable/payloads";
import type { MessageKind } from "./types";

export type AlertStatus = "open" | "acknowledged" | "resolved" | "dismissed";

export interface AlertRecord {
  id: string;
  code: EventCode;
  alertClass: 1 | 2 | 3;
  title: string;
  /** Instante en que el wearable (o la estación, o la nube) detecta el evento. */
  detectedAt: number;
  hr: number;
  confidence: number;
  /** ¿Corresponde a un evento real del paciente simulado? */
  real: boolean | null;
  /** Dónde se tomó la decisión: en el wearable (optimizado) o en la nube (base). */
  origin: "wearable" | "station" | "cloud";
  localAlarmAt?: number;
  stationAt?: number;
  stationVerdict?: "confirmada" | "dudosa" | "no confirmada";
  /** Fin del análisis de la tira en la estación. */
  confirmedAt?: number;
  publishedAt?: number;
  brokerAt?: number;
  consoleAt?: number;
  stripAt?: number;
  ackAt?: number;
  ackBy?: string;
  escalations: { t: number; to: string }[];
  smsAt?: number;
  status: AlertStatus;
  outcome?: string;
  ambulance?: { dispatchedAt: number; arrivedAt?: number; pairedAt?: number };
}

export type OrderStatus =
  | "propuesta"
  | "bloqueada"
  | "firmada"
  | "enviada"
  | "verificada"
  | "rechazada"
  | "ejecutada"
  | "tomada"
  | "no tomada"
  | "caducada";

/** Orden de dosis adicional de diurético (A3: propone el sistema, firma un médico). */
export interface DoseOrder {
  orderId: string;
  /** Número de secuencia monotónico por estación. */
  seq: number;
  patient: string;
  drug: string;
  doseMg: number;
  /** Ventana de validez (instantes de simulación). */
  validFrom: number;
  validUntil: number;
  proposedAt: number;
  reason: string;
  signedAt?: number;
  signedBy?: string;
  /** Firma ECDSA P-256 del cardiólogo (64 bytes, r‖s) en hexadecimal. */
  signature?: string;
  status: OrderStatus;
  history: { t: number; status: OrderStatus; note?: string }[];
  /** Orden inyectada por un atacante (escenario de seguridad). */
  forged?: boolean;
  rejectReason?: string;
  executedAt?: number;
}

/** Contadores agregados de toda la ejecución. */
export class Metrics {
  /** Matriz de confusión del clasificador por ventanas (fila = verdad). */
  readonly confusion: number[][] = RHYTHM_CLASSES.map(() => RHYTHM_CLASSES.map(() => 0));
  windows = 0;
  /** Bytes de carga útil enviados por BLE, por tipo. */
  readonly bleBytes: Partial<Record<MessageKind, number>> = {};
  /** Carga útil de aplicación enviada a la nube, por tipo. */
  readonly wanPayload: Partial<Record<MessageKind, number>> = {};
  wanMessages = 0;
  duplicatesDropped = 0;
  outOfOrder = 0;
  storedAndForwarded = 0;
  smsSent = 0;
  readonly localAlarmDelays: number[] = [];
  /** Retardo de confirmación a consola de las alertas críticas, s. */
  readonly consoleDelays: number[] = [];
  weighings = 0;
  weighingsRejected = 0;
  dosesDispensed = 0;
  dosesTaken = 0;
  ordersRejected = 0;

  recordWindow(truth: RhythmClass | null, predicted: RhythmClass): void {
    this.windows++;
    if (truth) this.confusion[RHYTHM_CLASSES.indexOf(truth)][RHYTHM_CLASSES.indexOf(predicted)]++;
  }

  addBle(kind: MessageKind, bytes: number): void {
    this.bleBytes[kind] = (this.bleBytes[kind] ?? 0) + bytes;
  }

  addWanPayload(kind: MessageKind, bytes: number): void {
    this.wanPayload[kind] = (this.wanPayload[kind] ?? 0) + bytes;
    this.wanMessages++;
  }

  get bleTotal(): number {
    return Object.values(this.bleBytes).reduce((a, b) => a + (b ?? 0), 0);
  }

  get wanPayloadTotal(): number {
    return Object.values(this.wanPayload).reduce((a, b) => a + (b ?? 0), 0);
  }

  /** Exactitud por ventanas frente a la verdad de la simulación. */
  get accuracy(): number {
    let ok = 0;
    let all = 0;
    this.confusion.forEach((row, i) =>
      row.forEach((v, j) => {
        all += v;
        if (i === j) ok += v;
      }),
    );
    return all > 0 ? ok / all : Number.NaN;
  }
}
