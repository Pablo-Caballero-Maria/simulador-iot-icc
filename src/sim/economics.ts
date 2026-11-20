/**
 * Estudio económico (apartado 6.15 de la memoria), desde la perspectiva del
 * hospital, para una cohorte de 500 pacientes seguida 12 meses.
 *
 * Datos de partida verificados:
 * - Reingreso por causa cardíaca a un año tras un ingreso por IC: 32,6 %
 *   (Martínez-Santos et al., Rev Esp Cardiol 2019, CMBD del SNS; la revisión
 *   de la SEC de 2025 da un intervalo de 28,4–32,6 %). Se usa como número de
 *   hospitalizaciones por paciente y año, lo que subestima los reingresos
 *   múltiples (supuesto conservador).
 * - Coste directo medio de un episodio de IC aguda: 5 433 € en hospitalización
 *   convencional (mediana de 7 días) y 1 309 € en hospitalización a domicilio
 *   (mediana de 9 días) (registro EAHFE, Emergencias 2023;35:176-184).
 */

export interface EconomicInputs {
  patients: number;
  /** Hospitalizaciones por IC por paciente y año sin el sistema. */
  hospitalizationsPerPatientYear: number;
  /** Reducción de hospitalizaciones conseguida (0–1). */
  reduction: number;
  /** Fracción de las descompensaciones restantes que se atienden en HaD (0–1). */
  hadShare: number;
  /** Coste de un episodio en hospitalización convencional, €. */
  hospitalEpisodeCost: number;
  /** Coste de un episodio en hospitalización a domicilio, €. */
  hadEpisodeCost: number;
  /** Estancia mediana de un ingreso convencional, días. */
  lengthOfStayDays: number;
  capex: { kits: number; kitPrice: number; mobileGateways: number; integration: number };
  opex: {
    simEurMonth: number;
    simCount: number;
    cloudEurMonth: number;
    serviceEurPatientMonth: number;
    consumables: number;
    clinicalStaff: number;
  };
}

export const ECONOMIC_DEFAULTS: EconomicInputs = {
  patients: 500,
  hospitalizationsPerPatientYear: 0.326,
  reduction: 0.3,
  hadShare: 0.25,
  hospitalEpisodeCost: 5433,
  hadEpisodeCost: 1309,
  lengthOfStayDays: 7,
  capex: { kits: 550, kitPrice: 700, mobileGateways: 16500, integration: 60000 },
  opex: {
    simEurMonth: 1.5,
    simCount: 550,
    cloudEurMonth: 1000,
    serviceEurPatientMonth: 10,
    consumables: 66600,
    clinicalStaff: 163500,
  },
};

export interface EconomicResult {
  capex: number;
  opex: number;
  opexBreakdown: Record<string, number>;
  baselineHospitalizations: number;
  avoided: number;
  treatedAtHome: number;
  annualSavings: number;
  netAnnual: number;
  /** Meses hasta recuperar la inversión (Infinity si nunca). */
  paybackMonths: number;
  /** ROI a tres años: 3A / (CAPEX + 3·OPEX) − 1. */
  roi3: number;
  bedDaysFreed: number;
  costPerPatientMonth: number;
  /** Flujo de caja acumulado al final de cada mes (36 meses). */
  cashflow: number[];
}

export function evaluateEconomics(i: EconomicInputs): EconomicResult {
  const capex = i.capex.kits * i.capex.kitPrice + i.capex.mobileGateways + i.capex.integration;
  const opexBreakdown = {
    "Conectividad (APN privado)": i.opex.simCount * i.opex.simEurMonth * 12,
    "Nube en la UE": i.opex.cloudEurMonth * 12,
    "Servicio del fabricante": i.opex.serviceEurPatientMonth * i.patients * 12,
    "Electrodos, logística y reparaciones": i.opex.consumables,
    "Personal clínico": i.opex.clinicalStaff,
  };
  const opex = Object.values(opexBreakdown).reduce((a, b) => a + b, 0);
  const baseline = i.patients * i.hospitalizationsPerPatientYear;
  const avoided = baseline * i.reduction;
  const treatedAtHome = (baseline - avoided) * i.hadShare;
  // Ecuación (5): ingresos evitados + ingresos que pasan a HaD.
  const annualSavings = avoided * i.hospitalEpisodeCost + treatedAtHome * (i.hospitalEpisodeCost - i.hadEpisodeCost);
  const netAnnual = annualSavings - opex;
  // Ecuación (6).
  const paybackMonths = netAnnual > 0 ? (capex / netAnnual) * 12 : Number.POSITIVE_INFINITY;
  const roi3 = (3 * annualSavings) / (capex + 3 * opex) - 1;
  const cashflow: number[] = [];
  for (let m = 1; m <= 36; m++) cashflow.push(-capex + (netAnnual / 12) * m);
  return {
    capex,
    opex,
    opexBreakdown,
    baselineHospitalizations: baseline,
    avoided,
    treatedAtHome,
    annualSavings,
    netAnnual,
    paybackMonths,
    roi3,
    bedDaysFreed: (avoided + treatedAtHome) * i.lengthOfStayDays,
    costPerPatientMonth: opex / i.patients / 12 + capex / 3 / i.patients / 12,
    cashflow,
  };
}

export type ScenarioName = "pesimista" | "base" | "optimista";

/** Escenarios del análisis de sensibilidad (Tabla 22). */
export const SENSITIVITY: Record<ScenarioName, Partial<EconomicInputs>> = {
  pesimista: { reduction: 0.25, hadShare: 0.15 },
  base: { reduction: 0.3, hadShare: 0.25 },
  optimista: { reduction: 0.35, hadShare: 0.35 },
};

export function sensitivity(base: EconomicInputs = ECONOMIC_DEFAULTS): Record<ScenarioName, EconomicResult> {
  return {
    pesimista: evaluateEconomics({ ...base, ...SENSITIVITY.pesimista }),
    base: evaluateEconomics({ ...base, ...SENSITIVITY.base }),
    optimista: evaluateEconomics({ ...base, ...SENSITIVITY.optimista }),
  };
}

/** Reducción mínima de hospitalizaciones para recuperar la inversión en `months` meses. */
export function breakEvenReduction(base: EconomicInputs = ECONOMIC_DEFAULTS, months = 36): number {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (evaluateEconomics({ ...base, reduction: mid }).paybackMonths <= months) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Hospitalizaciones por paciente y año necesarias para recuperar la inversión en `months` meses. */
export function breakEvenRisk(base: EconomicInputs = ECONOMIC_DEFAULTS, months = 36): number {
  let lo = 0;
  let hi = 3;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (evaluateEconomics({ ...base, hospitalizationsPerPatientYear: mid }).paybackMonths <= months) hi = mid;
    else lo = mid;
  }
  return hi;
}
