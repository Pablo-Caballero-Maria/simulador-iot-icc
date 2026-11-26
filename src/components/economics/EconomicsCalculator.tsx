"use client";
/**
 * Calculadora del estudio económico (apartado 6.15 de la memoria). Usa el mismo modelo que la
 * memoria (src/sim/economics.ts); los valores iniciales son los supuestos verificados de la
 * Tabla 8.
 *
 * Los supuestos son un formulario de react-hook-form validado con zod (src/lib/economics-form.ts):
 * cada uno se ajusta con su deslizador o se escribe exacto en su campo. Mientras un valor escrito
 * no es válido, los resultados siguen mostrando los últimos supuestos válidos.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { type UseFormRegister, type UseFormSetValue, useForm, useWatch } from "react-hook-form";
import {
  ASSUMPTION_DEFAULTS,
  ASSUMPTION_FIELDS,
  ASSUMPTION_LIMITS,
  type AssumptionField,
  type Assumptions,
  assumptionsSchema,
  sameAssumptions,
  toEconomicInputs,
} from "@/lib/economics-form";
import { breakEvenReduction, breakEvenRisk, evaluateEconomics } from "@/sim/economics";
import { formatEuros, formatMonths, formatNumber, formatPct } from "@/lib/format";
import { MiniChart } from "@/components/ui/MiniChart";
import { Button } from "@/components/ui/primitives";

export function EconomicsCalculator() {
  const {
    control,
    register,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<Assumptions>({
    defaultValues: ASSUMPTION_DEFAULTS,
    resolver: zodResolver(assumptionsSchema),
    mode: "onChange",
  });
  const values = useWatch({ control });

  // Los últimos supuestos válidos: un valor a medio escribir no vacía los resultados.
  const [assumptions, setAssumptions] = useState(ASSUMPTION_DEFAULTS);
  const parsed = assumptionsSchema.safeParse(values);
  if (parsed.success && !sameAssumptions(parsed.data, assumptions)) setAssumptions(parsed.data);
  const inputs = useMemo(() => toEconomicInputs(assumptions), [assumptions]);

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
      <form
        noValidate
        onSubmit={(event) => event.preventDefault()}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
        aria-label="Supuestos"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Supuestos</h2>
          <Button variant="ghost" disabled={!isDirty} onClick={() => reset(ASSUMPTION_DEFAULTS)}>
            Restablecer
          </Button>
        </div>
        {ASSUMPTION_FIELDS.map((field) => (
          <AssumptionInput
            key={field.name}
            field={field}
            value={values[field.name]}
            shown={assumptions[field.name]}
            error={errors[field.name]?.message}
            register={register}
            setValue={setValue}
          />
        ))}
      </form>

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

interface AssumptionInputProps {
  field: AssumptionField;
  /** Lo que hay escrito (puede no ser válido). */
  value: number | undefined;
  /** El último valor válido, el que usan los resultados. */
  shown: number;
  error: string | undefined;
  register: UseFormRegister<Assumptions>;
  setValue: UseFormSetValue<Assumptions>;
}

/** Un supuesto: el campo numérico (el del formulario) y un deslizador que lo ajusta. */
function AssumptionInput({ field, value, shown, error, register, setValue }: AssumptionInputProps) {
  const { min, max, step } = ASSUMPTION_LIMITS[field.name];
  const id = `eco-${field.name}`;
  const slider = Number.isFinite(value) ? Math.min(max, Math.max(min, value!)) : shown;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[12px] text-slate-800">
          {field.label}
        </label>
        <span className="font-mono text-[12px] text-cyan-800">{field.format(shown)}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={slider}
          aria-label={`${field.label} (deslizador)`}
          onChange={(event) =>
            setValue(field.name, Number(event.target.value), { shouldDirty: true, shouldValidate: true })
          }
          className="min-w-0 flex-1"
        />
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          {...register(field.name, { valueAsNumber: true })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error ${id}-help` : `${id}-help`}
          className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-right font-mono text-[12px] text-slate-900 aria-invalid:border-rose-500"
        />
        <span className="w-3 text-[11px] text-slate-500">{field.unit}</span>
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-[11px] font-medium text-rose-700">
          {error}
        </p>
      ) : null}
      <p id={`${id}-help`} className="text-[11px] leading-snug text-slate-500">
        {field.help}
      </p>
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
