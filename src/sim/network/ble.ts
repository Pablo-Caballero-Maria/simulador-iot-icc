/**
 * Enlace Bluetooth Low Energy entre el wearable (periférico) y la estación
 * (central).
 *
 * Modelo de propagación en interiores: pérdida logarítmica con la distancia,
 * tabiques, atenuación del cuerpo y desvanecimiento lento aleatorio. El
 * enlace usa LE 1M y pasa a LE Coded (unas cuatro veces más alcance) con poca
 * señal; si la señal no alcanza la sensibilidad durante el tiempo de
 * supervisión, la conexión se pierde y el wearable guarda los datos.
 */
import type { Rng } from "../core/rng";
import type { SimParams } from "../params";
import { ROOMS, type Vec2, distance, roomAt, wallsBetween } from "../physiology/home";

/** Pérdida a 1 m en 2,4 GHz, dB. */
const PL_1M = 40;
/** Exponente de pérdidas en interiores con mobiliario. */
const PATH_LOSS_EXPONENT = 2.7;
/** Sensibilidad del receptor (nRF52840), dBm. */
export const SENSITIVITY = { "1M": -95, coded: -103 } as const;
/** Tiempo de supervisión: sin paquetes durante este tiempo, la conexión cae. */
const SUPERVISION_TIMEOUT = 4;
/** Caudal útil con extensión de longitud de datos, bit/s. */
const THROUGHPUT = { "1M": 200_000, coded: 25_000 } as const;
/** Carga útil máxima por paquete del enlace (DLE), bytes. */
const LL_PAYLOAD = 244;

export type BlePhy = "1M" | "coded";
export type BleState = "connected" | "disconnected";

export interface BleUpdate {
  connected?: boolean;
  disconnected?: boolean;
  phyChanged?: BlePhy;
}

export class BleLink {
  state: BleState = "connected";
  phy: BlePhy = "1M";
  rssi = -60;
  private shadowing = 0;
  private belowSince: number | null = null;
  private reconnectAt: number | null = null;
  private lastUpdate = 0;
  bytesUp = 0;
  bytesDown = 0;
  /** Segundos acumulados en cada estado (para estadísticas). */
  readonly timeIn = { "1M": 0, coded: 0, disconnected: 0 };

  constructor(
    private readonly params: SimParams,
    private readonly rng: Rng,
  ) {}

  /** RSSI medio esperado entre dos puntos, sin desvanecimiento, dBm. */
  static meanRssi(a: Vec2, b: Vec2, txPowerDbm: number, wallLossDb: number, bodyLossDb: number): number {
    const d = Math.max(distance(a, b), 0.3);
    const walls = wallsBetween(a, b);
    const extra = Math.max(ROOMS[roomAt(a)].extraLossDb, ROOMS[roomAt(b)].extraLossDb);
    return txPowerDbm - PL_1M - 10 * PATH_LOSS_EXPONENT * Math.log10(d) - walls * wallLossDb - bodyLossDb - extra;
  }

  /** Actualiza el enlace con la posición del paciente. Se llama cada segundo. */
  update(t: number, wearable: Vec2, station: Vec2, bodyLossDb: number): BleUpdate {
    const p = this.params.ble;
    const dt = Math.max(0, t - this.lastUpdate);
    this.lastUpdate = t;
    // Desvanecimiento lento: proceso AR(1) con desviación de 3 dB.
    this.shadowing = 0.9 * this.shadowing + this.rng.normal(0, 3 * Math.sqrt(1 - 0.81));
    this.rssi = BleLink.meanRssi(wearable, station, p.txPowerDbm, p.wallLossDb, bodyLossDb) + this.shadowing;
    const result: BleUpdate = {};

    if (this.state === "connected") {
      this.timeIn[this.phy] += dt;
      // Cambio de PHY con histéresis de 3 dB.
      if (this.phy === "1M" && this.rssi < p.codedThresholdDbm) {
        this.phy = "coded";
        result.phyChanged = "coded";
      } else if (this.phy === "coded" && this.rssi > p.codedThresholdDbm + 3) {
        this.phy = "1M";
        result.phyChanged = "1M";
      }
      if (this.rssi < SENSITIVITY[this.phy]) {
        this.belowSince ??= t;
        if (t - this.belowSince >= SUPERVISION_TIMEOUT) {
          this.state = "disconnected";
          this.belowSince = null;
          this.reconnectAt = null;
          result.disconnected = true;
        }
      } else {
        this.belowSince = null;
      }
    } else {
      this.timeIn.disconnected += dt;
      // El wearable se anuncia cada segundo; la estación reconecta al oírlo.
      if (this.rssi > SENSITIVITY.coded + 3) {
        this.reconnectAt ??= t + this.rng.uniform(0.5, 2);
        if (t >= this.reconnectAt) {
          this.state = "connected";
          this.phy = this.rssi < p.codedThresholdDbm ? "coded" : "1M";
          this.reconnectAt = null;
          result.connected = true;
        }
      } else {
        this.reconnectAt = null;
      }
    }
    return result;
  }

  get connected(): boolean {
    return this.state === "connected";
  }

  /** Probabilidad de error de un paquete según el margen sobre la sensibilidad y la interferencia. */
  packetErrorRate(): number {
    const margin = this.rssi - SENSITIVITY[this.phy];
    const fading = 1 / (1 + Math.exp((margin - 4) / 1.5));
    return Math.min(0.95, 1 - (1 - fading) * (1 - this.params.ble.interference));
  }

  /**
   * Retardo de un envío del wearable a la estación, s: espera al siguiente
   * evento de conexión (el periférico puede usar cualquiera), tiempo en el aire
   * y reintentos de los paquetes que fallan (cada uno, un intervalo más).
   */
  uplinkDelay(bytes: number): number {
    const ci = this.params.ble.connIntervalS;
    return this.rng.uniform(0, ci) + this.airtime(bytes) + this.retries(bytes) * ci;
  }

  /**
   * Retardo de un envío de la estación al wearable, s: con latencia de
   * periférico el wearable solo escucha cada (latencia + 1) intervalos.
   */
  downlinkDelay(bytes: number): number {
    const p = this.params.ble;
    const wake = p.connIntervalS * (1 + p.peripheralLatency);
    return this.rng.uniform(0, wake) + this.airtime(bytes) + this.retries(bytes) * p.connIntervalS;
  }

  airtime(bytes: number): number {
    return (bytes * 8) / THROUGHPUT[this.phy];
  }

  private retries(bytes: number): number {
    const packets = Math.max(1, Math.ceil(bytes / LL_PAYLOAD));
    const per = this.packetErrorRate();
    let failures = 0;
    // Como mucho se cuentan 50 reintentos (más allá la conexión ya habría caído).
    for (let i = 0; i < packets && failures < 50; i++) {
      while (this.rng.chance(per) && failures < 50) failures++;
    }
    // Los fallos de paquetes distintos se recuperan en el mismo evento si hay tiempo:
    // se aproxima a un intervalo extra por cada fallo del primer paquete y uno por cada 8 del resto.
    return failures === 0 ? 0 : 1 + Math.floor((failures - 1) / 8);
  }
}
