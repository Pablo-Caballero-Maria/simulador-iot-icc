/**
 * SenML (RFC 8428) sobre CBOR: listas de medidas con nombre, unidad,
 * valor e instante. En CBOR los nombres de los campos se sustituyen por
 * enteros (bn = −2, bt = −3, n = 0, u = 1, v = 2…), lo que reduce mucho el
 * tamaño frente a JSON.
 */
import { type CborValue, encodeCbor } from "./cbor";

export interface SenmlRecord {
  /** Nombre base (se aplica a este registro y a los siguientes). */
  bn?: string;
  /** Tiempo base, s (época Unix). */
  bt?: number;
  /** Unidad base. */
  bu?: string;
  n?: string;
  u?: string;
  v?: number;
  vs?: string;
  vb?: boolean;
  /** Valor binario (por ejemplo, una tira de ECG). */
  vd?: Uint8Array;
  /** Tiempo relativo al tiempo base, s. */
  t?: number;
}

/** Etiquetas enteras de SenML-CBOR (RFC 8428, tabla 6). */
const LABELS: Record<keyof SenmlRecord, number> = {
  bn: -2,
  bt: -3,
  bu: -4,
  n: 0,
  u: 1,
  v: 2,
  vs: 3,
  vb: 4,
  t: 6,
  vd: 8,
};

/** Codifica un paquete SenML en CBOR. */
export function encodeSenmlCbor(pack: readonly SenmlRecord[]): Uint8Array {
  return encodeCbor(senmlToCborValue(pack));
}

export function senmlToCborValue(pack: readonly SenmlRecord[]): CborValue {
  return pack.map((rec) => {
    const m = new Map<CborValue, CborValue>();
    for (const key of Object.keys(LABELS) as (keyof SenmlRecord)[]) {
      const value = rec[key];
      if (value !== undefined) m.set(LABELS[key], value as CborValue);
    }
    return m;
  });
}

/** Representación JSON de SenML (para mostrar y comparar tamaños). */
export function senmlToJson(pack: readonly SenmlRecord[]): string {
  return JSON.stringify(
    pack.map((rec) => {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rec)) {
        o[k] = v instanceof Uint8Array ? `<${v.length} bytes en base64url>` : v;
      }
      return o;
    }),
  );
}
