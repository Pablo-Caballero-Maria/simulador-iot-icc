/**
 * Codificación de paquetes MQTT 5.0 (OASIS, 2019) que intervienen en la
 * simulación. Se construyen los bytes reales para contar el tamaño exacto
 * de cada mensaje y poder mostrarlos.
 */

const enc = new TextEncoder();

/** Longitud restante como entero de longitud variable (1–4 bytes). */
export function encodeVarInt(value: number): number[] {
  if (value < 0 || value > 268435455) throw new Error("Longitud MQTT fuera de rango");
  const out: number[] = [];
  let v = value;
  do {
    let byte = v % 128;
    v = Math.floor(v / 128);
    if (v > 0) byte |= 0x80;
    out.push(byte);
  } while (v > 0);
  return out;
}

function utf8String(s: string): number[] {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 0xff, ...b];
}

export interface PublishOptions {
  topic: string;
  payload: Uint8Array;
  qos: 0 | 1;
  retain?: boolean;
  dup?: boolean;
  packetId?: number;
  /**
   * Alias de tema (MQTT 5): si `aliasEstablished` es verdadero, el tema se
   * omite y solo viaja el alias de 2 bytes.
   */
  topicAlias?: number;
  aliasEstablished?: boolean;
}

export interface EncodedPacket {
  bytes: Uint8Array;
  /** Desglose del tamaño para el inspector de mensajes. */
  parts: { label: string; bytes: number }[];
}

/** Paquete PUBLISH completo. */
export function encodePublish(o: PublishOptions): EncodedPacket {
  const topicBytes = o.topicAlias !== undefined && o.aliasEstablished ? utf8String("") : utf8String(o.topic);
  const packetId = o.qos > 0 ? [((o.packetId ?? 1) >> 8) & 0xff, (o.packetId ?? 1) & 0xff] : [];
  const props: number[] = [];
  if (o.topicAlias !== undefined) props.push(0x23, (o.topicAlias >> 8) & 0xff, o.topicAlias & 0xff);
  const propsLen = encodeVarInt(props.length);
  const variable = [...topicBytes, ...packetId, ...propsLen, ...props];
  const remaining = variable.length + o.payload.length;
  const first = 0x30 | (o.dup ? 0x08 : 0) | (o.qos << 1) | (o.retain ? 1 : 0);
  const fixed = [first, ...encodeVarInt(remaining)];
  const bytes = new Uint8Array(fixed.length + remaining);
  bytes.set(fixed, 0);
  bytes.set(variable, fixed.length);
  bytes.set(o.payload, fixed.length + variable.length);
  return {
    bytes,
    parts: [
      { label: "Cabecera fija", bytes: fixed.length },
      { label: o.aliasEstablished ? "Tema (vacío, se usa el alias)" : "Tema", bytes: topicBytes.length },
      { label: "Identificador de paquete", bytes: packetId.length },
      { label: "Propiedades", bytes: propsLen.length + props.length },
      { label: "Carga útil", bytes: o.payload.length },
    ],
  };
}

/** PUBACK de MQTT 5 con código de éxito implícito: 4 bytes. */
export const PUBACK_SIZE = 4;
/** PINGREQ y PINGRESP: 2 bytes cada uno. */
export const PING_SIZE = 2;

/** Tamaño de un CONNECT con identificador, keepalive, mensaje de última voluntad y sin contraseña. */
export function connectSize(clientId: string, willTopic: string, willPayload: number): number {
  const variable = 2 + 4 + 1 + 1 + 2 + 1; // nombre «MQTT», versión, flags, keepalive, propiedades vacías
  const payload = utf8String(clientId).length + 1 + utf8String(willTopic).length + 2 + willPayload;
  const remaining = variable + payload;
  return 1 + encodeVarInt(remaining).length + remaining;
}

/** CONNACK mínimo con propiedades (alias máximo y keepalive del servidor). */
export const CONNACK_SIZE = 12;

/** SUBSCRIBE a un filtro con QoS 1. */
export function subscribeSize(filter: string): number {
  const remaining = 2 + 1 + utf8String(filter).length + 1;
  return 1 + encodeVarInt(remaining).length + remaining;
}

/** SUBACK con un código de motivo. */
export const SUBACK_SIZE = 6;
