"use client";
/**
 * Monitor del wearable, en una tarjeta pequeña que se puede plegar. Con la
 * ruta de señal dibuja el ECG filtrado de los últimos 6 s con los QRS
 * detectados (papel de ECG); con la ruta de latido, el tacograma (intervalos
 * RR). Debajo, lo que decide la red neuronal en cada ventana de 8 s.
 */
import { useEffect, useRef, useState } from "react";
import { Activity, ChevronDown } from "lucide-react";
import { useSimStore } from "@/lib/sim-store";
import { CLASS_LABELS } from "@/sim/wearable/classes";
import { ECG_FS } from "@/sim/physiology/ecg";
import { formatNumber } from "@/lib/format";
import { cx } from "@/components/ui/primitives";

const SECONDS = 6;
const CLASS_COLORS = ["#059669", "#d97706", "#e11d48", "#7c3aed", "#94a3b8"];

export function EcgMonitor() {
  const [open, setOpen] = useState(true);
  const lastWindow = useSimStore((s) => s.snapshot?.wearable.lastWindow ?? null);
  const rhythmLabel = useSimStore((s) => s.snapshot?.patient.rhythmLabel ?? "");
  const frontEnd = useSimStore((s) => s.snapshot?.wearable.frontEnd ?? "beat");
  const vibrating = useSimStore((s) => s.snapshot?.wearable.vibrating ?? false);

  const predicted = lastWindow ? CLASS_LABELS[lastWindow.predicted] : "esperando la primera ventana";
  const wrong = lastWindow && lastWindow.truth && lastWindow.truth !== lastWindow.predicted;

  return (
    <div
      className={cx(
        "pointer-events-auto w-[min(22rem,100%)] overflow-hidden rounded-2xl border bg-white/95 shadow-lg backdrop-blur",
        vibrating ? "border-rose-300" : "border-slate-200",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Activity aria-hidden className={cx("h-3.5 w-3.5", vibrating ? "text-rose-600" : "text-cyan-700")} />
        <span className="text-[11px] font-semibold text-slate-800">ECG del wearable</span>
        <span className="truncate text-[11px] text-slate-500">
          · {vibrating ? "¡aviso local!" : frontEnd === "signal" ? "señal a 256 Hz" : "latido a latido"}
        </span>
        <ChevronDown
          aria-hidden
          className={cx("ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="px-3 pb-3">
          <EcgCanvas vibrating={vibrating} />
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            <span className="text-slate-500">Red neuronal:</span>
            <span className={cx("truncate font-semibold", wrong ? "text-rose-700" : "text-slate-900")}>
              {predicted}
            </span>
            {lastWindow ? (
              <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">
                {Number.isFinite(lastWindow.hr) ? `${formatNumber(lastWindow.hr, 0)} lpm · ` : ""}
                {formatNumber(lastWindow.confidence * 100, 0)} %
              </span>
            ) : null}
          </div>
          {lastWindow ? (
            <div
              className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-slate-100"
              title={`Probabilidad de cada clase · ritmo real: ${rhythmLabel}`}
            >
              {lastWindow.probs.map((p, i) => (
                <div key={i} style={{ width: `${p * 100}%`, backgroundColor: CLASS_COLORS[i] }} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EcgCanvas({ vibrating }: { vibrating: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current;
      const sim = useSimStore.getState().sim;
      if (!c || !sim) return;
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      // Sin tamaño (tarjeta plegada o aún sin maquetar) no se dibuja: evita bucles con paso 0.
      if (w < 10 || h < 10) return;
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width = w * dpr;
        c.height = h * dpr;
      }
      const g = c.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#fffafa";
      g.fillRect(0, 0, w, h);
      // Papel de ECG: cuadrícula cada 0,2 s y 0,5 mV.
      g.strokeStyle = "#fbd5d5";
      g.lineWidth = 1;
      for (let x = 0; x < w; x += w / (SECONDS * 5)) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      for (let y = h / 2; y < h; y += h / 6) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.moveTo(0, h - y);
        g.lineTo(w, h - y);
        g.stroke();
      }
      const display = sim.wearable.ecgDisplay;
      const detections = sim.wearable.recentDetections;
      if (display) {
        const n = SECONDS * ECG_FS;
        const data = display.samples.subarray(display.samples.length - n);
        const t0 = display.end - SECONDS;
        g.strokeStyle = vibrating ? "#e11d48" : "#0f172a";
        g.lineWidth = 1.3;
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const x = (i / n) * w;
          const y = h / 2 - data[i] * (h / 3.2);
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        // Marcas de los QRS detectados.
        g.fillStyle = "#0891b2";
        for (const b of detections) {
          if (b.t < t0 || b.t > display.end) continue;
          const x = ((b.t - t0) / SECONDS) * w;
          g.beginPath();
          g.moveTo(x - 3.5, 3);
          g.lineTo(x + 3.5, 3);
          g.lineTo(x, 8);
          g.fill();
        }
      } else {
        // Tacograma: un punto por intervalo RR.
        const pts = detections.slice(-60);
        g.fillStyle = "#0f172a";
        for (let i = 1; i < pts.length; i++) {
          const rr = pts[i].t - pts[i - 1].t;
          const x = (i / 60) * w;
          const y = h - Math.min(rr / 2, 1) * (h - 10) - 5;
          g.fillRect(x - 1.5, y - 1.5, 3, 3);
        }
        g.fillStyle = "#64748b";
        g.font = "10px sans-serif";
        g.fillText("Intervalo RR de cada latido (0–2 s)", 6, 12);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [vibrating]);
  return (
    <canvas
      ref={canvas}
      className="h-20 w-full rounded-lg border border-rose-100"
      aria-label="Señal de ECG del wearable"
      role="img"
    />
  );
}
