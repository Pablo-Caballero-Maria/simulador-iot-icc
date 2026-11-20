"use client";
/** Registro de mensajes con inspector: bytes reales, desglose de cabeceras, CBOR y FHIR. */
import { useState } from "react";
import { KIND_COLORS, KIND_LABELS, LINK_COLORS, LINK_LABELS, NODES } from "@/data/system";
import { useSimStore } from "@/lib/sim-store";
import { formatBytes, formatDuration, formatSimTime } from "@/lib/format";
import { cx } from "@/components/ui/primitives";
import type { LinkId, Transmission } from "@/sim/types";

const FILTERS: { id: "all" | LinkId | "wan"; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "ble", label: "BLE" },
  { id: "wan", label: "Red móvil" },
  { id: "hospital", label: "Hospital" },
];

export function MessageLog() {
  const log = useSimStore((s) => s.log);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [selected, setSelected] = useState<number | null>(null);
  const items = log.filter((t) =>
    filter === "all"
      ? true
      : filter === "wan"
        ? t.link === "lte-m" || t.link === "nb-iot" || t.link === "sms"
        : t.link === filter,
  );
  const current = selected === null ? null : (log.find((t) => t.id === selected) ?? null);

  return (
    <div className="space-y-2">
      <div className="flex gap-1" role="group" aria-label="Filtrar mensajes por enlace">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cx(
              "rounded px-2 py-1 text-[11px]",
              filter === f.id ? "bg-cyan-50 text-cyan-800" : "text-slate-500 hover:bg-slate-100",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {current ? <Inspector tx={current} onClose={() => setSelected(null)} /> : null}
      {items.length === 0 ? <p className="text-xs text-slate-500">Todavía no hay mensajes.</p> : null}
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {items.slice(0, 120).map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setSelected(t.id)}
              className={cx(
                "flex w-full items-start gap-2 px-2 py-1.5 text-left hover:bg-slate-50",
                selected === t.id && "bg-slate-100",
              )}
            >
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: KIND_COLORS[t.kind] }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] text-slate-800">{t.label}</span>
                <span className="block text-[10px] text-slate-500">
                  <span style={{ color: LINK_COLORS[t.link] }}>{LINK_LABELS[t.link]}</span> ·{" "}
                  {NODES[t.from].name.split(" ")[0]} → {NODES[t.to].name.split(" ")[0]} · {formatSimTime(t.tStart)}
                  {t.note ? <span className="text-amber-700"> · {t.note}</span> : null}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10px] text-slate-500">{formatBytes(t.bytes)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Inspector({ tx, onClose }: { tx: Transmission; onClose: () => void }) {
  const d = tx.details;
  return (
    <div className="space-y-2 rounded-md border border-cyan-600/40 bg-slate-50 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[12px] font-semibold text-slate-900">{tx.label}</div>
          <div className="text-[10px] text-slate-500">
            {KIND_LABELS[tx.kind]} · {LINK_LABELS[tx.link]} · {NODES[tx.from].name} → {NODES[tx.to].name}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-900"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-x-2 text-[11px]">
        <dt className="text-slate-500">Bytes en el enlace</dt>
        <dd className="text-right font-mono">{tx.bytes.toLocaleString("es-ES")} B</dd>
        <dt className="text-slate-500">Carga útil</dt>
        <dd className="text-right font-mono">{tx.payloadBytes.toLocaleString("es-ES")} B</dd>
        <dt className="text-slate-500">Duración del tramo</dt>
        <dd className="text-right font-mono">{formatDuration(tx.tEnd - tx.tStart)}</dd>
        {tx.topic ? (
          <>
            <dt className="text-slate-500">Tema MQTT</dt>
            <dd className="truncate text-right font-mono text-[10px]">{tx.topic}</dd>
          </>
        ) : null}
      </dl>
      {d?.parts ? (
        <div>
          <div className="mb-1 text-[10px] text-slate-500 uppercase">Desglose del paquete</div>
          <table className="w-full text-[11px]">
            <tbody>
              {d.parts.map((p) => (
                <tr key={p.label}>
                  <td className="text-slate-700">{p.label}</td>
                  <td className="text-right font-mono text-slate-800">{p.bytes} B</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {d?.diagnostic ? <Code title="CBOR (notación de diagnóstico)">{d.diagnostic}</Code> : null}
      {d?.json ? <Code title="Equivalente JSON">{d.json}</Code> : null}
      {d?.hex ? <Code title="Primeros bytes (hexadecimal)">{d.hex}</Code> : null}
      {d?.notes?.length ? (
        <ul className="list-disc pl-4 text-[11px] text-slate-700">
          {d.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Code({ title, children }: { title: string; children: string }) {
  return (
    <div>
      <div className="mb-1 text-[10px] text-slate-500 uppercase">{title}</div>
      <pre className="scroll-thin max-h-40 overflow-auto rounded bg-slate-50 p-2 font-mono text-[10px] leading-relaxed break-all whitespace-pre-wrap text-cyan-900">
        {children}
      </pre>
    </div>
  );
}
