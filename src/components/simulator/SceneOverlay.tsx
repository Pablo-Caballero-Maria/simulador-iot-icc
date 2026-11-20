"use client";
/**
 * Capas sobre la escena 3D, con lo mínimo a la vista: estado resumido, punto
 * de vista, ficha del componente seleccionado y la última explicación. El
 * resto está en el panel lateral.
 */
import { useCallback, useRef, useState } from "react";
import { Battery, Bluetooth, ChevronDown, HeartPulse, Info, Signal, X } from "lucide-react";
import { KIND_COLORS, KIND_LABELS, LINK_COLORS, NODES } from "@/data/system";
import { type CameraPreset, useSimStore } from "@/lib/sim-store";
import { useDismiss } from "@/lib/use-dismiss";
import { formatNumber } from "@/lib/format";
import { LevelBadge, cx } from "@/components/ui/primitives";
import type { MessageKind, NodeId } from "@/sim/types";

const PRESETS: { id: CameraPreset; label: string }[] = [
  { id: "general", label: "Vista general" },
  { id: "casa", label: "Domicilio" },
  { id: "paciente", label: "Paciente" },
  { id: "red", label: "Red y nube" },
  { id: "hospital", label: "Hospital" },
];

const LEGEND: MessageKind[] = ["vector", "strip", "alert", "weight", "order", "congestion", "telemetry", "console"];

/** Estado resumido en una sola fila (arriba a la izquierda). */
export function StatusChips() {
  const s = useSimStore((st) => st.snapshot);
  if (!s) return null;
  const sinus = s.patient.rhythm === "sinus";
  const items = [
    {
      key: "ritmo",
      icon: <HeartPulse aria-hidden className={cx("h-3.5 w-3.5", sinus ? "text-emerald-600" : "text-rose-600")} />,
      text: `${s.patient.hr ? `${Math.round(s.patient.hr)} lpm` : "—"}${sinus ? "" : ` · ${s.patient.rhythmLabel}`}`,
      title: `Ritmo real del paciente: ${s.patient.rhythmLabel}`,
      alert: !sinus,
    },
    {
      key: "ble",
      icon: (
        <Bluetooth
          aria-hidden
          className={cx("h-3.5 w-3.5", s.ble.state === "connected" ? "text-cyan-700" : "text-slate-400")}
        />
      ),
      text: s.ble.state === "connected" ? `${s.ble.phy === "coded" ? "Coded" : "1M"}` : "sin enlace",
      title:
        s.ble.state === "connected"
          ? `BLE ${s.ble.phy === "coded" ? "LE Coded" : "LE 1M"} · ${Math.round(s.ble.rssi)} dBm`
          : "BLE desconectado",
      alert: s.ble.state !== "connected",
    },
    {
      key: "red",
      icon: <Signal aria-hidden className={cx("h-3.5 w-3.5", s.cellular.tech ? "text-amber-600" : "text-rose-600")} />,
      text: s.cellular.tech ? s.cellular.tech.toUpperCase() : "sin red",
      title: `Red móvil: ${s.cellular.tech ? s.cellular.tech.toUpperCase() : "sin servicio"} · RSRP ${s.cellular.rsrp} dBm`,
      alert: !s.cellular.tech,
    },
    {
      key: "bateria",
      icon: (
        <Battery
          aria-hidden
          className={cx("h-3.5 w-3.5", s.wearable.socPct > 20 ? "text-emerald-600" : "text-amber-600")}
        />
      ),
      text: `${formatNumber(s.wearable.socPct, 0)} %`,
      title: "Batería del wearable",
      alert: s.wearable.socPct <= 20,
    },
  ];
  return (
    <div className="pointer-events-auto flex flex-col items-start gap-1.5">
      <div className="flex items-center divide-x divide-slate-200 rounded-full border border-slate-200 bg-white/90 py-1 text-[11px] shadow-sm backdrop-blur">
        {items.map((i) => (
          <span
            key={i.key}
            title={i.title}
            className={cx(
              "flex items-center gap-1 px-2.5 font-medium tabular-nums",
              i.alert ? "text-rose-700" : "text-slate-700",
            )}
          >
            {i.icon}
            <span className="max-w-40 truncate">{i.text}</span>
          </span>
        ))}
      </div>
      {s.patient.congestion > 0.25 ? (
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
          Congestión del paciente: {formatNumber(s.patient.congestion * 100, 0)}
        </span>
      ) : null}
      {s.patient.admittedAt !== null ? (
        <span className="rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white">
          El paciente habría necesitado ingreso
        </span>
      ) : null}
    </div>
  );
}

/** Punto de vista y leyenda (arriba a la derecha). */
export function ViewMenu() {
  const preset = useSimStore((s) => s.cameraPreset);
  const setPreset = useSimStore((s) => s.setCameraPreset);
  const [legend, setLegend] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setLegend(false), []);
  useDismiss(box, legend, close);
  return (
    <div ref={box} className="pointer-events-auto relative flex items-center gap-1.5">
      <label className="sr-only" htmlFor="vista">
        Punto de vista
      </label>
      <div className="relative">
        <select
          id="vista"
          value={preset}
          onChange={(e) => setPreset(e.target.value as CameraPreset)}
          className="appearance-none rounded-full border border-slate-200 bg-white/90 py-1 pr-7 pl-3 text-[11px] font-medium text-slate-700 shadow-sm backdrop-blur"
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2 h-3 w-3 -translate-y-1/2 text-slate-400"
        />
      </div>
      <button
        type="button"
        onClick={() => setLegend(!legend)}
        aria-expanded={legend}
        aria-label="Leyenda y ayuda de la escena"
        className={cx(
          "flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 shadow-sm backdrop-blur transition-colors",
          legend ? "text-cyan-800" : "text-slate-500 hover:text-slate-900",
        )}
      >
        <Info aria-hidden className="h-3.5 w-3.5" />
      </button>
      {legend ? (
        <div className="animate-rise-in absolute top-full right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-600 shadow-xl">
          <p className="mb-2 leading-snug">
            Haz clic en un componente para ver qué hace. Arrastra para girar y usa la rueda para acercar.
          </p>
          <div className="mb-1 font-semibold text-slate-800">Mensajes</div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {LEGEND.map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: KIND_COLORS[k] }} />
                {KIND_LABELS[k]}
              </li>
            ))}
          </ul>
          <div className="mt-2 mb-1 font-semibold text-slate-800">Enlaces</div>
          <div className="flex gap-3">
            <span style={{ color: LINK_COLORS.ble }}>━ BLE</span>
            <span style={{ color: LINK_COLORS["lte-m"] }}>━ LTE-M</span>
            <span style={{ color: LINK_COLORS["nb-iot"] }}>━ NB-IoT</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Ficha del componente seleccionado en la escena. */
