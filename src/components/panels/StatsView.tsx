"use client";
/** Estadísticas en directo, comparadas con los objetivos de la memoria. */
import { useSimStore } from "@/lib/sim-store";
import { formatBytes, formatDuration, formatNumber, formatPct } from "@/lib/format";
import { Section, Stat } from "@/components/ui/primitives";
import { MiniChart } from "@/components/ui/MiniChart";
import { BLOCK_LABELS } from "@/sim/wearable/energy";
import { DAY } from "@/sim/core/time";
import { RHYTHM_CLASSES, CLASS_LABELS } from "@/sim/wearable/classes";

const BLOCK_COLORS = [
  "#0891b2",
  "#7c3aed",
  "#059669",
  "#64748b",
  "#d97706",
  "#0284c7",
  "#db2777",
  "#94a3b8",
  "#e11d48",
];

export function StatsView() {
  const s = useSimStore((st) => st.snapshot);
  const sim = useSimStore((st) => st.sim);
  if (!s || !sim) return null;
  // Las tasas diarias solo son representativas tras un día completo; antes se muestran los totales.
  const fullDay = s.data.elapsedDays >= 1;
  const hours = s.data.elapsedDays * 24;
  const span = hours >= 1 ? `en ${formatNumber(hours, 1)} h` : `en ${formatNumber(hours * 60, 0)} min`;
  const perDay = (perDayValue: number, total: number) =>
    fullDay ? `${formatBytes(perDayValue)}/día` : formatBytes(total);
  const p95 = s.alerts.consoleP95;
  const health = sim.params.wearable.batteryHealth;
  const breakdown = sim.wearable.averageBreakdown();
  const totalI = Object.values(breakdown).reduce((a, b) => a + b, 0) || 1;
  const rawWan = 70.4e6;

  return (
    <div className="space-y-2">
      <Section title="Objetivos de la memoria">
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="Alerta crítica → consola (p95)"
            value={p95 === null ? "—" : formatDuration(p95)}
            hint={
              s.alerts.consoleLast !== null
                ? `Última: ${formatDuration(s.alerts.consoleLast)} · objetivo ≤ 30 s (OE-4)`
                : "Objetivo ≤ 30 s (OE-4)"
            }
            status={p95 === null ? "neutral" : p95 <= 30 ? "ok" : "bad"}
          />
          <Stat
            label="Aviso local (detección → vibración)"
            value={s.alerts.localAlarmLast === null ? "—" : formatDuration(s.alerts.localAlarmLast)}
            hint="Objetivo ≤ 5 s, sin depender de la red"
            status={s.alerts.localAlarmLast === null ? "neutral" : s.alerts.localAlarmLast <= 5 ? "ok" : "bad"}
          />
          <Stat
            label={fullDay ? "Red móvil por día" : `Red móvil (${span})`}
            value={perDay(s.data.wanPerDay, s.data.wanBytes)}
            hint={`Objetivo ≤ 100 KB/día (OE-5) · en bruto: ${formatBytes(rawWan)}/día`}
            status={!fullDay ? "neutral" : s.data.wanPerDay <= 100_000 ? "ok" : "bad"}
          />
          <Stat
            label="Autonomía del wearable"
            value={`${formatNumber(s.wearable.autonomyDays, 1)} días`}
            hint={`Con la batería al ${formatNumber(health * 100)} % · objetivo ≥ 14 días`}
            status={s.wearable.autonomyDays >= 14 ? "ok" : "bad"}
          />
        </div>
      </Section>

      <Section title="Datos" collapsible>
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label={fullDay ? "BLE por día" : `BLE (${span})`}
            value={perDay(s.data.blePerDay, s.data.bleBytes)}
            hint={
              fullDay && s.wearable.mode === "edge"
                ? `×${formatNumber(s.data.rawBlePerDay / Math.max(s.data.blePerDay, 1), 0)} menos que en bruto (65,5 MB/día)`
                : "Wearable → estación (en bruto: 65,5 MB/día)"
            }
          />
          <Stat
            label={fullDay ? "Carga útil a la nube por día" : `Carga útil a la nube (${span})`}
            value={perDay(s.data.wanPayloadPerDay, s.data.wanPayloadPerDay * s.data.elapsedDays)}
            hint="SenML-CBOR sin cabeceras MQTT, TLS ni TCP/IP"
          />
          <Stat
            label="Coste de datos"
            value={fullDay ? `${formatNumber(s.data.costPerYear, 2)} €/año` : "—"}
            hint={fullDay ? "A 0,02 €/MB (capítulo 5)" : "Se calcula tras un día simulado"}
          />
          <Stat
            label="Red móvil"
            value={s.cellular.tech ? s.cellular.tech.toUpperCase() : "Sin servicio"}
            hint={`RSRP ${s.cellular.rsrp} dBm · cola ${s.station.queue} mensajes`}
            status={s.cellular.tech ? "ok" : "bad"}
          />
        </div>
      </Section>

      <Section title="Energía del wearable" collapsible>
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="Batería"
            value={formatPct(s.wearable.socPct / 100, 1)}
            hint={s.wearable.alarmOnly ? "Modo de solo alarmas" : `${formatNumber(s.wearable.usableMah, 0)} mAh útiles`}
            status={s.wearable.socPct < 10 ? "bad" : s.wearable.socPct < 20 ? "warn" : "ok"}
          />
          <Stat
            label="Corriente media"
            value={`${formatNumber(s.wearable.averageCurrent, 3)} mA`}
            hint={`Ahora: ${formatNumber(s.wearable.instantCurrent, 3)} mA`}
          />
        </div>
        <div className="space-y-1">
          <div
            className="flex h-2.5 overflow-hidden rounded-full"
            aria-label="Reparto de la corriente media por bloque"
          >
            {Object.entries(breakdown).map(([k, v], i) =>
              v > 0 ? (
                <div
                  key={k}
                  style={{ width: `${(v / totalI) * 100}%`, backgroundColor: BLOCK_COLORS[i % BLOCK_COLORS.length] }}
                  title={`${k === "events" ? "Vibración y avisos" : BLOCK_LABELS[k as keyof typeof BLOCK_LABELS]}: ${formatNumber(v, 4)} mA`}
                />
              ) : null,
            )}
          </div>
          <ul className="grid grid-cols-2 gap-x-2 text-[10px] text-slate-500">
            {Object.entries(breakdown).map(([k, v], i) =>
              v > 0 ? (
                <li key={k} className="flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: BLOCK_COLORS[i % BLOCK_COLORS.length] }}
                  />
                  <span className="truncate">
                    {k === "events" ? "Avisos" : BLOCK_LABELS[k as keyof typeof BLOCK_LABELS]}
                  </span>
                  <span className="ml-auto font-mono">{formatNumber((v / totalI) * 100, 0)} %</span>
                </li>
              ) : null,
            )}
          </ul>
        </div>
      </Section>

      <Section title="Clasificador del wearable" collapsible>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Ventanas de 8 s" value={formatNumber(s.classifier.windows)} />
          <Stat
            label="Exactitud frente a la verdad"
            value={Number.isFinite(s.classifier.accuracy) ? formatPct(s.classifier.accuracy, 2) : "—"}
            hint="La simulación conoce el ritmo real del paciente"
          />
        </div>
        <ConfusionTable matrix={sim.metrics.confusion} />
      </Section>

      <Section title="Congestión (índice y peso)" collapsible>
        <MiniChart
          height={130}
          xLabel="días"
          formatX={(x) => formatNumber(x, 1)}
          threshold={{ y: sim.params.cloud.congestionThreshold, label: "umbral" }}
          series={[
            {
              label: "Índice de congestión",
              color: "#ca8a04",
              points: sim.station.congestionResults.map((c) => ({ x: c.day + 8 / 24, y: c.index })),
            },
            {
              label: "Peso (kg)",
              color: "#0891b2",
              axis: "right",
              points: sim.platform.weights.filter((w) => w.valid).map((w) => ({ x: (w.t + 6 * 3600) / DAY, y: w.kg })),
            },
          ]}
        />
      </Section>

      <Section title="Contadores" collapsible>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {(
            [
              ["Mensajes guardados y reenviados", s.metrics.storedAndForwarded],
              ["Duplicados descartados (QoS 1)", s.metrics.duplicates],
              ["SMS de respaldo", s.metrics.sms],
              [
                "Pesajes válidos / descartados",
                `${s.metrics.weighings - s.metrics.weighingsRejected} / ${s.metrics.weighingsRejected}`,
              ],
              ["Dosis liberadas / tomadas", `${s.metrics.dosesDispensed} / ${s.metrics.dosesTaken}`],
              ["Órdenes rechazadas", s.metrics.ordersRejected],
              ["Recursos FHIR publicados", s.metrics.fhirResources],
              ["Alertas (críticas)", `${s.alerts.total} (${s.alerts.critical})`],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-right font-mono text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}

function ConfusionTable({ matrix }: { matrix: number[][] }) {
  const total = matrix.flat().reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return (
    <table className="w-full border-collapse text-[10px]">
      <caption className="pb-1 text-left text-slate-500">Ventanas por clase real (filas) y predicha (columnas)</caption>
      <thead>
        <tr>
          <th />
          {RHYTHM_CLASSES.map((c) => (
            <th key={c} className="px-1 py-0.5 font-normal text-slate-500" title={CLASS_LABELS[c]}>
              {CLASS_LABELS[c].slice(0, 6)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {matrix.map((row, i) =>
          row.some((v) => v > 0) ? (
            <tr key={RHYTHM_CLASSES[i]}>
              <th className="py-0.5 pr-1 text-left font-normal text-slate-500">{CLASS_LABELS[RHYTHM_CLASSES[i]]}</th>
              {row.map((v, j) => (
                <td
                  key={j}
                  className={`px-1 text-right font-mono ${i === j ? "text-emerald-700" : v > 0 ? "text-rose-700" : "text-slate-300"}`}
                >
                  {v}
                </td>
              ))}
            </tr>
          ) : null,
        )}
      </tbody>
    </table>
  );
}
