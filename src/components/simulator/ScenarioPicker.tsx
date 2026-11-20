"use client";
/** Selector de escenario: un botón con el escenario actual que despliega la lista. */
import { useCallback, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { SCENARIOS } from "@/sim/scenarios";
import { SPEED_LABELS, useSimStore } from "@/lib/sim-store";
import { useDismiss } from "@/lib/use-dismiss";
import { cx } from "@/components/ui/primitives";

export function ScenarioPicker() {
  const scenarioId = useSimStore((s) => s.scenarioId);
  const load = useSimStore((s) => s.load);
  const setPlaying = useSimStore((s) => s.setPlaying);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, open, close);
  const current = SCENARIOS.find((s) => s.id === scenarioId)!;

  return (
    <div ref={box} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex max-w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-left shadow-sm transition-colors hover:border-slate-300"
      >
        <span className="hidden text-[11px] text-slate-500 sm:inline">Escenario</span>
        <span className="truncate text-xs font-semibold text-slate-900">{current.title}</span>
        <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {open ? (
        <div className="animate-rise-in absolute top-full left-0 z-30 mt-2 w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <ul role="listbox" aria-label="Escenarios" className="scroll-thin max-h-[55vh] overflow-y-auto p-1.5">
            {SCENARIOS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={s.id === scenarioId}
                  onClick={() => {
                    load(s.id);
                    setPlaying(true);
                    setOpen(false);
                  }}
                  className={cx(
                    "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                    s.id === scenarioId ? "bg-cyan-50" : "hover:bg-slate-50",
                  )}
                >
                  <Check
                    aria-hidden
                    className={cx("mt-0.5 h-3.5 w-3.5 shrink-0", s.id === scenarioId ? "text-cyan-700" : "invisible")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">{s.title}</span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {SPEED_LABELS[s.speed] ?? `${s.speed}×`}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{s.summary}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Lista «Qué observar» del escenario actual. */
export function WatchList() {
  const scenarioId = useSimStore((s) => s.scenarioId);
  const current = SCENARIOS.find((s) => s.id === scenarioId)!;
  return (
    <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-snug text-slate-700 marker:text-cyan-700">
      {current.watch.map((w) => (
        <li key={w}>{w}</li>
      ))}
    </ol>
  );
}
