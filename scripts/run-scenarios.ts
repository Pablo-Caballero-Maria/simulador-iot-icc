/**
 * Ejecuta los escenarios sin interfaz, con varias semillas, y resume los
 * resultados frente a los requisitos de la memoria.
 *
 *   npm run results
 *
 * Escribe src/data/resultados.json: las cifras del apartado 7 de la memoria, que
 * también muestra la página «Cómo funciona».
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DAY, HOUR, MINUTE } from "../src/sim/core/time";
import { mean, percentile } from "../src/sim/core/stats";
import { sensitivity, breakEvenReduction, breakEvenRisk } from "../src/sim/economics";
import { DEFAULT_PARAMS, mergeParams } from "../src/sim/params";
import { createScenario } from "../src/sim/scenarios";
import { Simulation } from "../src/sim/simulation";
import { RhythmClassifier } from "../src/sim/wearable/classifier";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const r = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const results: Record<string, unknown> = {};

function log(msg: string) {
  process.stdout.write(`${msg}\n`);
}

// 1. Semana normal ----------------------------------------------------------
{
  const rows = SEEDS.slice(0, 5).map((seed) => {
    const sim = new Simulation({ params: DEFAULT_PARAMS, seed });
    sim.adaptFidelity(1e5);
    sim.advance(7 * DAY);
    const s = sim.snapshot();
    const falseAlerts = sim.allAlerts.filter((a) => a.real === false && a.consoleAt !== undefined).length;
    return {
      blePerDay: s.data.blePerDay,
      wanPerDay: s.data.wanPerDay,
      payloadPerDay: s.data.wanPayloadPerDay,
      autonomy: s.wearable.autonomyDays,
      current: s.wearable.averageCurrent,
      accuracy: s.classifier.accuracy,
      windows: s.classifier.windows,
      falseAlertsPerWeek: falseAlerts,
      critical: s.alerts.critical,
      bleCodedPct: (s.ble.timeIn.coded / (7 * DAY)) * 100,
      bleDisconnectedPct: (s.ble.timeIn.disconnected / (7 * DAY)) * 100,
      duplicates: s.metrics.duplicates,
    };
  });
  const avg = (k: keyof (typeof rows)[number]) => mean(rows.map((x) => x[k] as number));
  results.normalWeek = {
    blePerDayKB: r(avg("blePerDay") / 1000, 1),
    wanPerDayKB: r(avg("wanPerDay") / 1000, 1),
    payloadPerDayKB: r(avg("payloadPerDay") / 1000, 1),
    autonomyDays: r(avg("autonomy"), 1),
    autonomyAgedDays: r(avg("autonomy") * 0.8, 1),
    currentMa: r(avg("current"), 3),
    accuracyPct: r(avg("accuracy") * 100, 2),
    windowsPerWeek: avg("windows"),
    falseAlertsPerWeek: avg("falseAlertsPerWeek"),
    criticalAlerts: avg("critical"),
    bleCodedPct: r(avg("bleCodedPct"), 1),
    bleDisconnectedPct: r(avg("bleDisconnectedPct"), 1),
    duplicatesPerWeek: avg("duplicates"),
  };
  log(`Semana normal: ${JSON.stringify(results.normalWeek)}`);
}

// 1b. Seis meses de paciente estable: falsas alertas por paciente y año -----
{
  let alerts = 0;
  let days = 0;
  for (const seed of [11, 12]) {
    const sim = new Simulation({ params: DEFAULT_PARAMS, seed });
    sim.adaptFidelity(1e5);
    sim.advance(90 * DAY);
    days += 90;
    alerts += sim.allAlerts.filter((a) => a.alertClass <= 2 && a.code !== "symptom").length;
  }
  results.stableFalseAlerts = { days, alerts, perPatientYear: r((alerts / days) * 365, 2) };
  log(`Paciente estable: ${JSON.stringify(results.stableFalseAlerts)}`);
}

// 2. Día con tres tiras (supuesto de la ecuación 3) --------------------------
{
  const rows = SEEDS.slice(0, 5).map((seed) => {
    const sim = new Simulation({ params: DEFAULT_PARAMS, seed });
    sim.adaptFidelity(1e5);
    sim.advance(DAY + 2 * HOUR);
    const before = {
      ble: sim.metrics.bleTotal,
      wan: sim.cell.bytesUp + sim.cell.bytesDown,
      pay: sim.metrics.wanPayloadTotal,
    };
    // Dos eventos con tira además de la tira diaria programada.
    sim.scheduler.after(5 * HOUR, "evento-1", () => sim.pressSymptomButton());
    sim.scheduler.after(15 * HOUR, "evento-2", () => sim.pressSymptomButton());
    sim.advance(DAY);
    return {
      ble: sim.metrics.bleTotal - before.ble,
      wan: sim.cell.bytesUp + sim.cell.bytesDown - before.wan,
      pay: sim.metrics.wanPayloadTotal - before.pay,
    };
  });
  results.threeStripDay = {
    bleKB: r(mean(rows.map((x) => x.ble)) / 1000, 1),
    wanKB: r(mean(rows.map((x) => x.wan)) / 1000, 1),
    payloadKB: r(mean(rows.map((x) => x.pay)) / 1000, 1),
  };
  log(`Día con 3 tiras: ${JSON.stringify(results.threeStripDay)}`);
}

// 3. Taquicardia ventricular: retardos con LTE-M y con NB-IoT ---------------
function vtRuns(rsrp: number) {
  const local: number[] = [];
  const station: number[] = [];
  const consoleD: number[] = [];
  const ack: number[] = [];
  let ambulance = 0;
  for (const seed of SEEDS) {
    const sim = createScenario("vt", mergeParams(DEFAULT_PARAMS, { cellular: { rsrpDbm: rsrp } }), seed);
    sim.adaptFidelity(5);
    sim.advance(30 * MINUTE);
    const a = sim.allAlerts.find((x) => x.code === "vt");
    if (!a) continue;
    local.push(a.localAlarmAt! - a.detectedAt);
    station.push(a.stationAt! - a.detectedAt);
    consoleD.push(a.consoleAt! - a.detectedAt);
    if (a.ackAt) ack.push(a.ackAt - a.consoleAt!);
    if (a.ambulance?.arrivedAt) ambulance++;
  }
  return {
    runs: consoleD.length,
    localAlarmMs: r(mean(local) * 1000, 0),
    toStationS: { mediana: r(percentile(station, 50), 2), max: r(Math.max(...station), 2) },
    toConsoleS: {
      mediana: r(percentile(consoleD, 50), 1),
      p95: r(percentile(consoleD, 95), 1),
      max: r(Math.max(...consoleD), 1),
    },
    ackS: { mediana: r(percentile(ack, 50), 0) },
    ambulanceArrived: ambulance,
  };
}
results.vtLteM = vtRuns(-100);
results.vtNbIot = vtRuns(-122);
log(`TV con LTE-M: ${JSON.stringify(results.vtLteM)}`);
log(`TV con NB-IoT: ${JSON.stringify(results.vtNbIot)}`);

// 4. Fibrilación auricular y pausa: tiempo desde el inicio del episodio -----
{
  const af: number[] = [];
  const afConsole: number[] = [];
  const pause: number[] = [];
  for (const seed of SEEDS) {
    const sim = createScenario("af", DEFAULT_PARAMS, seed);
    const onset = sim.now + 20;
    sim.adaptFidelity(10);
    sim.advance(5 * MINUTE);
    const a = sim.allAlerts.find((x) => x.code === "af");
    if (a) {
      af.push(a.detectedAt - onset);
      if (a.consoleAt) afConsole.push(a.consoleAt - onset);
    }
    const p = createScenario("pause", DEFAULT_PARAMS, seed);
    const pOnset = p.now + 20;
    p.adaptFidelity(2);
    p.advance(MINUTE);
    const pa = p.allAlerts.find((x) => x.code === "pause");
    if (pa?.localAlarmAt) pause.push(pa.localAlarmAt - pOnset);
  }
  results.af = {
    detectS: { mediana: r(percentile(af, 50), 0), max: r(Math.max(...af), 0) },
    consoleS: { mediana: r(percentile(afConsole, 50), 0) },
  };
  results.pause = { localAlarmFromOnsetS: { mediana: r(percentile(pause, 50), 1), max: r(Math.max(...pause), 1) } };
  log(`FA: ${JSON.stringify(results.af)} · Pausa: ${JSON.stringify(results.pause)}`);
}

// 5. Corte de red ------------------------------------------------------------
{
  const sim = createScenario("outage", DEFAULT_PARAMS, 3);
  sim.adaptFidelity(1000);
  sim.advance(4 * HOUR);
  const a = sim.allAlerts.find((x) => x.code === "vt")!;
  results.outage = {
    localAlarmS: r(a.localAlarmAt! - a.detectedAt, 2),
    smsS: r(a.smsAt! - a.detectedAt, 0),
    consoleAfterH: r((a.consoleAt! - a.detectedAt) / HOUR, 2),
    storedAndForwarded: sim.metrics.storedAndForwarded,
  };
  log(`Corte: ${JSON.stringify(results.outage)}`);
}

// 6. Descompensación ----------------------------------------------------------
{
  const rows = SEEDS.slice(0, 5).map((seed) => {
    const sim = createScenario("decompensation", DEFAULT_PARAMS, seed);
    const start = sim.now;
    sim.adaptFidelity(1e5);
    let peak = 0;
    for (let d = 0; d < 12 * 24; d++) {
      sim.advance(HOUR);
      peak = Math.max(peak, sim.patient.congestionAt(sim.now));
    }
    const alert = sim.allAlerts.find((x) => x.code === "congestion");
    const firstDose = sim.platform.orders.find((o) => o.status === "tomada");
    return {
      alertDay: alert ? (alert.detectedAt - start) / DAY : Number.NaN,
      signedH: alert && firstDose?.signedAt ? (firstDose.signedAt - alert.consoleAt!) / HOUR : Number.NaN,
      firstDoseDay: firstDose?.executedAt ? (firstDose.executedAt - start) / DAY : Number.NaN,
      doses: sim.platform.orders.filter((o) => o.status === "tomada").length,
      peak,
      admitted: sim.patient.admittedAt !== null,
      index: alert ? alert.confidence * 100 : 0,
    };
  });
  results.decompensation = {
    admissionWithoutSystemDay: r(0.9 / 0.11, 1),
    alertDay: r(mean(rows.map((x) => x.alertDay)), 1),
    leadTimeDays: r(0.9 / 0.11 - mean(rows.map((x) => x.alertDay)), 1),
    signatureDelayH: r(mean(rows.map((x) => x.signedH)), 1),
    firstDoseDay: r(mean(rows.map((x) => x.firstDoseDay)), 1),
    doses: mean(rows.map((x) => x.doses)),
    peakCongestion: r(mean(rows.map((x) => x.peak)), 2),
    admitted: rows.filter((x) => x.admitted).length,
  };
  log(`Descompensación: ${JSON.stringify(results.decompensation)}`);
}

// 7. Ataque -------------------------------------------------------------------
{
  const sim = createScenario("attack", DEFAULT_PARAMS, 1);
  sim.adaptFidelity(5);
  sim.advance(10 * MINUTE);
  results.attack = {
    rejected: sim.platform.orders.filter((o) => o.forged).map((o) => o.rejectReason),
    extraDoses: sim.metrics.dosesDispensed,
  };
  log(`Ataque: ${JSON.stringify(results.attack)}`);
}

// 8. Escenario base -----------------------------------------------------------
{
  const consoleD: number[] = [];
  let wan = 0;
  let ble = 0;
  let autonomy = 0;
  let current = 0;
  for (const seed of SEEDS.slice(0, 5)) {
    const sim = createScenario("raw", DEFAULT_PARAMS, seed);
    sim.adaptFidelity(1000);
    sim.advance(DAY);
    const s = sim.snapshot();
    wan += s.data.wanPerDay / 5;
    ble += s.data.blePerDay / 5;
    autonomy += s.wearable.autonomyDays / 5;
    current += s.wearable.averageCurrent / 5;
    const a = sim.allAlerts.find((x) => x.code === "vt" && x.consoleAt);
    if (a) consoleD.push(a.consoleAt! - a.detectedAt);
  }
  results.raw = {
    blePerDayMB: r(ble / 1e6, 1),
    wanPerDayMB: r(wan / 1e6, 1),
    autonomyDays: r(autonomy, 1),
    currentMa: r(current, 3),
    vtToConsoleS: { mediana: r(percentile(consoleD, 50), 1), max: r(Math.max(...consoleD), 1) },
  };
  log(`Base: ${JSON.stringify(results.raw)}`);
}

// 9. Batería baja -------------------------------------------------------------
{
  const sim = createScenario("battery", DEFAULT_PARAMS, 1);
  const start = sim.now;
  sim.adaptFidelity(1e5);
  const marks: Record<string, number> = {};
  for (let h = 0; h < 12 * 24 && !sim.wearable.off; h++) {
    sim.advance(HOUR);
    for (const lvl of [20, 10, 5])
      if (marks[lvl] === undefined && sim.wearable.battery.socPct <= lvl) marks[lvl] = (sim.now - start) / DAY;
  }
  results.battery = Object.fromEntries(Object.entries(marks).map(([k, v]) => [`${k}%`, r(v, 1)]));
  log(`Batería: ${JSON.stringify(results.battery)}`);
}

// 10. Clasificador y economía ---------------------------------------------------
{
  const clf = new RhythmClassifier();
  results.classifier = { parameters: clf.parameterCount, weightBytes: clf.weightBytes, ...clf.meta };
  const eco = sensitivity();
  results.economics = {
    ...Object.fromEntries(
      Object.entries(eco).map(([k, v]) => [
        k,
        {
          avoided: r(v.avoided, 1),
          treatedAtHome: r(v.treatedAtHome, 1),
          annualSavings: Math.round(v.annualSavings),
          netAnnual: Math.round(v.netAnnual),
          paybackMonths: Number.isFinite(v.paybackMonths) ? r(v.paybackMonths, 0) : null,
          roi3Pct: r(v.roi3 * 100, 1),
          bedDays: Math.round(v.bedDaysFreed),
        },
      ]),
    ),
    capex: eco.base.capex,
    opex: eco.base.opex,
    costPerPatientMonth: r(eco.base.costPerPatientMonth, 1),
    breakEvenReductionPct: r(breakEvenReduction() * 100, 1),
    breakEvenRisk: r(breakEvenRisk(), 2),
  };
  log(`Economía: ${JSON.stringify(results.economics)}`);
}

const dir = join(import.meta.dirname, "../src/data");
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, "resultados.json"),
  `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), ...results }, null, 2)}\n`,
);
log("Resultados guardados en src/data/resultados.json");
