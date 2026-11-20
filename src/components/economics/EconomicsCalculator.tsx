"use client";
/**
 * Calculadora del estudio económico (apartado 6.15 de la memoria). Usa el
 * mismo modelo que la memoria (src/sim/economics.ts); los valores iniciales
 * son los supuestos verificados de la Tabla 8.
 */
import { useMemo, useState } from "react";
import {
  ECONOMIC_DEFAULTS,
  type EconomicInputs,
  breakEvenReduction,
  breakEvenRisk,
  evaluateEconomics,
} from "@/sim/economics";
import { formatEuros, formatMonths, formatNumber, formatPct } from "@/lib/format";
import { MiniChart } from "@/components/ui/MiniChart";
import { Button } from "@/components/ui/primitives";

interface Field {
  label: string;
  help: string;
  get: (i: EconomicInputs) => number;
  set: (i: EconomicInputs, v: number) => EconomicInputs;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const FIELDS: Field[] = [
  {
    label: "Hospitalizaciones por IC por paciente y año",
    help: "Sin el sistema. 0,326 = reingreso cardíaco a un año del 32,6 % (CMBD, Rev Esp Cardiol 2019).",
    get: (i) => i.hospitalizationsPerPatientYear,
    set: (i, v) => ({ ...i, hospitalizationsPerPatientYear: v }),
    min: 0.1,
    max: 1.2,
    step: 0.01,
    format: (v) => formatNumber(v, 2),
  },
  {
    label: "Reducción de hospitalizaciones (escenario base)",
    help: "Objetivo OE-1: al menos 25 %. El pesimista resta 5 puntos y el optimista suma 5.",
    get: (i) => i.reduction,
    set: (i, v) => ({ ...i, reduction: v }),
    min: 0.05,
    max: 0.6,
    step: 0.01,
    format: (v) => formatPct(v, 0),
  },
  {
    label: "Descompensaciones restantes atendidas en HaD",
    help: "Fracción que pasa de la planta a la hospitalización a domicilio gracias a la detección temprana.",
    get: (i) => i.hadShare,
    set: (i, v) => ({ ...i, hadShare: v }),
    min: 0,
    max: 0.6,
    step: 0.01,
    format: (v) => formatPct(v, 0),
  },
  {
    label: "Coste de un ingreso convencional",
    help: "5 433 € por episodio de IC aguda, mediana de 7 días (registro EAHFE, Emergencias 2023).",
    get: (i) => i.hospitalEpisodeCost,
    set: (i, v) => ({ ...i, hospitalEpisodeCost: v }),
    min: 2000,
    max: 12000,
    step: 100,
    format: formatEuros,
  },
  {
    label: "Coste de un episodio en HaD",
    help: "1 309 € por episodio, mediana de 9 días (mismo registro).",
    get: (i) => i.hadEpisodeCost,
    set: (i, v) => ({ ...i, hadEpisodeCost: v }),
    min: 500,
    max: 5000,
    step: 50,
    format: formatEuros,
  },
  {
    label: "Personal clínico al año",
    help: "2,5 enfermeras, 0,4 cardiólogos y guardias: la mitad del coste de operación.",
    get: (i) => i.opex.clinicalStaff,
    set: (i, v) => ({ ...i, opex: { ...i.opex, clinicalStaff: v } }),
    min: 50000,
    max: 300000,
    step: 5000,
    format: formatEuros,
  },
  {
    label: "Precio del kit",
    help: "Wearable, báscula y estación con dispensador: el doble del coste de los componentes (350 €).",
    get: (i) => i.capex.kitPrice,
    set: (i, v) => ({ ...i, capex: { ...i.capex, kitPrice: v } }),
    min: 300,
    max: 1500,
    step: 10,
    format: formatEuros,
  },
];

export function EconomicsCalculator() {
  const [inputs, setInputs] = useState<EconomicInputs>(ECONOMIC_DEFAULTS);
  const scenarios = useMemo(() => {
    const base = inputs.reduction;
    const had = inputs.hadShare;
    const delta = {
      pesimista: { reduction: Math.max(0, base - 0.05), hadShare: Math.max(0, had - 0.1) },
      base: { reduction: base, hadShare: had },
      optimista: { reduction: base + 0.05, hadShare: had + 0.1 },
    };
    return {
      pesimista: evaluateEconomics({ ...inputs, ...delta.pesimista }),
      base: evaluateEconomics({ ...inputs, ...delta.base }),
      optimista: evaluateEconomics({ ...inputs, ...delta.optimista }),
    };
  }, [inputs]);
  const be = useMemo(() => ({ reduction: breakEvenReduction(inputs), risk: breakEvenRisk(inputs) }), [inputs]);
  const isDefault = JSON.stringify(inputs) === JSON.stringify(ECONOMIC_DEFAULTS);

  const rows: [string, (r: ReturnType<typeof evaluateEconomics>) => string][] = [
    ["Hospitalizaciones evitadas al año", (r) => formatNumber(r.avoided, 1)],
    ["Descompensaciones atendidas en HaD", (r) => formatNumber(r.treatedAtHome, 1)],
    ["Ahorro anual (A)", (r) => formatEuros(r.annualSavings)],
    ["Ahorro neto (A − OPEX)", (r) => formatEuros(r.netAnnual)],
    ["Recuperación de la inversión", (r) => formatMonths(r.paybackMonths)],
    ["ROI a 3 años", (r) => formatPct(r.roi3, 1)],
    ["Estancias liberadas al año", (r) => formatNumber(r.bedDaysFreed, 0)],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4" aria-label="Supuestos">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Supuestos</h2>
          <Button variant="ghost" disabled={isDefault} onClick={() => setInputs(ECONOMIC_DEFAULTS)}>
            Restablecer
          </Button>
        </div>
        {FIELDS.map((f) => {
          const id = `eco-${f.label}`;
          return (
            <div key={f.label} className="space-y-1">
              <label htmlFor={id} className="flex justify-between gap-2 text-[12px] text-slate-800">
                <span>{f.label}</span>
                <span className="font-mono text-cyan-800">{f.format(f.get(inputs))}</span>
              </label>
              <input
                id={id}
                type="range"
                min={f.min}
                max={f.max}
                step={f.step}
                value={f.get(inputs)}
                onChange={(e) => setInputs(f.set(inputs, Number(e.target.value)))}
                className="w-full"
              />
              <p className="text-[11px] leading-snug text-slate-500">{f.help}</p>
            </div>
          );
        })}
      </section>

      <section className="space-y-5" aria-label="Resultados">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Inversión (CAPEX)" value={formatEuros(scenarios.base.capex)} />
          <Kpi label="Operación al año (OPEX)" value={formatEuros(scenarios.base.opex)} />
          <Kpi
            label="Coste por paciente y mes"
            value={formatEuros(scenarios.base.costPerPatientMonth)}
            hint="Con el CAPEX repartido en 3 años (P1: ≤ 90 €)"
          />
          <Kpi
            label="Recuperación (base)"
            value={formatMonths(scenarios.base.paybackMonths)}
            hint="Objetivo OE-9: ≤ 36 meses"
            bad={!(scenarios.base.paybackMonths <= 36)}
          />
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-[12px]">
            <caption className="sr-only">Análisis de sensibilidad</caption>
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Magnitud</th>
                <th className="px-3 py-2 text-right font-medium">Pesimista</th>
                <th className="px-3 py-2 text-right font-medium">Base</th>
                <th className="px-3 py-2 text-right font-medium">Optimista</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-3 py-1.5 text-slate-700">Reducción / atención en HaD</td>
                {(["pesimista", "base", "optimista"] as const).map((k) => (
                  <td key={k} className="px-3 py-1.5 text-right font-mono">
                    {formatPct(
                      k === "base"
                        ? inputs.reduction
                        : k === "pesimista"
                          ? Math.max(0, inputs.reduction - 0.05)
                          : inputs.reduction + 0.05,
                      0,
                    )}{" "}
                    /{" "}
                    {formatPct(
                      k === "base"
                        ? inputs.hadShare
                        : k === "pesimista"
                          ? Math.max(0, inputs.hadShare - 0.1)
                          : inputs.hadShare + 0.1,
                      0,
                    )}
                  </td>
                ))}
              </tr>
              {rows.map(([label, fn]) => (
                <tr key={label}>
                  <td className="px-3 py-1.5 text-slate-700">{label}</td>
                  {(["pesimista", "base", "optimista"] as const).map((k) => (
                    <td key={k} className="px-3 py-1.5 text-right font-mono text-slate-900">
                      {fn(scenarios[k])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Flujo de caja acumulado (€)</h3>
          <MiniChart
            width={720}
            height={260}
            xLabel="meses"
            formatY={(y) => `${formatNumber(y / 1000, 0)} k€`}
            threshold={{ y: 0, label: "inversión recuperada" }}
            series={[
              {
                label: "Pesimista",
                color: "#e11d48",
                points: scenarios.pesimista.cashflow.map((y, i) => ({ x: i + 1, y })),
              },
              { label: "Base", color: "#0891b2", points: scenarios.base.cashflow.map((y, i) => ({ x: i + 1, y })) },
              {
                label: "Optimista",
                color: "#059669",
                points: scenarios.optimista.cashflow.map((y, i) => ({ x: i + 1, y })),
              },
            ]}
          />
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-[13px] leading-relaxed text-slate-800">
          <p>
            Para recuperar la inversión en tres años con estos supuestos hace falta reducir las hospitalizaciones al
            menos un <strong className="text-amber-800">{formatPct(be.reduction, 1)}</strong>, o bien seleccionar
            pacientes con al menos <strong className="text-amber-800">{formatNumber(be.risk, 2)}</strong>{" "}
            hospitalizaciones por IC al año (con la reducción del escenario base). Con los datos españoles verificados,
            el sistema solo se autofinancia en tres años si se dirige a los pacientes de mayor riesgo o si se reduce el
            coste de personal.
          </p>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-500">
          Ahorro anual A = N<sub>ev</sub>·C<sub>ingreso</sub> + N<sub>HaD</sub>·(C<sub>ingreso</sub> − C<sub>HaD</sub>);
          recuperación = CAPEX / (A − OPEX); ROI<sub>3</sub> = 3A / (CAPEX + 3·OPEX) − 1. Fuentes: RECALCAR 2011-2020
          (Rev Esp Cardiol 2023), revisión de la carga de la IC en España (congreso SEC 2025), registro EAHFE
          (Emergencias 2023;35:176-184). Perspectiva del hospital, 500 pacientes durante 12 meses, kits reutilizados en
          tres cohortes.
        </p>
      </section>
    </div>
  );
}

function Kpi({ label, value, hint, bad }: { label: string; value: string; hint?: string; bad?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-lg ${bad ? "text-rose-700" : "text-slate-900"}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div> : null}
    </div>
  );
}
