/**
 * Codificador CBOR (RFC 8949) mínimo: enteros, cadenas de bytes y de texto,
 * listas, mapas, booleanos, nulo y números en coma flotante (con la
 * representación más corta que conserve el valor: 16, 32 o 64 bit).
 *
 * Genera los bytes reales que viajan por la red en la simulación; los tests
 * lo comprueban con los ejemplos del apéndice A de la RFC.
 */

export type CborValue =
  | number
  | bigint
  | string
  | boolean
  | null
  | Uint8Array
  | CborValue[]
  | Map<CborValue, CborValue>
  | { [key: string]: CborValue };

class ByteWriter {
  private buf = new Uint8Array(256);
  private len = 0;

  private ensure(n: number) {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  byte(b: number) {
    this.ensure(1);
    this.buf[this.len++] = b;
  }

  bytes(b: Uint8Array) {
    this.ensure(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
  }

  result(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

function writeHead(w: ByteWriter, major: number, value: number | bigint): void {
  const m = major << 5;
  const v = typeof value === "bigint" ? value : BigInt(value);
  if (v < 24n) w.byte(m | Number(v));
  else if (v < 0x100n) {
    w.byte(m | 24);
    w.byte(Number(v));
  } else if (v < 0x10000n) {
    w.byte(m | 25);
    w.byte(Number(v >> 8n));
    w.byte(Number(v & 0xffn));
  } else if (v < 0x100000000n) {
    w.byte(m | 26);
    for (let s = 24n; s >= 0n; s -= 8n) w.byte(Number((v >> s) & 0xffn));
  } else {
    w.byte(m | 27);
    for (let s = 56n; s >= 0n; s -= 8n) w.byte(Number((v >> s) & 0xffn));
  }
}

/** Convierte a binary16 si el valor se representa exactamente; si no, devuelve null. */
function toFloat16(value: number): number | null {
  if (Number.isNaN(value)) return 0x7e00;
  if (value === Infinity) return 0x7c00;
  if (value === -Infinity) return 0xfc00;
  if (value === 0) return Object.is(value, -0) ? 0x8000 : 0;
  const sign = value < 0 ? 0x8000 : 0;
  const abs = Math.abs(value);
  const exp = Math.floor(Math.log2(abs));
  if (exp > 15) return null;
  if (exp >= -14) {
    const mant = abs / 2 ** exp - 1;
    const m10 = mant * 1024;
    if (!Number.isInteger(m10)) return null;
    return sign | ((exp + 15) << 10) | m10;
  }
  // Subnormal
  const m = abs / 2 ** -24;
  if (!Number.isInteger(m) || m >= 1024) return null;
  return sign | m;
}

function writeFloat(w: ByteWriter, value: number): void {
  const half = toFloat16(value);
  if (half !== null) {
    w.byte(0xf9);
    w.byte(half >> 8);
    w.byte(half & 0xff);
    return;
  }
  const f32 = Math.fround(value);
  if (f32 === value) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, value);
    w.byte(0xfa);
    w.bytes(b);
    return;
  }
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, value);
  w.byte(0xfb);
  w.bytes(b);
}

const textEncoder = new TextEncoder();

function writeValue(w: ByteWriter, v: CborValue): void {
  if (v === null) return w.byte(0xf6);
  if (v === true) return w.byte(0xf5);
  if (v === false) return w.byte(0xf4);
  if (typeof v === "bigint") return v >= 0n ? writeHead(w, 0, v) : writeHead(w, 1, -1n - v);
  if (typeof v === "number") {
    if (Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER && !Object.is(v, -0)) {
      return v >= 0 ? writeHead(w, 0, v) : writeHead(w, 1, -1 - v);
    }
    return writeFloat(w, v);
  }
  if (typeof v === "string") {
    const b = textEncoder.encode(v);
    writeHead(w, 3, b.length);
    return w.bytes(b);
  }
  if (v instanceof Uint8Array) {
    writeHead(w, 2, v.length);
    return w.bytes(v);
  }
  if (Array.isArray(v)) {
    writeHead(w, 4, v.length);
    for (const item of v) writeValue(w, item);
    return;
  }
  if (v instanceof Map) {
    writeHead(w, 5, v.size);
    for (const [k, val] of v) {
      writeValue(w, k);
      writeValue(w, val);
    }
    return;
  }
  const entries = Object.entries(v);
  writeHead(w, 5, entries.length);
  for (const [k, val] of entries) {
    writeValue(w, k);
    writeValue(w, val);
  }
}

/** Codifica un valor en CBOR. */
export function encodeCbor(value: CborValue): Uint8Array {
  const w = new ByteWriter();
  writeValue(w, value);
  return w.result();
}

/** Notación de diagnóstico de CBOR (RFC 8949 §8), para mostrar en pantalla. */
export function cborDiagnostic(value: CborValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return Number(value.toPrecision(7)).toString();
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (value instanceof Uint8Array) {
    const head = Array.from(value.subarray(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
    return value.length > 12 ? `h'${head}…' (${value.length} bytes)` : `h'${head}'`;
  }
  if (Array.isArray(value)) return `[${value.map(cborDiagnostic).join(", ")}]`;
  const entries = value instanceof Map ? [...value.entries()] : Object.entries(value);
  return `{${entries.map(([k, v]) => `${cborDiagnostic(k as CborValue)}: ${cborDiagnostic(v)}`).join(", ")}}`;
}

/** Volcado hexadecimal de los primeros bytes. */
export function hexDump(bytes: Uint8Array, max = 64): string {
  const shown = Array.from(bytes.subarray(0, max), (b) => b.toString(16).padStart(2, "0"));
  const lines: string[] = [];
  for (let i = 0; i < shown.length; i += 16) lines.push(shown.slice(i, i + 16).join(" "));
  if (bytes.length > max) lines.push(`… (${bytes.length - max} bytes más)`);
  return lines.join("\n");
}
