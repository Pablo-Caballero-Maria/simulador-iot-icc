/**
 * Recursos HL7 FHIR R4 que la plataforma publica en la historia clínica
 * (nivel 5). Solo se construyen los usados en la simulación, con sus códigos
 * LOINC y unidades UCUM, para mostrar cómo queda cada medida en la frontera
 * clínica.
 */

export interface FhirObservation {
  resourceType: "Observation";
  status: "final" | "preliminary";
  category: { coding: { system: string; code: string }[] }[];
  code: { coding: { system: string; code: string; display: string }[] };
  subject: { reference: string };
  device: { reference: string };
  effectiveDateTime: string;
  valueQuantity?: { value: number; unit: string; system: string; code: string };
}

const LOINC = "http://loinc.org";
const UCUM = "http://unitsofmeasure.org";

/** Códigos LOINC de las medidas que se publican. */
export const LOINC_CODES = {
  heartRate: { code: "8867-4", display: "Heart rate", unit: "/min" },
  respRate: { code: "9279-1", display: "Respiratory rate", unit: "/min" },
  bodyWeight: { code: "29463-7", display: "Body weight", unit: "kg" },
  bodyTemp: { code: "8310-5", display: "Body temperature", unit: "Cel" },
} as const;

export type LoincKey = keyof typeof LOINC_CODES;

/** Fecha ISO 8601 a partir de un instante de simulación (la simulación empieza el 23/11/2026 a las 06:00). */
export function simTimeToIso(t: number): string {
  const start = Date.UTC(2026, 10, 23, 5, 0, 0); // 06:00 hora peninsular (UTC+1)
  return new Date(start + t * 1000).toISOString().replace(".000Z", "Z");
}

export function observation(
  key: LoincKey,
  value: number,
  t: number,
  patientPseudonym: string,
  deviceId: string,
): FhirObservation {
  const c = LOINC_CODES[key];
  return {
    resourceType: "Observation",
    status: "final",
    category: [
      { coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs" }] },
    ],
    code: { coding: [{ system: LOINC, code: c.code, display: c.display }] },
    subject: { reference: `Patient/${patientPseudonym}` },
    device: { reference: `Device/${deviceId}` },
    effectiveDateTime: simTimeToIso(t),
    valueQuantity: { value: Math.round(value * 10) / 10, unit: c.unit, system: UCUM, code: c.unit },
  };
}
