/**
 * Tipos compartidos por los componentes de la simulación y por la interfaz.
 */
import type { Rng } from "./core/rng";
import type { Scheduler, SimTime } from "./core/scheduler";
import type { Emitter } from "./core/emitter";
import type { SimParams } from "./params";

/** Nodos del sistema (coinciden con los objetos de la escena 3D). */
export type NodeId = "wearable" | "scale" | "station" | "dispenser" | "tower" | "cloud" | "hospital" | "ambulance";

/** Enlaces por los que viajan los mensajes. */
export type LinkId = "ble" | "ble-scale" | "uart" | "lte-m" | "nb-iot" | "internet" | "hospital" | "sms";

export type MessageKind =
  | "vector"
  | "strip"
  | "alert"
  | "weight"
  | "raw"
  | "telemetry"
  | "congestion"
  | "order"
  | "dispense"
  | "control"
  | "sms"
  | "console";

/** Nivel del modelo del IoT World Forum (o funciones transversales). */
export type IotLevel = "N1" | "N2" | "N3" | "N4" | "N5" | "N6" | "N7" | "T";

/** Detalle de un mensaje para el inspector (se rellena de forma perezosa). */
export interface MessageDetails {
  hex?: string;
  diagnostic?: string;
  json?: string;
  parts?: { label: string; bytes: number }[];
  fhir?: string;
  notes?: string[];
}

/** Un mensaje en tránsito por un enlace (lo que se anima en 3D y se lista en «Mensajes»). */
export interface Transmission {
  id: number;
  link: LinkId;
  from: NodeId;
  to: NodeId;
  kind: MessageKind;
  label: string;
  /** Bytes transmitidos en este salto (en la red móvil, bytes IP incluidas cabeceras). */
  bytes: number;
  /** Carga útil de aplicación. */
  payloadBytes: number;
  tStart: SimTime;
  tEnd: SimTime;
  topic?: string;
  details?: MessageDetails;
  /** Marca los reenvíos (duplicados por QoS 1, envíos diferidos…). */
  note?: string;
}

export type NarrationTone = "info" | "ok" | "warn" | "critical";

/** Explicación que se muestra al usuario cuando ocurre algo relevante. */
export interface Narration {
  id: number;
  t: SimTime;
  level: IotLevel;
  title: string;
  text: string;
  tone: NarrationTone;
  focus?: NodeId;
}

/** Eventos que emite la simulación hacia la interfaz. */
export interface SimEvents {
  transmission: Transmission;
  narration: Narration;
}

/** Contexto común que reciben todos los componentes. */
export interface SimContext {
  readonly scheduler: Scheduler;
  readonly params: SimParams;
  readonly rng: Rng;
  readonly bus: Emitter<SimEvents>;
  /** Registra un mensaje y lo emite (devuelve el mensaje con su identificador). */
  transmit(tx: Omit<Transmission, "id">): Transmission;
  /** Publica una explicación para el usuario. */
  narrate(n: Omit<Narration, "id" | "t">, key?: string): void;
}
