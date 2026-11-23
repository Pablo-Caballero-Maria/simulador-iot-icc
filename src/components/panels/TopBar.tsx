"use client";
/** Barra superior: escenario, reproducción, velocidad, reloj simulado y navegación. */
import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, Calculator, Code, HeartPulse, Pause, Play, RotateCcw } from "lucide-react";
import { SPEEDS, SPEED_LABELS, useSimStore } from "@/lib/sim-store";
import { formatNumber } from "@/lib/format";
import { REPO_URL } from "@/data/links";
import { ScenarioPicker } from "@/components/simulator/ScenarioPicker";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function TopBar() {
  const clock = useSimStore((s) => s.snapshot?.clock ?? "—");
  const playing = useSimStore((s) => s.playing);
  const speed = useSimStore((s) => s.speed);
  const effective = useSimStore((s) => s.effectiveSpeed);
  const setPlaying = useSimStore((s) => s.setPlaying);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const load = useSimStore((s) => s.load);
  const scenarioId = useSimStore((s) => s.scenarioId);
  const slowed = playing && effective > 0 && effective < speed * 0.8;

  return (
    <header className="relative z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white/90 px-3 py-2 backdrop-blur">
      <Link href="/" className="flex shrink-0 items-center gap-2" title="Simulador IoT · Insuficiencia cardíaca">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
          <HeartPulse aria-hidden className="h-4 w-4" />
        </span>
        <span className="hidden text-sm font-semibold text-slate-900 xl:inline">Simulador IoT · ICC</span>
      </Link>

      <ScenarioPicker />

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? "Pausar" : "Reproducir"}
          title={playing ? "Pausar" : "Reproducir"}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-700 text-white shadow-sm transition-colors hover:bg-cyan-800"
        >
          {playing ? (
            <Pause aria-hidden className="h-3.5 w-3.5" />
          ) : (
            <Play aria-hidden className="ml-0.5 h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => load(scenarioId)}
          aria-label="Reiniciar"
          title="Volver a empezar el escenario"
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <RotateCcw aria-hidden className="h-3.5 w-3.5" />
        </button>
        <label className="sr-only" htmlFor="speed">
          Velocidad de la simulación
        </label>
        <select
          id="speed"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          title="Velocidad de la simulación"
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 font-mono text-[11px] text-slate-700 shadow-sm"
        >
          {SPEEDS.map((v) => (
            <option key={v} value={v}>
              {SPEED_LABELS[v]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xs text-slate-700 tabular-nums" aria-live="off">
          {clock}
        </span>
        {slowed ? (
          <span className="text-[10px] text-amber-700" title="El navegador no da abasto a esta velocidad">
            real ×{formatNumber(effective, 0)}
          </span>
        ) : null}
      </div>

      <nav className="ml-auto flex items-center gap-1 text-xs" aria-label="Otras páginas">
        <NavLink href="/como-funciona" label="Cómo funciona" icon={<BookOpen aria-hidden className="h-3.5 w-3.5" />} />
        <NavLink href="/economia" label="Economía" icon={<Calculator aria-hidden className="h-3.5 w-3.5" />} />
        <a
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          title="Código y memoria"
        >
          <Code aria-hidden className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Código</span>
        </a>
        <ThemeToggle />
      </nav>
    </header>
  );
}

function NavLink({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return (
    <Link
      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
      href={href}
      title={label}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </Link>
  );
}
