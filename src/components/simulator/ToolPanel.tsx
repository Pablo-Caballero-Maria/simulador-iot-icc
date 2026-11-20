"use client";
/**
 * Barra de herramientas y panel lateral. Toda la información detallada
 * (explicaciones, parámetros, estadísticas, mensajes, consola) vive aquí y
 * se abre bajo demanda, de una en una, para no saturar la pantalla.
 */
import type { ComponentType, ReactNode } from "react";
import { ChartColumn, CircleHelp, Mail, MessageSquareText, SlidersHorizontal, Stethoscope, X, Zap } from "lucide-react";
import { type PanelId, useSimStore } from "@/lib/sim-store";
import { cx } from "@/components/ui/primitives";
import { NarrationFeed } from "@/components/panels/NarrationFeed";
import { ParamsPanel } from "@/components/panels/ParamsPanel";
import { ActionsPanel } from "@/components/panels/ActionsPanel";
import { StatsView } from "@/components/panels/StatsView";
import { MessageLog } from "@/components/panels/MessageLog";
import { ClinicalConsole } from "@/components/panels/ClinicalConsole";
import { WatchList } from "./ScenarioPicker";

interface PanelDef {
  id: PanelId;
  label: string;
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  render: () => ReactNode;
}

const PANELS: PanelDef[] = [
  {
    id: "explicacion",
    label: "Explicación",
    title: "Qué está pasando",
    subtitle: "Cada evento, explicado y etiquetado con su nivel del modelo.",
    icon: MessageSquareText,
    render: () => (
      <div className="space-y-5">
        <section className="space-y-2 rounded-xl bg-slate-50 p-3">
          <h3 className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Qué observar</h3>
          <WatchList />
        </section>
        <NarrationFeed />
      </div>
    ),
  },
  {
    id: "parametros",
    label: "Parámetros",
    title: "Parámetros",
    subtitle: "Cambia el diseño y observa el efecto.",
    icon: SlidersHorizontal,
    render: () => <ParamsPanel />,
  },
  {
    id: "acciones",
    label: "Provocar",
    title: "Provocar eventos",
    subtitle: "Arritmias, cortes de red, ataques…",
    icon: Zap,
    render: () => <ActionsPanel />,
  },
  {
    id: "estadisticas",
    label: "Datos",
    title: "Estadísticas",
    subtitle: "Resultados en directo frente a los objetivos de la memoria.",
    icon: ChartColumn,
    render: () => <StatsView />,
  },
  {
    id: "mensajes",
    label: "Mensajes",
    title: "Mensajes",
    subtitle: "Cada paquete con sus bytes reales.",
    icon: Mail,
    render: () => <MessageLog />,
  },
  {
    id: "consola",
    label: "Consola",
    title: "Consola clínica",
    subtitle: "Alertas y órdenes de diurético.",
    icon: Stethoscope,
    render: () => <ClinicalConsole />,
  },
];

/** Barra de iconos (vertical a la derecha en escritorio, horizontal abajo en móvil). */
export function ToolRail({ onTour }: { onTour: () => void }) {
  const panel = useSimStore((s) => s.panel);
  const toggle = useSimStore((s) => s.togglePanel);
  const pending = useSimStore(
    (s) =>
      (s.sim?.platform.alerts.filter((a) => a.status === "open").length ?? 0) +
      (s.sim?.platform.orders.filter((o) => o.status === "propuesta").length ?? 0),
  );
  return (
    <nav
      aria-label="Paneles de información"
      className="flex shrink-0 items-center justify-around gap-1 border-t border-slate-200 bg-white px-1 py-1 lg:flex-col lg:justify-start lg:border-t-0 lg:border-l lg:px-1.5 lg:py-3"
    >
      {PANELS.map((p) => {
        const Icon = p.icon;
        const active = panel === p.id;
        const badge = p.id === "consola" && pending > 0 ? pending : 0;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => toggle(p.id)}
            aria-pressed={active}
            aria-controls="panel-lateral"
            title={p.title}
            className={cx(
              "relative flex w-14 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-colors",
              active ? "bg-cyan-50 text-cyan-800" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
            )}
          >
            <Icon aria-hidden className="h-[18px] w-[18px]" />
            {p.label}
            {badge ? (
              <span className="absolute top-0.5 right-2 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[9px] leading-4 font-bold text-white">
                {badge}
              </span>
            ) : null}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onTour}
        title="Recorrido guiado"
        className="flex w-14 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 lg:mt-auto"
      >
        <CircleHelp aria-hidden className="h-[18px] w-[18px]" />
        Guía
      </button>
    </nav>
  );
}

/** Panel lateral con el contenido de la herramienta elegida. */
export function ToolPanel() {
  const panel = useSimStore((s) => s.panel);
  const toggle = useSimStore((s) => s.togglePanel);
  const def = PANELS.find((p) => p.id === panel);
  if (!def) return null;
  const Icon = def.icon;
  return (
    <aside
      id="panel-lateral"
      aria-label={def.title}
      className="animate-slide-in absolute inset-x-0 bottom-[58px] z-20 flex h-[62%] flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl lg:static lg:h-auto lg:w-[400px] lg:shrink-0 lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-none"
    >
      <header className="flex items-start gap-3 border-b border-slate-100 px-4 py-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-800">
          <Icon aria-hidden className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">{def.title}</h2>
          <p className="text-[11px] leading-snug text-slate-500">{def.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => toggle(null)}
          aria-label="Cerrar el panel"
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">{def.render()}</div>
    </aside>
  );
}
