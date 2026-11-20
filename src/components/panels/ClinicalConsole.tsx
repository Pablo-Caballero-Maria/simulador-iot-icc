"use client";
/**
 * Consola clínica (niveles 6 y 7): alertas con la cadena de retardos de cada
 * tramo y órdenes de diurético pendientes de firma. En modo «manual» el
 * usuario atiende las alertas y firma como cardiólogo.
 */
import { useSimStore } from "@/lib/sim-store";
import { formatDuration, formatSimTime } from "@/lib/format";
import { Button, Section, cx } from "@/components/ui/primitives";
import type { AlertRecord, DoseOrder } from "@/sim/records";

const CLASS_STYLE: Record<1 | 2 | 3, string> = {
  1: "border-rose-300 bg-rose-50",
  2: "border-amber-300 bg-amber-50/70",
  3: "border-slate-300 bg-slate-50",
};

export function ClinicalConsole() {
  const sim = useSimStore((s) => s.sim);
  useSimStore((s) => s.snapshot?.t); // se repinta con cada actualización
  const manual = useSimStore((s) => (s.sim?.params.staff.mode ?? "auto") === "manual");
  if (!sim) return null;
  const alerts = [...sim.platform.alerts].reverse();
  const orders = [...sim.platform.orders].reverse();
  const amb = sim.platform.ambulance;

  return (
    <div className="space-y-5">
      <p className="text-[11px] leading-snug text-slate-500">
        {manual
          ? "Modo manual: tú atiendes las alertas y firmas como cardiólogo. Si no atiendes una crítica en 5 min, pasa al 112."
          : "El personal clínico está simulado. Para atender tú las alertas, elige «Yo atiendo la consola» en Parámetros → Hospital."}
      </p>
      {amb.phase !== "idle" ? (
        <div className="rounded-md border border-sky-300 bg-sky-50 p-2 text-[12px] text-sky-900">
          🚑{" "}
          {amb.phase === "outbound"
            ? `Ambulancia en camino: llega en ${formatDuration(Math.max(0, amb.arriveAt - sim.now))}`
            : amb.phase === "onsite"
              ? "Ambulancia en el domicilio: pasarela móvil emparejada con el wearable"
              : "Ambulancia volviendo al hospital"}
        </div>
      ) : null}

      <Section title={`Alertas (${alerts.length})`}>
        {alerts.length === 0 ? <p className="text-xs text-slate-500">Sin alertas.</p> : null}
        <ul className="space-y-2">
          {alerts.slice(0, 30).map((a) => (
            <AlertCard key={a.id} alert={a} manual={manual} onAck={() => sim.acknowledgeAlert(a.id)} />
          ))}
        </ul>
      </Section>

      <Section title="Órdenes de diurético">
        {orders.length === 0 ? <p className="text-xs text-slate-500">Sin propuestas.</p> : null}
        <ul className="space-y-2">
          {orders.slice(0, 12).map((o) => (
            <OrderCard
              key={o.orderId}
              order={o}
              onSign={() => sim.signOrder(o.orderId)}
              onReject={() => sim.rejectOrder(o.orderId)}
            />
          ))}
        </ul>
      </Section>
    </div>
  );
}

function AlertCard({ alert: a, manual, onAck }: { alert: AlertRecord; manual: boolean; onAck: () => void }) {
  const steps: [string, number | undefined][] = [
    ["Aviso local", a.localAlarmAt],
    ["Estación", a.stationAt],
    ["Publicada", a.publishedAt],
    ["Broker", a.brokerAt],
    ["Consola", a.consoleAt],
    ["Atendida", a.ackAt],
  ];
  return (
    <li className={cx("rounded-md border p-2.5", CLASS_STYLE[a.alertClass])}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-slate-900">
          Clase {a.alertClass} · {a.title}
        </span>
        <span className="text-[10px] text-slate-500">
          {a.status === "open"
            ? "abierta"
            : a.status === "acknowledged"
              ? "atendida"
              : a.status === "resolved"
                ? "resuelta"
                : "descartada"}
        </span>
      </div>
      <div className="mt-0.5 text-[10px] text-slate-500">
        Detectada {formatSimTime(a.detectedAt)} en{" "}
        {a.origin === "wearable" ? "el wearable" : a.origin === "station" ? "la estación" : "la nube"}
        {a.hr > 0 ? ` · ${Math.round(a.hr)} lpm` : ""}
        {a.stationVerdict ? ` · estación: ${a.stationVerdict}` : ""}
        {a.real === false ? " · (en la simulación: falsa alarma)" : ""}
      </div>
      <ol className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px]">
        {steps
          .filter(([, t]) => t !== undefined)
          .map(([label, t]) => (
            <li key={label} className="font-mono text-slate-700">
              {label} <span className="text-cyan-700">+{formatDuration(t! - a.detectedAt)}</span>
            </li>
          ))}
      </ol>
      {a.escalations.length ? (
        <div className="mt-1 text-[10px] text-rose-700">Escalada a: {a.escalations.map((e) => e.to).join(" → ")}</div>
      ) : null}
      {a.outcome ? <div className="mt-1 text-[11px] text-emerald-700">{a.outcome}</div> : null}
      {manual && a.status === "open" ? (
        <Button variant="primary" className="mt-2" onClick={onAck}>
          Atender
        </Button>
      ) : null}
    </li>
  );
}

function OrderCard({ order: o, onSign, onReject }: { order: DoseOrder; onSign: () => void; onReject: () => void }) {
  const tone =
    o.status === "rechazada" || o.status === "bloqueada"
      ? "border-rose-300"
      : o.status === "tomada"
        ? "border-emerald-300"
        : "border-violet-200";
  return (
    <li className={cx("rounded-md border bg-slate-50 p-2.5", tone)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-slate-900">{o.drug}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-800">{o.status}</span>
      </div>
      <div className="mt-0.5 font-mono text-[10px] text-slate-500">
        {o.orderId} · secuencia {o.seq}
        {o.forged ? <span className="text-rose-700"> · ataque</span> : null}
      </div>
      <p className="mt-1 text-[11px] text-slate-700">{o.reason}</p>
      {o.rejectReason ? (
        <p className="mt-1 text-[11px] text-rose-700">Rechazada por el dispensador: {o.rejectReason}</p>
      ) : null}
      {o.signature && !o.forged ? (
        <p className="mt-1 truncate font-mono text-[10px] text-violet-700">Firma ECDSA {o.signature.slice(0, 40)}…</p>
      ) : null}
      {o.status === "propuesta" ? (
        <div className="mt-2 flex gap-2">
          <Button variant="primary" onClick={onSign}>
            Firmar como cardiólogo
          </Button>
          <Button variant="ghost" onClick={onReject}>
            Rechazar
          </Button>
        </div>
      ) : null}
    </li>
  );
}
