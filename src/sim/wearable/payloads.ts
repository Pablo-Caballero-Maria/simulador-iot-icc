/**
 * Formatos binarios que el wearable envía por BLE: el vector horario de
 * 64 bytes (RF-04), la alerta y la tira de 30 s de ECG (15 392 bytes).
 * Se codifican con DataView exactamente como en el firmware, de modo que
 * los bytes que se cuentan en la simulación son los reales.
 */
import { ECG_FS, ECG_LSB_MV } from "../physiology/ecg";
import { RHYTHM_CLASSES, type RhythmClass } from "./classes";

export const VECTOR_BYTES = 64;
export const STRIP_SECONDS = 30;
export const STRIP_HEADER_BYTES = 32;
export const STRIP_BYTES = STRIP_HEADER_BYTES + STRIP_SECONDS * ECG_FS * 2;
export const ALERT_BYTES = 24;

/** Contenido del vector horario de rasgos. */
export interface HourlyVector {
  seq: number;
  /** Inicio de la hora resumida, s de simulación. */
  hourStart: number;
  hrMean: number;
  hrMin: number;
  hrMax: number;
  rmssdMs: number;
  sdnnMs: number;
  /** Ventanas de 8 s de cada clase en la hora. */
  classWindows: Record<RhythmClass, number>;
  pauseEvents: number;
  bradyEvents: number;
  respRate: number;
  impedanceMean: number;
  impedanceMin: number;
  /** Actividad media (0–1). */
  activity: number;
  /** Postura dominante: 0 decúbito, 1 sentado, 2 de pie, 3 caminando. */
  posture: number;
  sqiMean: number;
  temperature: number;
  batteryPct: number;
  rssiMean: number;
  symptomPresses: number;
  leadOffSeconds: number;
  /** Medidas de impedancia en decúbito durante la hora (para la referencia nocturna). */
  supineImpedanceCount: number;
  flags: number;
}

/** CRC-16/CCITT-FALSE, el que protege el vector. */
export function crc16(bytes: Uint8Array, length = bytes.length): number {
  let crc = 0xffff;
  for (let i = 0; i < length; i++) {
    crc ^= bytes[i] << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

const u8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const u16 = (v: number) => Math.max(0, Math.min(65535, Math.round(v)));
const i16 = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v)));

export function encodeVector(v: HourlyVector): Uint8Array {
  const b = new Uint8Array(VECTOR_BYTES);
  const d = new DataView(b.buffer);
  d.setUint8(0, 1); // versión del formato
  d.setUint8(1, v.flags & 0xff);
  d.setUint16(2, v.seq & 0xffff, true);
  d.setUint32(4, Math.max(0, Math.round(v.hourStart)), true);
  d.setUint16(8, u16(v.hrMean * 10), true);
  d.setUint8(10, u8(v.hrMin));
  d.setUint8(11, u8(v.hrMax));
  d.setUint16(12, u16(v.rmssdMs), true);
  d.setUint16(14, u16(v.sdnnMs), true);
  RHYTHM_CLASSES.forEach((c, i) => d.setUint16(16 + 2 * i, u16(v.classWindows[c]), true));
  d.setUint8(26, u8(v.pauseEvents));
  d.setUint8(27, u8(v.bradyEvents));
  d.setUint16(28, u16(v.respRate * 10), true);
  d.setUint16(30, u16(v.impedanceMean * 100), true);
  d.setUint16(32, u16(v.impedanceMin * 100), true);
  d.setUint16(34, u16(v.activity * 1000), true);
  d.setUint8(36, u8(v.posture));
  d.setUint8(37, u8(v.sqiMean * 100));
  d.setInt16(38, i16(v.temperature * 100), true);
  d.setUint8(40, u8(v.batteryPct));
  d.setUint8(41, u8(v.rssiMean + 128));
  d.setUint16(42, u16(v.symptomPresses), true);
  d.setUint16(44, u16(v.leadOffSeconds), true);
  d.setUint8(46, u8(v.supineImpedanceCount));
  // Bytes 47–61 reservados para ampliaciones del formato.
  d.setUint16(62, crc16(b, 62), true);
  return b;
}

