"use client";
/** Explicaciones de lo que va ocurriendo, etiquetadas con su nivel del modelo. */
import { useSimStore } from "@/lib/sim-store";
import { formatSimTime } from "@/lib/format";
import { LevelBadge, cx } from "@/components/ui/primitives";
import type { NarrationTone } from "@/sim/types";

const TONE: Record<NarrationTone, string> = {
  info: "border-slate-200",
  ok: "border-emerald-300",
  warn: "border-amber-300",
  critical: "border-rose-300 bg-rose-50/60",
};

export function NarrationFeed() {
  const narrations = useSimStore((s) => s.narrations);
  const setCamera = useSimStore((s) => s.setCameraPreset);
  const select = useSimStore((s) => s.selectNode);
  if (narrations.length === 0) {
    return (
      <p className="text-xs text-slate-500">Pulsa «Reproducir» para empezar. Aquí se explica cada cosa que ocurre.</p>
    );
  }
  return (
    <ol className="space-y-2" aria-live="polite">
      {narrations.map((n) => (
        <li key={n.id} className={cx("rounded-md border bg-slate-50 p-2.5", TONE[n.tone])}>
          <div className="flex items-center gap-2">
            <LevelBadge level={n.level} compact />
            <span className="text-[12px] font-semibold text-slate-900">{n.title}</span>
          </div>
          <p className="mt-1 text-[12px] leading-snug text-slate-700">{n.text}</p>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-mono text-[10px] text-slate-500">{formatSimTime(n.t)}</span>
            {n.focus ? (
              <button
                type="button"
                className="text-[10px] text-cyan-700 hover:underline"
                onClick={() => {
                  select(n.focus!);
                  setCamera(
                    n.focus === "hospital" || n.focus === "ambulance"
                      ? "hospital"
                      : n.focus === "cloud" || n.focus === "tower"
                        ? "red"
                        : "casa",
                  );
                }}
              >
                Ver en 3D
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
