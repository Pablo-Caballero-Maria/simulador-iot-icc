import { describe, expect, it } from "vitest";
import { ECONOMIC_DEFAULTS } from "@/sim/economics";
import {
  ASSUMPTION_DEFAULTS,
  ASSUMPTION_FIELDS,
  ASSUMPTION_LIMITS,
  assumptionsSchema,
  fromEconomicInputs,
  sameAssumptions,
  toEconomicInputs,
} from "./economics-form";

describe("supuestos de la calculadora", () => {
  it("parten de los supuestos verificados de la memoria, en porcentaje", () => {
    expect(ASSUMPTION_DEFAULTS).toMatchObject({ reductionPct: 30, hadSharePct: 25, kitPrice: 700 });
    expect(toEconomicInputs(ASSUMPTION_DEFAULTS)).toEqual(ECONOMIC_DEFAULTS);
    expect(fromEconomicInputs(toEconomicInputs(ASSUMPTION_DEFAULTS))).toEqual(ASSUMPTION_DEFAULTS);
  });

  it("convierten los porcentajes y cambian solo lo editable", () => {
    const inputs = toEconomicInputs({ ...ASSUMPTION_DEFAULTS, reductionPct: 40, clinicalStaff: 100000 });
    expect(inputs.reduction).toBe(0.4);
    expect(inputs.opex).toEqual({ ...ECONOMIC_DEFAULTS.opex, clinicalStaff: 100000 });
    expect(inputs.capex).toEqual(ECONOMIC_DEFAULTS.capex);
  });

  it("los valores por defecto están dentro de sus límites, y cada campo tiene los suyos", () => {
    expect(assumptionsSchema.parse(ASSUMPTION_DEFAULTS)).toEqual(ASSUMPTION_DEFAULTS);
    expect(ASSUMPTION_FIELDS.map((f) => f.name).sort()).toEqual(Object.keys(ASSUMPTION_LIMITS).sort());
  });

  it("rechazan lo que está fuera de rango o no es un número, con el rango en español", () => {
    const result = assumptionsSchema.safeParse({ ...ASSUMPTION_DEFAULTS, kitPrice: 99, hadSharePct: Number.NaN });
    expect(result.success).toBe(false);
    const messages = Object.fromEntries(result.error!.issues.map((issue) => [issue.path[0], issue.message]));
    expect(messages).toEqual({ kitPrice: "Entre 300 y 1500.", hadSharePct: "Escribe un número." });
    expect(
      assumptionsSchema.safeParse({ ...ASSUMPTION_DEFAULTS, hospitalizationsPerPatientYear: 1.3 }).error!.issues[0]!
        .message,
    ).toBe("Entre 0,1 y 1,2.");
  });

  it("comparan supuestos campo a campo", () => {
    expect(sameAssumptions(ASSUMPTION_DEFAULTS, { ...ASSUMPTION_DEFAULTS })).toBe(true);
    expect(sameAssumptions(ASSUMPTION_DEFAULTS, { ...ASSUMPTION_DEFAULTS, kitPrice: 710 })).toBe(false);
  });
});
