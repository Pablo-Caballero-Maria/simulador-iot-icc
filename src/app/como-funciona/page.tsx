import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ReproduceWeek } from "@/components/results/ReproduceWeek";
import { PageShell } from "@/components/ui/PageShell";
import { LevelBadge } from "@/components/ui/primitives";
import results from "@/data/resultados.json";
import type { IotLevel } from "@/sim/types";

export const metadata: Metadata = {
  title: "Cómo funciona",
  description:
    "Qué se simula, con qué modelos y qué resultados da la simulación del sistema IoT para insuficiencia cardíaca.",
};

const n = (v: number, d = 1) => v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });

const PIPELINE: { level: IotLevel; where: string; what: string; out: string }[] = [
  {
    level: "N1",
    where: "Paciente simulado",
    what: "Genera cada latido según el ritmo vigente (sinusal, FA, TV, extrasístoles, pausas) y la congestión, el peso, la impedancia torácica, la respiración y la actividad según su rutina por la casa.",
    out: "Instantes de los latidos y magnitudes «verdaderas»",
  },
  {
    level: "N1",
    where: "Front-end del wearable",
    what: "Sintetiza el ECG a 256 Hz (ondas P-QRS-T, ruido muscular, de red y de movimiento) y lo cuantiza a 16 bit; o, a velocidad alta, aplica un modelo estadístico del detector a cada latido.",
    out: "Muestras de ECG o latidos detectados",
  },
  {
    level: "N3",
    where: "Firmware del wearable",
    what: "Filtro 0,5–40 Hz, detector de QRS de Pan–Tompkins, 10 rasgos por ventana de 8 s y red densa INT8 (10 → 16 → 5) con aritmética entera. Reglas de pausa y bradicardia independientes de la red.",
    out: "Clase de ritmo, alertas, vector de 64 B, tira de 15 392 B",
  },
  {
    level: "N2",
    where: "Enlace BLE",
    what: "Pérdida con la distancia, tabiques y cuerpo; cambio a LE Coded por debajo de −85 dBm; reconexión; retardo según el intervalo de conexión y la latencia de periférico; almacenamiento en la flash sin enlace.",
    out: "Bytes BLE, retardo y RSSI",
  },
  {
    level: "N3",
    where: "Estación (Fog)",
    what: "Decodifica y comprueba el CRC, confirma los eventos analizando la tira, calcula el índice de congestión, codifica en SenML-CBOR y publica por MQTT 5 (QoS 1, alias de tema) sobre TLS 1.3, con envío diferido y espera aleatoria al reconectar.",
    out: "Paquetes MQTT con su coste TLS y TCP/IP",
  },
  {
    level: "N2",
    where: "Red móvil",
    what: "LTE-M o NB-IoT según la cobertura (RSRP), con caudal y retardo por clase de cobertura; los mensajes se transmiten en serie y la cola crece si no caben. Cortes, keepalive y sesión TLS diaria.",
    out: "Bytes IP facturables y retardo",
  },
  {
    level: "N4",
    where: "Plataforma",
    what: "Ingesta idempotente (estación, secuencia), series temporales, traducción a FHIR con códigos LOINC, motor de alertas con escalado, motor de protocolo que propone el diurético y lo firma con ECDSA P-256.",
    out: "Alertas en consola, órdenes firmadas",
  },
  {
    level: "N7",
    where: "Personal y emergencias",
    what: "Enfermería, cardiología y centro coordinador con tiempos de respuesta aleatorios (o el propio usuario en modo manual); ambulancia que llega y se empareja con el wearable.",
    out: "Atención, firma, asistencia",
  },
];

