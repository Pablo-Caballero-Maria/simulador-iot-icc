"use client";
/**
 * Parámetros del sistema, agrupados por nivel. Cada grupo se pliega para no
 * mostrarlos todos a la vez; los valores por defecto son los de la memoria.
 */
import { CONTROL_GROUPS, type ParamControl } from "@/sim/params";
import { needsRestart, useSimStore } from "@/lib/sim-store";
import { LevelBadge, Section } from "@/components/ui/primitives";
import type { IotLevel } from "@/sim/types";

export function ParamsPanel() {
  return (
    <div className="space-y-2">
      <p className="pb-1 text-xs leading-relaxed text-slate-500">
        Los valores por defecto son los del diseño de la memoria. Los marcados con ↺ reinician el escenario; el resto se
        aplican en caliente.
      </p>
      {CONTROL_GROUPS.map((g, i) => (
        <Section
          key={g.id}
          title={g.title}
          collapsible
          defaultOpen={i === 0}
          aside={
            <span className="flex gap-1">
              {g.level.split(" · ").map((l) => (
                <LevelBadge key={l} level={l as IotLevel} compact />
              ))}
            </span>
          }
        >
          <div className="space-y-4 pt-1">
            {g.controls.map((c) => (
              <Control key={`${c.group}.${c.key}`} control={c} />
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}

function Control({ control: c }: { control: ParamControl }) {
  const value = useSimStore((s) => {
    const params = s.sim?.params ?? s.baseParams;
    return (params[c.group] as Record<string, unknown>)[c.key];
  });
  const setParam = useSimStore((s) => s.setParam);
  const restart = needsRestart(c.group, c.key);
  const id = `ctl-${c.group}-${c.key}`;
  const label = (
    <label htmlFor={id} className="flex items-center gap-1 text-xs font-medium text-slate-800">
      {c.label}
      {restart ? (
        <span className="text-[10px] text-amber-700" title="Cambiarlo reinicia el escenario">
          ↺
        </span>
      ) : null}
      <span className="ml-auto font-mono text-[10px] font-normal text-slate-400" title="Apartado de la memoria">
        §{c.ref}
      </span>
    </label>
  );
  const help = <p className="text-[11px] leading-snug text-slate-500">{c.help}</p>;

  if (c.kind === "toggle") {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => setParam(c.group, c.key, e.target.checked, restart)}
            className="h-3.5 w-3.5 accent-cyan-700"
          />
          {label}
        </div>
        {help}
      </div>
    );
  }
  if (c.kind === "select") {
    return (
      <div className="space-y-1">
        {label}
        <select
          id={id}
          value={String(value)}
          onChange={(e) => setParam(c.group, c.key, e.target.value, restart)}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
        >
          {c.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {help}
      </div>
    );
  }
  const scale = c.scale ?? 1;
  const num = Number(value);
  return (
    <div className="space-y-1">
      {label}
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="range"
          min={c.min}
          max={c.max}
          step={c.step}
          value={num}
          onChange={(e) => setParam(c.group, c.key, Number(e.target.value), restart)}
          className="w-full"
        />
        <span className="w-20 text-right font-mono text-[11px] text-cyan-800 tabular-nums">
          {(num * scale).toLocaleString("es-ES", { maximumFractionDigits: 2 })} {c.unit}
        </span>
      </div>
      {help}
    </div>
  );
}
