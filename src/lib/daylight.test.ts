import { describe, expect, it } from "vitest";
import { daylight, simHour, streetLights, sunElevation } from "./daylight";

const at = (hour: number) => (hour - 6) * 3600;

describe("luz del día", () => {
  it("la simulación empieza a las 6 de la mañana", () => {
    expect(simHour(0)).toBe(6);
    expect(simHour(at(23))).toBeCloseTo(23);
    expect(simHour(at(30))).toBeCloseTo(6);
  });

  it("el sol sale a las 6, está arriba a mediodía y se pone a las 18", () => {
    expect(sunElevation(at(12))).toBeCloseTo(1);
    expect(daylight(at(6))).toBeCloseTo(0);
    expect(daylight(at(18))).toBeCloseTo(0);
    expect(daylight(at(0))).toBe(0);
  });

  it("las farolas se apagan de día y se encienden al anochecer", () => {
    expect(streetLights(at(12))).toBe(0);
    expect(streetLights(at(2))).toBe(1);
    expect(streetLights(at(18))).toBeCloseTo(1);
    expect(streetLights(at(17.6))).toBeGreaterThan(0);
    expect(streetLights(at(17.6))).toBeLessThan(1);
  });
});
