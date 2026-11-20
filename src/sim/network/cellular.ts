/**
 * Enlace celular de la estación: LTE-M con respaldo NB-IoT.
 *
 * La tecnología se elige según la cobertura (RSRP): LTE-M ofrece menos
 * retardo y más caudal; NB-IoT llega donde LTE-M ya no llega (unos 8 dB más
 * de pérdidas toleradas) a cambio de repeticiones que alargan el retardo y
 * reducen el caudal. El enlace se modela como un canal que transmite un
 * mensaje detrás de otro: si se ofrece más tráfico del que cabe, la cola crece.
 */
import type { Rng } from "../core/rng";
import type { SimParams } from "../params";

export type CellTech = "lte-m" | "nb-iot";

/** Límites de cobertura por tecnología, dBm de RSRP. */
export const COVERAGE_LIMIT: Record<CellTech, number> = { "lte-m": -118, "nb-iot": -126 };

interface TechProfile {
  /** Caudal de subida útil, bit/s. */
  upRate: number;
  /** Caudal de bajada útil, bit/s. */
  downRate: number;
  /** Mediana del retardo de acceso y transporte de un mensaje corto, s. */
  latency: number;
}

/** Perfil según la tecnología y la clase de cobertura (repeticiones). */
export function techProfile(tech: CellTech, rsrp: number): TechProfile {
  if (tech === "lte-m") {
    return rsrp >= -105
      ? { upRate: 300_000, downRate: 400_000, latency: 0.35 }
      : { upRate: 100_000, downRate: 150_000, latency: 0.9 };
  }
  if (rsrp >= -110) return { upRate: 20_000, downRate: 25_000, latency: 1.6 };
  if (rsrp >= -120) return { upRate: 6_000, downRate: 8_000, latency: 3.2 };
  return { upRate: 1_500, downRate: 2_000, latency: 7 };
}

export class CellularLink {
  private busyUp = 0;
  private busyDown = 0;
  /** Corte forzado por un escenario (caída de la red del operador). */
  outage = false;
  bytesUp = 0;
  bytesDown = 0;
  readonly bytesByTech: Record<CellTech, number> = { "lte-m": 0, "nb-iot": 0 };

  constructor(
    private readonly params: SimParams,
    private readonly rng: Rng,
  ) {}

  /** Tecnología en uso, o `null` si no hay servicio. */
  get tech(): CellTech | null {
    if (this.outage) return null;
    const { technology, rsrpDbm } = this.params.cellular;
    if (technology === "lte-m") return rsrpDbm >= COVERAGE_LIMIT["lte-m"] ? "lte-m" : null;
    if (technology === "nb-iot") return rsrpDbm >= COVERAGE_LIMIT["nb-iot"] ? "nb-iot" : null;
    if (rsrpDbm >= COVERAGE_LIMIT["lte-m"]) return "lte-m";
    if (rsrpDbm >= COVERAGE_LIMIT["nb-iot"]) return "nb-iot";
    return null;
  }

  get available(): boolean {
    return this.tech !== null;
  }

  /** Hay cobertura de radio aunque la plataforma no sea accesible (para el SMS). */
  get hasRadioCoverage(): boolean {
    return this.params.cellular.rsrpDbm >= COVERAGE_LIMIT["nb-iot"];
  }

  /**
   * Programa el envío de `bytes` hacia la plataforma y devuelve cuándo llegan
   * (o `null` si no hay servicio). Los mensajes se transmiten en serie.
   */
  sendUp(now: number, bytes: number): { arrival: number; start: number } | null {
    const tech = this.tech;
    if (!tech) return null;
    const prof = techProfile(tech, this.params.cellular.rsrpDbm);
    const start = Math.max(now, this.busyUp);
    const tx = (bytes * 8) / prof.upRate;
    this.busyUp = start + tx;
    this.bytesUp += bytes;
    this.bytesByTech[tech] += bytes;
    return { start, arrival: start + tx + this.rng.logNormal(prof.latency, 1.6) };
  }

  /** Programa un envío de la plataforma a la estación. */
  sendDown(now: number, bytes: number): { arrival: number; start: number } | null {
    const tech = this.tech;
    if (!tech) return null;
    const prof = techProfile(tech, this.params.cellular.rsrpDbm);
    const start = Math.max(now, this.busyDown);
    const tx = (bytes * 8) / prof.downRate;
    this.busyDown = start + tx;
    this.bytesDown += bytes;
    this.bytesByTech[tech] += bytes;
    return { start, arrival: start + tx + this.rng.logNormal(prof.latency, 1.6) };
  }

  /** Cuenta bytes de control (confirmaciones, keepalive) sin ocupar el canal de forma apreciable. */
  account(up: number, down: number): void {
    const tech = this.tech;
    this.bytesUp += up;
    this.bytesDown += down;
    if (tech) this.bytesByTech[tech] += up + down;
  }

  /** Retraso acumulado en la cola de subida, s. */
  backlog(now: number): number {
    return Math.max(0, this.busyUp - now);
  }
}