export default function ComoFuncionaPage() {
  const r = results;
  return (
    <PageShell
      title="Cómo funciona la simulación"
      intro={
        <>
          <p>
            La web no reproduce una animación grabada: ejecuta un modelo del sistema completo descrito en la memoria,
            desde el corazón del paciente hasta la consola del hospital. Cada mensaje que se ve en 3D lleva bytes reales
            codificados con el protocolo correspondiente, y cada retardo sale del modelo de su tramo.
          </p>
          <p className="mt-2">
            El motor está escrito en TypeScript sin dependencias de la interfaz (
            <code className="text-cyan-800">src/sim</code>), de modo que los tests y el script de resultados lo ejecutan
            igual que el navegador.
          </p>
        </>
      }
    >
      <Section title="Un simulador de eventos discretos">
        <p>
          El tiempo avanza de evento en evento (un latido, el fin de una ventana, la llegada de un paquete, una toma
          programada…) con una cola de prioridad. Cada segundo se actualiza el mundo físico (posición del paciente,
          enlace BLE) y el wearable procesa el bloque de ECG de ese segundo. Toda la aleatoriedad sale de un generador
          con semilla: la misma semilla da exactamente el mismo resultado.
        </p>
        <p>
          El ECG tiene dos resoluciones. Hasta 120× el tiempo real se sintetiza la señal a 256 Hz y se procesa muestra a
          muestra, como en el firmware. A más velocidad se trabaja latido a latido con un modelo del detector calibrado
          con la ruta de señal; así se simulan diez días de descompensación en un minuto. La red neuronal es la misma en
          los dos casos.
        </p>
      </Section>

      <Section title="Qué se simula en cada nivel">
        <ol className="grid gap-3 md:grid-cols-2">
          {PIPELINE.map((p) => (
            <li key={p.where} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <LevelBadge level={p.level} compact />
                <h3 className="text-sm font-semibold text-slate-900">{p.where}</h3>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-700">{p.what}</p>
              <p className="mt-1 text-[12px] text-cyan-800">→ {p.out}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="La red neuronal del wearable">
        <p>
          Es una red densa de {r.classifier.parameters} parámetros (10 rasgos → 16 neuronas ReLU → 5 clases) que ocupa{" "}
          {r.classifier.weightBytes} bytes. Se entrena con{" "}
          <code className="text-cyan-800">npm run train:classifier</code> sobre{" "}
          {r.classifier.trainWindows.toLocaleString("es-ES")} ventanas sintéticas generadas con la propia cadena de
          procesado y se cuantiza a INT8 tras el entrenamiento. En {r.classifier.testWindows.toLocaleString("es-ES")}{" "}
          ventanas de prueba independientes acierta el {n(r.classifier.accuracyInt8 * 100, 1)} % en INT8 (
          {n(r.classifier.accuracyFloat * 100, 1)} % en coma flotante); dentro de la simulación, el{" "}
          {n(r.normalWeek.accuracyPct, 1)} % de las ventanas de una semana normal. Los datos son sintéticos: en el
          producto se entrenaría con PhysioNet y registros del propio parche.
        </p>
      </Section>

      <Section title="Resultados frente a los requisitos">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Requisito</th>
                <th className="px-3 py-2 font-medium">Objetivo</th>
                <th className="px-3 py-2 font-medium">Simulación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <Row
                req="Alerta crítica → consola (RNF-01)"
                goal="p95 ≤ 30 s"
                sim={`LTE-M: mediana ${n(r.vtLteM.toConsoleS.mediana)} s, p95 ${n(r.vtLteM.toConsoleS.p95)} s · NB-IoT: p95 ${n(r.vtNbIot.toConsoleS.p95)} s`}
              />
              <Row
                req="Aviso local"
                goal="≤ 5 s"
                sim={`${r.vtLteM.localAlarmMs} ms tras la detección; pausa: ${n(r.pause.localAlarmFromOnsetS.mediana, 0)} s desde su inicio`}
              />
              <Row
                req="Datos a la nube (OE-5)"
                goal="≤ 100 KB/día"
                sim={`${n(r.normalWeek.wanPerDayKB)} KB/día con 1 tira; ${n(r.threeStripDay.wanKB)} KB con 3 tiras (base: ${n(r.raw.wanPerDayMB)} MB)`}
              />
              <Row
                req="Autonomía (RNF-02)"
                goal="≥ 14 días con el 80 %"
                sim={`${n(r.normalWeek.autonomyDays)} días (${n(r.normalWeek.autonomyAgedDays)} con el 80 %); base: ${n(r.raw.autonomyDays)} días`}
              />
              <Row
                req="Antelación de la congestión (OE-3)"
                goal="≥ 5 días"
                sim={`Alerta el día ${n(r.decompensation.alertDay, 0)}; sin sistema, ingreso el día ${n(r.decompensation.admissionWithoutSystemDay)} (${n(r.decompensation.leadTimeDays)} días antes)`}
              />
              <Row
                req="Ingreso evitado"
                goal="—"
                sim={`${r.decompensation.doses.toLocaleString("es-ES")} dosis adicionales de media; congestión máxima ${n(r.decompensation.peakCongestion, 2)} (ingreso a 0,9)`}
              />
              <Row
                req="Sin red (RF-08)"
                goal="Alarma local y envío diferido"
                sim={`Vibración en ${n(r.outage.localAlarmS, 2)} s, SMS a los ${r.outage.smsS} s, ${r.outage.storedAndForwarded} mensajes guardados y enviados al volver la red`}
              />
              <Row
                req="Seguridad del dispensador (OE-8)"
                goal="Ninguna dosis no firmada"
                sim={`Rechazadas: ${r.attack.rejected.join("; ")}`}
              />
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-slate-500">
          Generado con <code>npm run results</code> ({r.generatedAt}): diez semillas por escenario. Detalle en el
          apartado 7 de la memoria.
        </p>
        <ReproduceWeek published={r.normalWeek} />
      </Section>

      <Section title="Límites del modelo">
        <ul className="list-disc space-y-1 pl-5">
          <li>El ECG, la congestión y las respuestas del personal son modelos sintéticos, no datos de pacientes.</li>
          <li>
            Los retardos de la red móvil siguen distribuciones típicas por tecnología y cobertura, no medidas de un
            operador concreto.
          </li>
          <li>
            Las corrientes del wearable son las estimadas en la memoria (Tabla 6); habrá que medirlas en el prototipo.
          </li>
          <li>
            La plataforma se modela por su comportamiento (ingesta, alertas, firma), no como un despliegue real de
            servicios.
          </li>
        </ul>
        <p>
          <Link href="/" className="text-cyan-700 hover:underline">
            Volver al simulador
          </Link>
        </p>
      </Section>
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="max-w-4xl space-y-3 text-[14px] leading-relaxed text-slate-700">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Row({ req, goal, sim }: { req: string; goal: string; sim: string }) {
  return (
    <tr>
      <td className="px-3 py-2 text-slate-800">{req}</td>
      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{goal}</td>
      <td className="px-3 py-2 text-slate-900">{sim}</td>
    </tr>
  );
}