export function NodeCard() {
  const node = useSimStore((s) => s.selectedNode);
  const select = useSimStore((s) => s.selectNode);
  if (!node) return null;
  const info = NODES[node];
  return (
    <div className="animate-rise-in pointer-events-auto w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{info.name}</h2>
        <button
          type="button"
          onClick={() => select(null)}
          className="rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
          aria-label="Cerrar la ficha"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {info.levels.map((l) => (
          <LevelBadge key={l} level={l} />
        ))}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">{info.description}</p>
      <NodeLive node={node} />
      <details className="group mt-2">
        <summary className="flex cursor-pointer items-center gap-1 text-[11px] font-medium text-cyan-800 select-none">
          Tecnologías
          <ChevronDown aria-hidden className="h-3 w-3 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {info.tech.map((t) => (
            <li key={t} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
              {t}
            </li>
          ))}
        </ul>
        <div className="mt-1.5 text-[10px] text-slate-400">Memoria: apartado {info.ref}</div>
      </details>
    </div>
  );
}

function NodeLive({ node }: { node: NodeId }) {
  const s = useSimStore((st) => st.snapshot);
  if (!s) return null;
  const rows: [string, string][] = [];
  if (node === "wearable") {
    rows.push(
      ["Batería", `${formatNumber(s.wearable.socPct, 1)} %`],
      [
        "Enlace BLE",
        s.ble.state === "connected"
          ? `${s.ble.phy === "coded" ? "LE Coded" : "LE 1M"} · ${Math.round(s.ble.rssi)} dBm`
          : "desconectado",
      ],
      ["Mensajes guardados", String(s.wearable.buffered)],
      ["Paciente", `${s.patient.activity} (${s.patient.room})`],
    );
  } else if (node === "station") {
    rows.push(
      ["Sesión MQTT", s.station.connected ? "abierta" : "cerrada"],
      ["Cola de envío", `${s.station.queue} mensajes`],
      ["Envío horario", s.station.slot],
      ["Último índice de congestión", s.station.congestion ? String(s.station.congestion.index) : "—"],
    );
  } else if (node === "dispenser") {
    rows.push(
      ["Pastillas en el casete", String(s.dispenser.pills)],
      ["Bandeja", s.dispenser.trayOpen ? "abierta" : "cerrada"],
      ["Órdenes rechazadas", String(s.metrics.ordersRejected)],
    );
  } else if (node === "tower") {
    rows.push(["Tecnología", s.cellular.tech?.toUpperCase() ?? "sin servicio"], ["RSRP", `${s.cellular.rsrp} dBm`]);
  } else if (node === "scale" && s.station.lastWeight) {
    rows.push([
      "Último peso",
      `${formatNumber(s.station.lastWeight.kg, 1)} kg (${s.station.lastWeight.valid ? "válido" : "descartado"})`,
    ]);
  }
  if (rows.length === 0) return null;
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 rounded-xl bg-slate-50 p-2.5 text-[11px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="text-right font-medium text-slate-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Última explicación, como un subtítulo. Se puede cerrar; la siguiente vuelve
 * a aparecer. El historial completo está en el panel «Explicación».
 */
export function Caption() {
  const latest = useSimStore((s) => s.narrations[0] ?? null);
  const playing = useSimStore((s) => s.playing);
  const togglePanel = useSimStore((s) => s.togglePanel);
  const [dismissed, setDismissed] = useState<number | null>(null);
  if (!latest) {
    return playing ? null : (
      <p className="pointer-events-auto rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur">
        Pulsa ▶ para empezar. Aquí aparecerá la explicación de cada cosa que ocurra.
      </p>
    );
  }
  if (dismissed === latest.id) return null;
  const tone = {
    info: "border-slate-200",
    ok: "border-emerald-200",
    warn: "border-amber-300",
    critical: "border-rose-300",
  }[latest.tone];
  return (
    <div
      key={latest.id}
      role="status"
      className={cx(
        "animate-rise-in pointer-events-auto w-[min(30rem,100%)] rounded-2xl border bg-white/95 p-3.5 shadow-lg backdrop-blur",
        tone,
      )}
    >
      <div className="flex items-start gap-2">
        <LevelBadge level={latest.level} compact />
        <h2 className="min-w-0 flex-1 text-[13px] leading-snug font-semibold text-slate-900">{latest.title}</h2>
        <button
          type="button"
          onClick={() => setDismissed(latest.id)}
          aria-label="Ocultar la explicación"
          className="rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-slate-600">{latest.text}</p>
      <button
        type="button"
        onClick={() => togglePanel("explicacion")}
        className="mt-1.5 text-[11px] font-medium text-cyan-800 hover:underline"
      >
        Ver todas las explicaciones
      </button>
    </div>
  );
}
