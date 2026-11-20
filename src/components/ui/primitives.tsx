/** Componentes básicos de la interfaz, con el estilo común (tema claro). */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { LEVELS } from "@/data/system";
import type { IotLevel } from "@/sim/types";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "ghost" | "danger" | "subtle";

export function Button({
  variant = "subtle",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const styles: Record<ButtonVariant, string> = {
    primary: "bg-cyan-700 text-white shadow-sm hover:bg-cyan-800",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
    subtle: "border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
  };
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 disabled:cursor-not-allowed disabled:opacity-40",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function LevelBadge({ level, compact = false }: { level: IotLevel; compact?: boolean }) {
  const info = LEVELS[level];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold"
      style={{ backgroundColor: `${info.color}14`, color: info.color, border: `1px solid ${info.color}40` }}
      title={`${level} · ${info.name}: ${info.question}`}
    >
      {compact ? level : `${level} · ${info.name}`}
    </span>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: string; badge?: number }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-slate-200 px-2">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "relative -mb-px border-b-2 px-2.5 py-2 text-xs font-medium transition-colors",
            value === t.id ? "border-cyan-700 text-cyan-800" : "border-transparent text-slate-500 hover:text-slate-800",
          )}
        >
          {t.label}
          {t.badge ? (
            <span className="ml-1.5 rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">{t.badge}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  status,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  status?: "ok" | "warn" | "bad" | "neutral";
}) {
  const color = {
    ok: "text-emerald-700",
    warn: "text-amber-700",
    bad: "text-rose-700",
    neutral: "text-slate-900",
  }[status ?? "neutral"];
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={cx("mt-0.5 font-mono text-lg leading-tight tabular-nums", color)}>{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{hint}</div> : null}
    </div>
  );
}

/**
 * Sección con título. Con `collapsible` se pliega (cerrada por defecto salvo
 * `defaultOpen`), para no mostrar toda la información a la vez.
 */
export function Section({
  title,
  children,
  aside,
  collapsible = false,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  if (collapsible) {
    return (
      <details className="group rounded-xl border border-slate-200 bg-white" open={defaultOpen}>
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 select-none">
          <span className="text-xs font-semibold text-slate-800">{title}</span>
          <span className="flex items-center gap-2">
            {aside}
            <ChevronDown
              aria-hidden
              className="h-3.5 w-3.5 text-slate-400 transition-transform group-open:rotate-180"
            />
          </span>
        </summary>
        <div className="space-y-2 px-3 pb-3">{children}</div>
      </details>
    );
  }
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Dot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {pulse ? (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
          style={{ backgroundColor: color }}
        />
      ) : null}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
    </span>
  );
}