export function decodeVector(b: Uint8Array): HourlyVector {
  if (b.length !== VECTOR_BYTES) throw new Error("Vector de longitud incorrecta");
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (d.getUint16(62, true) !== crc16(b, 62)) throw new Error("CRC del vector incorrecto");
  const classWindows = {} as Record<RhythmClass, number>;
  RHYTHM_CLASSES.forEach((c, i) => (classWindows[c] = d.getUint16(16 + 2 * i, true)));
  return {
    flags: d.getUint8(1),
    seq: d.getUint16(2, true),
    hourStart: d.getUint32(4, true),
    hrMean: d.getUint16(8, true) / 10,
    hrMin: d.getUint8(10),
    hrMax: d.getUint8(11),
    rmssdMs: d.getUint16(12, true),
    sdnnMs: d.getUint16(14, true),
    classWindows,
    pauseEvents: d.getUint8(26),
    bradyEvents: d.getUint8(27),
    respRate: d.getUint16(28, true) / 10,
    impedanceMean: d.getUint16(30, true) / 100,
    impedanceMin: d.getUint16(32, true) / 100,
    activity: d.getUint16(34, true) / 1000,
    posture: d.getUint8(36),
    sqiMean: d.getUint8(37) / 100,
    temperature: d.getInt16(38, true) / 100,
    batteryPct: d.getUint8(40),
    rssiMean: d.getUint8(41) - 128,
    symptomPresses: d.getUint16(42, true),
    leadOffSeconds: d.getUint16(44, true),
    supineImpedanceCount: d.getUint8(46),
  };
}

/** Tira de ECG: cabecera de 32 bytes + 7 680 muestras int16 (30 s a 256 Hz). */
export function encodeStrip(samplesMv: Float32Array, startTime: number, eventCode: number, seq: number): Uint8Array {
  const n = STRIP_SECONDS * ECG_FS;
  const b = new Uint8Array(STRIP_BYTES);
  const d = new DataView(b.buffer);
  d.setUint8(0, 1);
  d.setUint8(1, eventCode);
  d.setUint16(2, seq & 0xffff, true);
  d.setUint32(4, Math.max(0, Math.round(startTime)), true);
  d.setUint16(8, ECG_FS, true);
  d.setFloat32(10, ECG_LSB_MV, true);
  d.setUint16(14, n, true);
  for (let i = 0; i < n; i++) {
    const v = i < samplesMv.length ? samplesMv[i] : 0;
    d.setInt16(STRIP_HEADER_BYTES + 2 * i, Math.max(-32768, Math.min(32767, Math.round(v / ECG_LSB_MV))), true);
  }
  d.setUint16(30, crc16(b.subarray(STRIP_HEADER_BYTES)), true);
  return b;
}

/** Códigos de evento de la alerta y de la tira. */
export const EVENT_CODES = {
  scheduled: 0,
  vt: 1,
  pause: 2,
  severeBrady: 3,
  af: 4,
  afRapid: 5,
  brady: 6,
  symptom: 7,
  leadOff: 8,
  lowBattery: 9,
  congestion: 10,
} as const;

export type EventCode = keyof typeof EVENT_CODES;

export interface AlertPayload {
  seq: number;
  code: EventCode;
  alertClass: 1 | 2 | 3;
  detectedAt: number;
  hr: number;
  confidence: number;
  sqi: number;
}

export function encodeAlert(a: AlertPayload): Uint8Array {
  const b = new Uint8Array(ALERT_BYTES);
  const d = new DataView(b.buffer);
  d.setUint8(0, 1);
  d.setUint8(1, EVENT_CODES[a.code]);
  d.setUint8(2, a.alertClass);
  d.setUint16(4, a.seq & 0xffff, true);
  d.setFloat64(6, a.detectedAt, true);
  d.setUint16(14, u16(a.hr * 10), true);
  d.setUint8(16, u8(a.confidence * 100));
  d.setUint8(17, u8(a.sqi * 100));
  d.setUint16(22, crc16(b, 22), true);
  return b;
}
