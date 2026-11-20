/**
 * Báscula BLE comercial (perfil estándar Weight Scale). Cada mañana, cuando
 * el paciente se pesa, envía la medida a la estación, que decide si es válida.
 */
import { DAY, nextTimeOfDay } from "../core/time";
import { SPOTS, distance } from "../physiology/home";
import type { Patient } from "../physiology/patient";
import type { SimContext } from "../types";

/** Medida del perfil Weight Scale: flags, peso (uint16, 5 g) e instante. */
export const WEIGHT_MEASUREMENT_BYTES = 12;

export class Scale {
  constructor(
    private readonly ctx: SimContext,
    private readonly patient: Patient,
    private readonly deliver: (kg: number, t: number) => void,
  ) {}

  start(): void {
    const s = this.ctx.scheduler;
    s.every(nextTimeOfDay(s.now, 7.15), DAY, "scale-weigh", (t) => {
      // Solo hay pesaje si el paciente está realmente sobre la báscula.
      if (distance(this.patient.position(), SPOTS.scale) < 1) this.measure(this.patient.weighKg(), t);
    });
  }

  /** Una medida (del paciente o de otra persona). */
  measure(kg: number, t: number): void {
    const arrival = t + 0.6 + this.ctx.rng.uniform(0, 0.5);
    this.ctx.transmit({
      link: "ble-scale",
      from: "scale",
      to: "station",
      kind: "weight",
      label: `Peso ${kg.toFixed(1).replace(".", ",")} kg (Weight Scale)`,
      bytes: WEIGHT_MEASUREMENT_BYTES,
      payloadBytes: WEIGHT_MEASUREMENT_BYTES,
      tStart: t,
      tEnd: arrival,
    });
    this.ctx.scheduler.at(arrival, "scale-rx", (now) => this.deliver(kg, now));
  }
}
