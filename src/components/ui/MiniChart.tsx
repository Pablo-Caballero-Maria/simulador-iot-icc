/** Gráfico de líneas pequeño en SVG (sin dependencias). */
export interface Series {
  label: string;
  color: string;
  points: { x: number; y: number }[];
  /** Eje propio (izquierdo o derecho). */
  axis?: "left" | "right";
}

export function MiniChart({
  series,
  height = 120,
  xLabel,
  threshold,
  width = 320,
  formatX = (x) => x.toFixed(0),
  formatY = (y) => y.toFixed(Math.abs(y) > 20 ? 0 : 1),
}: {
  series: Series[];
  height?: number;
  xLabel?: string;
  threshold?: { y: number; label: string; axis?: "left" | "right" };
  /** Anchura del sistema de coordenadas: más ancho, letra más pequeña al escalar. */
  width?: number;
  formatX?: (x: number) => string;
  formatY?: (y: number) => string;
}) {
  const pad = { l: width > 400 ? 56 : 30, r: 30, t: 8, b: 20 };
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) {
    return (
      <div className="flex h-24 items-center justify-center text-[11px] text-slate-500">
        Aún no hay datos suficientes
      </div>
    );
  }
  const xs = all.map((p) => p.x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs) || x0 + 1;
  const range = (axis: "left" | "right") => {
    const ys = series.filter((s) => (s.axis ?? "left") === axis).flatMap((s) => s.points.map((p) => p.y));
    if (threshold && (threshold.axis ?? "left") === axis) ys.push(threshold.y);
    if (ys.length === 0) return [0, 1] as const;
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const padY = (hi - lo || 1) * 0.1;
    return [lo - padY, hi + padY] as const;
  };
  const ranges = { left: range("left"), right: range("right") };
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (width - pad.l - pad.r);
  const sy = (y: number, axis: "left" | "right") => {
    const [lo, hi] = ranges[axis];
    return pad.t + (1 - (y - lo) / (hi - lo || 1)) * (height - pad.t - pad.b);
  };
  return (
    <figure className="space-y-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={series.map((s) => s.label).join(", ")}
      >
        <line x1={pad.l} x2={width - pad.r} y1={height - pad.b} y2={height - pad.b} stroke="#cbd5e1" />
        {threshold ? (
          <g>
            <line
              x1={pad.l}
              x2={width - pad.r}
              y1={sy(threshold.y, threshold.axis ?? "left")}
              y2={sy(threshold.y, threshold.axis ?? "left")}
              stroke="#e11d48"
              strokeDasharray="4 3"
            />
            <text
              x={width - pad.r}
              y={sy(threshold.y, threshold.axis ?? "left") - 3}
              fontSize="9"
              fill="#be123c"
              textAnchor="end"
            >
              {threshold.label}
            </text>
          </g>
        ) : null}
        {series.map((s) => {
          const axis = s.axis ?? "left";
          const d = s.points
            .map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y, axis).toFixed(1)}`)
            .join(" ");
          return <path key={s.label} d={d} fill="none" stroke={s.color} strokeWidth={1.6} />;
        })}
        {(["left", "right"] as const).map((axis) =>
          series.some((s) => (s.axis ?? "left") === axis) ? (
            <g key={axis} fontSize="9" fill="#64748b" textAnchor={axis === "left" ? "end" : "start"}>
              {ranges[axis].map((v, i) => (
                <text
                  key={i}
                  x={axis === "left" ? pad.l - 3 : width - pad.r + 3}
                  y={i === 0 ? height - pad.b : pad.t + 8}
                >
                  {formatY(v)}
                </text>
              ))}
            </g>
          ) : null,
        )}
        <text x={pad.l} y={height - 6} fontSize="9" fill="#64748b">
          {formatX(x0)}
        </text>
        <text x={width - pad.r} y={height - 6} fontSize="9" fill="#64748b" textAnchor="end">
          {formatX(x1)} {xLabel}
        </text>
      </svg>
      <figcaption className="flex flex-wrap gap-3 text-[10px] text-slate-500">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1">
            <span className="inline-block h-0.5 w-3" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
