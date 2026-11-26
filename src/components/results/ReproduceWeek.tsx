"use client";
/**
 * «Compruébalo en tu navegador»: repite la semana normal de la memoria con semillas nuevas, cada
 * una en un Web Worker (src/lib/reproduce.ts), y la pone junto a la media publicada. TanStack
 * Query lleva el estado de cada ejecución y guarda su resultado.
 */
import { useQueries } from "@tanstack/react-query";
import * as m from "motion/react-m";
import { useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/primitives";
import { fade } from "@/lib/motion";
import { FIRST_NEW_SEED, type RunOptions, normalWeekQuery } from "@/lib/reproduce";
import type { NormalWeekRun } from "@/sim/experiments";

/** Las cifras de la semana normal publicadas en la memoria (src/data/resultados.json). */
export interface PublishedWeek {
  autonomyDays: number;
  wanPerDayKB: number;
  blePerDayKB: number;
  accuracyPct: number;
  falseAlertsPerWeek: number;
}

interface ReproduceWeekProps {
  published: PublishedWeek;
  /** Crea el worker (en las pruebas, uno falso). */
  createWorker?: RunOptions["createWorker"];
}

const n = (v: number, d = 1) => v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });

const COLUMNS = ["Autonomía", "WAN", "BLE", "Acierto de la red", "Falsas alertas"] as const;

function cells(week: PublishedWeek): string[] {
  return [
    `${n(week.autonomyDays)} días`,
    `${n(week.wanPerDayKB)} KB/día`,
    `${n(week.blePerDayKB)} KB/día`,
    `${n(week.accuracyPct, 2)} %`,
    n(week.falseAlertsPerWeek, 0),
  ];
}

const fromRun = (run: NormalWeekRun): PublishedWeek => ({
  autonomyDays: run.autonomy,
  wanPerDayKB: run.wanPerDay / 1000,
  blePerDayKB: run.blePerDay / 1000,
  accuracyPct: run.accuracy * 100,
  falseAlertsPerWeek: run.falseAlerts,
});

export function ReproduceWeek({ published, createWorker }: ReproduceWeekProps) {
  const [seeds, setSeeds] = useState<number[]>([]);
  const runs = useQueries({ queries: seeds.map((seed) => normalWeekQuery(seed, { createWorker })) });
  const running = runs.some((run) => run.isPending);
  const nextSeed = (seeds.at(-1) ?? FIRST_NEW_SEED - 1) + 1;

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Compruébalo en tu navegador</h3>
          <p className="text-[12px] text-slate-500">
            Simula una semana normal con una semilla nueva, aquí mismo y en segundo plano. Cada semilla es otra semana
            distinta: las cifras deben quedar cerca de la media de la memoria.
          </p>
        </div>
        <Button onClick={() => setSeeds((list) => [...list, nextSeed])} disabled={running}>
          {running ? "Simulando…" : seeds.length ? "Simular otra semana" : "Simular una semana"}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" aria-busy={running}>
          <caption className="sr-only">Semana normal: la memoria y las simuladas en este navegador</caption>
          <thead className="text-slate-500">
            <tr>
              <th className="py-1.5 pr-3 text-left font-medium">Semana</th>
              {COLUMNS.map((column) => (
                <th key={column} className="px-3 py-1.5 text-right font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            <tr>
              <th scope="row" className="py-1.5 pr-3 text-left font-sans font-normal text-slate-700">
                Memoria (media de 5 semillas)
              </th>
              {cells(published).map((value, i) => (
                <td key={COLUMNS[i]} className="px-3 py-1.5 text-right text-slate-900">
                  {value}
                </td>
              ))}
            </tr>
            {seeds.map((seed, index) => {
              const run = runs[index]!;
              return (
                <m.tr key={seed} {...fade}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-sans font-normal text-slate-700">
                    Semilla {seed}
                  </th>
                  {run.data ? (
                    cells(fromRun(run.data)).map((value, i) => (
                      <td key={COLUMNS[i]} className="px-3 py-1.5 text-right text-cyan-800">
                        {value}
                      </td>
                    ))
                  ) : run.isError ? (
                    <td colSpan={COLUMNS.length} className="px-3 py-1.5 text-right font-sans text-rose-700">
                      No se pudo simular: {run.error.message}
                    </td>
                  ) : (
                    COLUMNS.map((column) => (
                      <td key={column} className="px-3 py-1.5">
                        <Skeleton className="ml-auto h-3.5 w-16" />
                      </td>
                    ))
                  )}
                </m.tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p role="status" className="text-[11px] text-slate-500">
        {running ? `Simulando la semana con la semilla ${seeds.at(-1)}: tarda unos segundos.` : ""}
      </p>
    </div>
  );
}
