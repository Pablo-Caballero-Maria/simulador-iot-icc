"use client";
/** Recorrido guiado paso a paso, superpuesto a la escena. */
import { useEffect } from "react";
import { X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { rise } from "@/lib/motion";
import { TOUR } from "@/data/tour";
import { useSimStore } from "@/lib/sim-store";
import { Button, LevelBadge } from "@/components/ui/primitives";

export function Tour({ step, onStep, onClose }: { step: number; onStep: (n: number) => void; onClose: () => void }) {
  const setCamera = useSimStore((s) => s.setCameraPreset);
  const select = useSimStore((s) => s.selectNode);
  const current = TOUR[step];

  useEffect(() => {
    setCamera(current.camera);
    select(current.node ?? null);
  }, [current, setCamera, select]);

  return (
    <div
      role="dialog"
      aria-label="Recorrido guiado"
      className="animate-rise-in pointer-events-auto w-[min(28rem,100%)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {current.level ? <LevelBadge level={current.level} /> : null}
          <span className="font-mono text-[10px] text-slate-400">
            {step + 1}/{TOUR.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
          aria-label="Cerrar el recorrido"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
      {/* Cada paso entra con un fundido; el primero no (la tarjeta ya entra con el suyo). */}
      <AnimatePresence mode="wait" initial={false}>
        <m.div key={step} {...rise}>
          <h2 className="mt-2 text-sm font-semibold text-slate-900">{current.title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{current.text}</p>
        </m.div>
      </AnimatePresence>
      <div className="mt-3 flex items-center justify-between">
        <Button variant="ghost" disabled={step === 0} onClick={() => onStep(step - 1)}>
          ← Anterior
        </Button>
        <div className="flex gap-1" aria-hidden>
          {TOUR.map((_, i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-cyan-700" : "bg-slate-200"}`} />
          ))}
        </div>
        {step < TOUR.length - 1 ? (
          <Button variant="primary" onClick={() => onStep(step + 1)}>
            Siguiente →
          </Button>
        ) : (
          <Button variant="primary" onClick={onClose}>
            Empezar
          </Button>
        )}
      </div>
    </div>
  );
}
