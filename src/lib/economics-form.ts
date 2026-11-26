/**
 * Los supuestos editables de la calculadora económica (src/components/economics): sus límites, su
 * validación con zod y la conversión al modelo de src/sim/economics.ts.
 *
 * El formulario trabaja en las unidades que ve el usuario (porcentajes de 0 a 100, euros); el
 * esquema comprueba cada valor y lo convierte en EconomicInputs, partiendo de los supuestos
 * verificados de la memoria para lo que no se edita.
 */
import { z } from "@/lib/zod";
import { formatEuros, formatNumber } from "@/lib/format";
import { ECONOMIC_DEFAULTS, type EconomicInputs } from "@/sim/economics";

interface Limits {
  min: number;
  max: number;
  step: number;
}

/** Rango y paso de cada supuesto (el del deslizador y el que valida el esquema). */
export const ASSUMPTION_LIMITS = {
  hospitalizationsPerPatientYear: { min: 0.1, max: 1.2, step: 0.01 },
  reductionPct: { min: 5, max: 60, step: 1 },
  hadSharePct: { min: 0, max: 60, step: 1 },
  hospitalEpisodeCost: { min: 2000, max: 12000, step: 100 },
  hadEpisodeCost: { min: 500, max: 5000, step: 50 },
  clinicalStaff: { min: 50000, max: 300000, step: 5000 },
  kitPrice: { min: 300, max: 1500, step: 10 },
} as const satisfies Record<string, Limits>;

export type AssumptionName = keyof typeof ASSUMPTION_LIMITS;

const NUMBER_FORMAT = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

/** Un número dentro de [min, max]; el mensaje dice el rango en formato español. */
function inRange({ min, max }: Limits) {
  const message = `Entre ${NUMBER_FORMAT.format(min)} y ${NUMBER_FORMAT.format(max)}.`;
  return z.number({ error: "Escribe un número." }).min(min, { error: message }).max(max, { error: message });
}

export const assumptionsSchema = z.object(
  Object.fromEntries(Object.entries(ASSUMPTION_LIMITS).map(([name, limits]) => [name, inRange(limits)])) as Record<
    AssumptionName,
    z.ZodNumber
  >,
);

export type Assumptions = z.infer<typeof assumptionsSchema>;

/** Los supuestos del formulario aplicados sobre `base` (por defecto, los de la memoria). */
export function toEconomicInputs(a: Assumptions, base: EconomicInputs = ECONOMIC_DEFAULTS): EconomicInputs {
  return {
    ...base,
    hospitalizationsPerPatientYear: a.hospitalizationsPerPatientYear,
    reduction: a.reductionPct / 100,
    hadShare: a.hadSharePct / 100,
    hospitalEpisodeCost: a.hospitalEpisodeCost,
    hadEpisodeCost: a.hadEpisodeCost,
    capex: { ...base.capex, kitPrice: a.kitPrice },
    opex: { ...base.opex, clinicalStaff: a.clinicalStaff },
  };
}

export function fromEconomicInputs(i: EconomicInputs): Assumptions {
  return {
    hospitalizationsPerPatientYear: i.hospitalizationsPerPatientYear,
    // Redondeado: 0,3 × 100 no da exactamente 30 en coma flotante.
    reductionPct: Math.round(i.reduction * 10000) / 100,
    hadSharePct: Math.round(i.hadShare * 10000) / 100,
    hospitalEpisodeCost: i.hospitalEpisodeCost,
    hadEpisodeCost: i.hadEpisodeCost,
    clinicalStaff: i.opex.clinicalStaff,
    kitPrice: i.capex.kitPrice,
  };
}

/** Los supuestos verificados de la Tabla 8 de la memoria. */
export const ASSUMPTION_DEFAULTS: Assumptions = fromEconomicInputs(ECONOMIC_DEFAULTS);

export const sameAssumptions = (a: Assumptions, b: Assumptions): boolean =>
  (Object.keys(ASSUMPTION_LIMITS) as AssumptionName[]).every((name) => a[name] === b[name]);

export interface AssumptionField {
  name: AssumptionName;
  label: string;
  help: string;
  /** Unidad que se muestra junto al campo. */
  unit: string;
  format: (value: number) => string;
}

const percent = (value: number) => `${formatNumber(value, 0)} %`;

export const ASSUMPTION_FIELDS: AssumptionField[] = [
  {
    name: "hospitalizationsPerPatientYear",
    label: "Hospitalizaciones por IC por paciente y año",
    help: "Sin el sistema. 0,326 = reingreso cardíaco a un año del 32,6 % (CMBD, Rev Esp Cardiol 2019).",
    unit: "",
    format: (v) => formatNumber(v, 2),
  },
  {
    name: "reductionPct",
    label: "Reducción de hospitalizaciones (escenario base)",
    help: "Objetivo OE-1: al menos 25 %. El pesimista resta 5 puntos y el optimista suma 5.",
    unit: "%",
    format: percent,
  },
  {
    name: "hadSharePct",
    label: "Descompensaciones restantes atendidas en HaD",
    help: "Fracción que pasa de la planta a la hospitalización a domicilio gracias a la detección temprana.",
    unit: "%",
    format: percent,
  },
  {
    name: "hospitalEpisodeCost",
    label: "Coste de un ingreso convencional",
    help: "5 433 € por episodio de IC aguda, mediana de 7 días (registro EAHFE, Emergencias 2023).",
    unit: "€",
    format: formatEuros,
  },
  {
    name: "hadEpisodeCost",
    label: "Coste de un episodio en HaD",
    help: "1 309 € por episodio, mediana de 9 días (mismo registro).",
    unit: "€",
    format: formatEuros,
  },
  {
    name: "clinicalStaff",
    label: "Personal clínico al año",
    help: "2,5 enfermeras, 0,4 cardiólogos y guardias: la mitad del coste de operación.",
    unit: "€",
    format: formatEuros,
  },
  {
    name: "kitPrice",
    label: "Precio del kit",
    help: "Wearable, báscula y estación con dispensador: el doble del coste de los componentes (350 €).",
    unit: "€",
    format: formatEuros,
  },
];
