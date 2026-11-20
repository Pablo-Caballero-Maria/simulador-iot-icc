/**
 * Firma de las órdenes de dosis (ECDSA P-256 con SHA-256).
 *
 * El cardiólogo firma con su clave personal; el microcontrolador del
 * dispensador solo conoce la clave pública y rechaza cualquier orden cuya
 * firma no sea válida. Ni la estación ni la plataforma tienen la clave
 * privada: aunque un atacante las controle, no puede crear órdenes (T1).
 */
import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { encodeCbor } from "../protocols/cbor";
import type { DoseOrder } from "../records";

export interface KeyPair {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

/** Par de claves determinista a partir de una etiqueta (para reproducir las ejecuciones). */
export function deriveKeyPair(label: string): KeyPair {
  const secretKey = sha256(new TextEncoder().encode(`clave-simulada:${label}`));
  return { secretKey, publicKey: p256.getPublicKey(secretKey) };
}

/** Bytes canónicos que se firman: los campos que determinan la dosis, en CBOR. */
export function orderSigningBytes(o: DoseOrder): Uint8Array {
  return encodeCbor([o.orderId, o.seq, o.patient, o.drug, o.doseMg, Math.round(o.validFrom), Math.round(o.validUntil)]);
}

export function signOrder(o: DoseOrder, secretKey: Uint8Array): string {
  return toHex(p256.sign(orderSigningBytes(o), secretKey));
}

export function verifyOrder(o: DoseOrder, publicKey: Uint8Array): boolean {
  if (!o.signature || o.signature.length !== 128) return false;
  try {
    return p256.verify(fromHex(o.signature), orderSigningBytes(o), publicKey);
  } catch {
    return false;
  }
}

export function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function fromHex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16);
  return out;
}
