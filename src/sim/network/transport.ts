/**
 * Coste de transporte de los mensajes MQTT por la red móvil: TLS 1.3 sobre
 * TCP/IPv4. Es lo que factura el operador y lo que separa la carga útil
 * (los datos) de lo que realmente se transmite.
 */
import { CONNACK_SIZE, PING_SIZE, PUBACK_SIZE, SUBACK_SIZE, connectSize, subscribeSize } from "../protocols/mqtt";

/** Cabecera de registro TLS (5) + tipo de contenido interno (1) + etiqueta AEAD (16). */
export const TLS_RECORD_OVERHEAD = 22;
export const TLS_MAX_RECORD = 16384;
/** Cabeceras IPv4 (20) + TCP (20) + opción de marcas de tiempo (12). */
export const TCP_IP_HEADER = 52;
/** Tamaño máximo de segmento TCP en la red móvil (MTU de 1 500 menos cabeceras y margen). */
export const TCP_MSS = 1400;

export interface WireCost {
  /** Bytes en sentido de envío (incluidas cabeceras). */
  up: number;
  /** Bytes en sentido contrario (confirmaciones). */
  down: number;
  /** Segmentos TCP de datos. */
  segments: number;
}

/** Bytes en el cable de `appBytes` de datos de aplicación (sin confirmaciones). */
export function tlsTcpBytes(appBytes: number): { wire: number; segments: number } {
  const records = Math.max(1, Math.ceil(appBytes / TLS_MAX_RECORD));
  const tlsBytes = appBytes + records * TLS_RECORD_OVERHEAD;
  const segments = Math.max(1, Math.ceil(tlsBytes / TCP_MSS));
  return { wire: tlsBytes + segments * TCP_IP_HEADER, segments };
}

/**
 * Coste de un PUBLISH con QoS 1: el paquete en un sentido; en el otro, los
 * ACK de TCP (uno cada dos segmentos, el último va con el PUBACK) y el
 * PUBACK; y el ACK de TCP del PUBACK, que vuelve en el sentido de envío.
 */
export function publishQos1Cost(mqttBytes: number): WireCost {
  const data = tlsTcpBytes(mqttBytes);
  const ackSegments = Math.max(0, Math.ceil(data.segments / 2) - 1);
  const puback = tlsTcpBytes(PUBACK_SIZE).wire;
  return {
    up: data.wire + TCP_IP_HEADER,
    down: ackSegments * TCP_IP_HEADER + puback,
    segments: data.segments,
  };
}

/** Coste de un ciclo de keepalive: PINGREQ, PINGRESP y el ACK de este. */
export function keepAliveCost(): WireCost {
  const ping = tlsTcpBytes(PING_SIZE).wire;
  return { up: ping + TCP_IP_HEADER, down: ping, segments: 1 };
}

/**
 * Coste de establecer la sesión: TCP (SYN, SYN-ACK, ACK), TLS 1.3 con
 * autenticación mutua por certificado (cadenas de dos certificados ECDSA),
 * CONNECT con mensaje de última voluntad, CONNACK, SUBSCRIBE a las órdenes y
 * SUBACK. Las cifras de TLS son las de un intercambio típico con P-256.
 */
export function sessionSetupCost(clientId: string): WireCost {
  const tcpHandshakeUp = 60 + 52; // SYN con opciones + ACK
  const tcpHandshakeDown = 60; // SYN-ACK
  const clientHello = 5 + 290;
  const serverFlight = 5 + 122 + TLS_RECORD_OVERHEAD + (30 + 50 + 1150 + 80 + 52); // ServerHello + cifrado
  const clientFlight = TLS_RECORD_OVERHEAD + (1150 + 80 + 52); // Certificate, CertificateVerify, Finished
  const mqttUp = connectSize(clientId, `tf/${clientId}/estado`, 9) + subscribeSize(`tf/${clientId}/cmd/#`);
  const mqttDown = CONNACK_SIZE + SUBACK_SIZE;
  const up =
    tlsTcpBytes(clientFlight + mqttUp).wire + (clientHello + TCP_IP_HEADER) + tcpHandshakeUp + 2 * TCP_IP_HEADER;
  const down = tlsTcpBytes(serverFlight + mqttDown).wire + tcpHandshakeDown + TCP_IP_HEADER;
  return { up, down, segments: 4 };
}

/** Cierre ordenado de la sesión (FIN y ACK en ambos sentidos). */
export function sessionTeardownCost(): WireCost {
  return { up: 2 * TCP_IP_HEADER, down: 2 * TCP_IP_HEADER, segments: 0 };
}
