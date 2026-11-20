/**
 * Modelo de energía del wearable (Tabla 6 de la memoria).
 *
 * La corriente media de cada bloque procede de las hojas de características;
 * la de la radio se recalcula con los parámetros BLE y con los bytes que
 * realmente se envían, y se suman los consumos puntuales (vibración, zumbador).
 */
import type { ProcessingMode } from "../params";

/** Corriente media por bloque, mA (Tabla 6). */
export interface CurrentBreakdown {
  ecgFrontEnd: number;
  bioimpedance: number;
  accelTemp: number;
  mcuSleep: number;
  mcuStreaming: number;
  mcuProcessing: number;
  radio: number;
  misc: number;
}

export const CURRENT_TABLE: Record<ProcessingMode, CurrentBreakdown> = {
  edge: {
    ecgFrontEnd: 0.05,
    bioimpedance: 0.006,
    accelTemp: 0.008,
    mcuSleep: 0.004,
    mcuStreaming: 0,
    mcuProcessing: 0.065,
    radio: 0.008,
    misc: 0.012,
  },
  raw: {
    ecgFrontEnd: 0.05,
    bioimpedance: 0.09,
    accelTemp: 0.017,
    mcuSleep: 0.004,
    mcuStreaming: 0.07,
    mcuProcessing: 0,
    radio: 0.25,
    misc: 0.01,
  },
};

export const BLOCK_LABELS: Record<keyof CurrentBreakdown, string> = {
  ecgFrontEnd: "Front-end de ECG",
  bioimpedance: "Bioimpedancia",
  accelTemp: "Acelerómetro y temperatura",
  mcuSleep: "MCU en reposo",
  mcuStreaming: "MCU: empaquetado del flujo bruto",
  mcuProcessing: "MCU: filtrado, QRS e inferencia",
  radio: "Radio BLE",
  misc: "Flash, regulador y fugas",
};

export function totalCurrent(b: CurrentBreakdown): number {
  return Object.values(b).reduce((a, v) => a + v, 0);
}

/** Corriente de mantenimiento de la conexión con intervalo de 1 s y latencia 4, mA. */
const RADIO_KEEPALIVE_REF = 0.0078;
/** Carga por byte enviado con LE 1M, mA·s (calibrada con el escenario base: 758 B/s → 0,25 mA). */
export const RADIO_CHARGE_PER_BYTE = 0.00032;
/** Corriente anunciándose mientras está desconectado, mA. */
const ADVERTISING_CURRENT = 0.012;
/** Factor de LE Coded (S = 8) frente a LE 1M: más tiempo en el aire por byte. */
const CODED_BYTE_FACTOR = 8;
const CODED_EVENT_FACTOR = 2.5;

/** Corriente de mantenimiento de la radio según el intervalo y la latencia de periférico. */
export function radioKeepAliveCurrent(connIntervalS: number, peripheralLatency: number, coded: boolean): number {
  const wakeInterval = connIntervalS * (1 + peripheralLatency);
  return RADIO_KEEPALIVE_REF * (5 / wakeInterval) * (coded ? CODED_EVENT_FACTOR : 1);
}

export function radioByteCharge(bytes: number, coded: boolean): number {
  return bytes * RADIO_CHARGE_PER_BYTE * (coded ? CODED_BYTE_FACTOR : 1);
}

export { ADVERTISING_CURRENT };

/** Consumos puntuales, mA y s. */
export const VIBRATION = { currentMa: 70, seconds: 1.5 };
export const BUZZER = { currentMa: 10, seconds: 1.5 };

/**
 * Batería: integra la carga consumida y estima la autonomía.
 */
export class Battery {
  private usedMas = 0; // mA·s consumidos
  readonly usableMah: number;

  constructor(capacityMah: number, usableFraction: number, health: number, initialSocPct: number) {
    this.usableMah = capacityMah * usableFraction * health;
    this.usedMas = this.usableMah * 3600 * (1 - initialSocPct / 100);
  }

  /** Consume `currentMa` durante `seconds`. */
  drain(currentMa: number, seconds: number): void {
    this.usedMas = Math.min(this.usableMah * 3600, this.usedMas + currentMa * seconds);
  }

  /** Consume una carga en mA·s. */
  drainCharge(mas: number): void {
    this.usedMas = Math.min(this.usableMah * 3600, this.usedMas + mas);
  }

  get socPct(): number {
    return Math.max(0, 100 * (1 - this.usedMas / (this.usableMah * 3600)));
  }

  get remainingMah(): number {
    return Math.max(0, this.usableMah - this.usedMas / 3600);
  }

  get empty(): boolean {
    return this.socPct <= 0;
  }

  /** Autonomía con la batería llena a una corriente media dada, días (ecuación 4). */
  static autonomyDays(usableMah: number, currentMa: number): number {
    return usableMah / currentMa / 24;
  }
}
