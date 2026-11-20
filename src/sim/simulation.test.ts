import { describe, expect, it } from "vitest";
import { DAY, HOUR, MINUTE } from "./core/time";
import { DEFAULT_PARAMS, CONTROL_GROUPS, mergeParams } from "./params";
import { createScenario, SCENARIOS } from "./scenarios";
import { Simulation } from "./simulation";
import { STRIP_BYTES } from "./wearable/payloads";

describe("parámetros", () => {
  it("cada control de la interfaz apunta a un parámetro que existe", () => {
    for (const g of CONTROL_GROUPS) {
      for (const c of g.controls) expect(DEFAULT_PARAMS[c.group]).toHaveProperty(c.key);
    }
  });
});

describe("simulación de un día normal", () => {
  const sim = new Simulation({ params: DEFAULT_PARAMS, seed: 5 });
  sim.adaptFidelity(10000);
  sim.advance(DAY);
  const s = sim.snapshot();

  it("envía por BLE solo vectores, tiras y control (decenas de KB en lugar de 65,5 MB)", () => {
    expect(sim.metrics.bleBytes.vector).toBe(24 * 64 + 64);
    expect(sim.metrics.bleBytes.strip).toBe(STRIP_BYTES);
    expect(s.data.blePerDay).toBeLessThan(50_000);
  });

  it("sube a la nube menos de 100 KB al día (OE-5)", () => {
    expect(s.data.wanPerDay).toBeLessThan(100_000);
    expect(s.data.wanPerDay).toBeGreaterThan(20_000);
  });

  it("la corriente media del wearable reproduce la Tabla 6 (≈ 0,153 mA, 46 días)", () => {
    expect(s.wearable.averageCurrent).toBeCloseTo(0.153, 2);
    expect(s.wearable.autonomyDays).toBeGreaterThan(44);
    expect(s.wearable.autonomyDays).toBeLessThan(48);
  });

  it("clasifica bien casi todas las ventanas y no genera alertas críticas", () => {
    expect(s.classifier.windows).toBe(DAY / 8);
    expect(s.classifier.accuracy).toBeGreaterThan(0.98);
    expect(s.alerts.critical).toBe(0);
  });

  it("pesa al paciente, libera la toma basal y traduce los vectores a FHIR", () => {
    expect(s.metrics.weighings).toBe(1);
    expect(s.metrics.dosesDispensed).toBe(1);
    expect(s.metrics.fhirResources).toBeGreaterThanOrEqual(40);
  });

  it("guarda los datos durante el paseo fuera de alcance y los envía después", () => {
    expect(s.ble.timeIn.disconnected).toBeGreaterThan(30 * MINUTE);
    expect(s.metrics.storedAndForwarded).toBeGreaterThan(0);
    expect(s.wearable.buffered).toBe(0);
  });

  it("es determinista: la misma semilla da el mismo resultado", () => {
    const again = new Simulation({ params: DEFAULT_PARAMS, seed: 5 });
    again.adaptFidelity(10000);
    again.advance(DAY);
    expect(again.snapshot().data).toEqual(s.data);
  });
});

describe("escenarios", () => {
  it("hay un escenario para cada situación de la memoria", () => {
    expect(SCENARIOS.map((x) => x.id)).toEqual([
      "normal",
      "vt",
      "af",
      "pause",
      "decompensation",
      "outage",
      "away",
      "attack",
      "raw",
      "battery",
    ]);
  });

  it("taquicardia ventricular: aviso local inmediato, consola en menos de 30 s y ambulancia", () => {
    const sim = createScenario("vt");
    sim.adaptFidelity(5);
    sim.advance(30 * MINUTE);
    const vt = sim.allAlerts.find((a) => a.code === "vt");
    expect(vt).toBeDefined();
    expect(vt!.real).toBe(true);
    expect(vt!.localAlarmAt! - vt!.detectedAt).toBeLessThan(1);
    expect(vt!.consoleAt! - vt!.detectedAt).toBeLessThan(30);
    expect(vt!.ambulance?.arrivedAt).toBeDefined();
    expect(vt!.stripAt).toBeDefined();
  });

  it("fibrilación auricular: alerta de clase 2 confirmada por la estación", () => {
    const sim = createScenario("af");
    sim.adaptFidelity(10);
    sim.advance(20 * MINUTE);
    const af = sim.allAlerts.find((a) => a.code === "af");
    expect(af?.alertClass).toBe(2);
    expect(af?.stationVerdict).toBe("confirmada");
    expect(af?.consoleAt).toBeDefined();
  });

  it("pausa: la regla independiente genera una alerta crítica", () => {
    const sim = createScenario("pause");
    sim.adaptFidelity(2);
    sim.advance(2 * MINUTE);
    const pause = sim.allAlerts.find((a) => a.code === "pause");
    expect(pause?.alertClass).toBe(1);
    expect(pause?.real).toBe(true);
  });

  it("corte de red: la alarma local funciona, sale un SMS y lo guardado llega al volver la red", () => {
    const sim = createScenario("outage");
    sim.adaptFidelity(1000);
    sim.advance(4 * HOUR);
    const vt = sim.allAlerts.find((a) => a.code === "vt")!;
    expect(vt.localAlarmAt).toBeDefined();
    expect(vt.smsAt).toBeDefined();
    expect(vt.consoleAt! - vt.detectedAt).toBeGreaterThan(HOUR);
    expect(sim.metrics.storedAndForwarded).toBeGreaterThan(3);
    expect(sim.station.queueLength).toBe(0);
  });

  it("descompensación: avisa días antes, se firma la pauta y se evita el ingreso", () => {
    const sim = createScenario("decompensation");
    sim.adaptFidelity(100000);
    sim.advance(10 * DAY);
    const alert = sim.allAlerts.find((a) => a.code === "congestion");
    expect(alert).toBeDefined();
    const withoutSystem = (0.9 - 0) / 0.11; // días hasta el umbral de ingreso
    expect((alert!.detectedAt - 0) / DAY).toBeLessThan(withoutSystem - 4);
    expect(sim.platform.orders.some((o) => o.status === "tomada")).toBe(true);
    expect(sim.patient.admittedAt).toBeNull();
  });

  it("ataque: el dispensador rechaza la orden falsa y la repetida", () => {
    const sim = createScenario("attack");
    sim.adaptFidelity(5);
    sim.advance(10 * MINUTE);
    const forged = sim.platform.orders.filter((o) => o.forged);
    expect(forged).toHaveLength(2);
    expect(forged.map((o) => o.rejectReason)).toEqual(["firma no válida", "orden ya ejecutada (repetida)"]);
    expect(sim.metrics.ordersRejected).toBe(2);
  });

  it("escenario base: unos 70 MB al día y autonomía de unos 14 días", () => {
    const sim = createScenario("raw");
    sim.adaptFidelity(1000);
    sim.advance(6 * HOUR);
    const s = sim.snapshot();
    expect(s.data.wanPerDay / 1e6).toBeGreaterThan(65);
    expect(s.data.wanPerDay / 1e6).toBeLessThan(75);
    expect(s.wearable.autonomyDays).toBeGreaterThan(13.5);
    expect(s.wearable.autonomyDays).toBeLessThan(15);
    // En el escenario base la alerta no nace en el wearable, sino en la nube.
    expect(sim.allAlerts.some((a) => a.origin === "wearable")).toBe(false);
    const vt = sim.allAlerts.find((a) => a.origin === "cloud" && a.code === "vt");
    expect(vt?.consoleAt).toBeDefined();
    expect(vt?.localAlarmAt).toBeDefined();
  });

  it("batería baja: pasa a modo de solo alarmas al 5 %", () => {
    const sim = createScenario("battery");
    sim.adaptFidelity(100000);
    sim.advance(8 * DAY);
    expect(sim.wearable.alarmOnly).toBe(true);
  });

  it("duplicados: la ingesta descarta los reenvíos de QoS 1", () => {
    const sim = new Simulation({ params: mergeParams(DEFAULT_PARAMS, { cellular: { pubackLoss: 0.3 } }), seed: 9 });
    sim.adaptFidelity(10000);
    sim.advance(DAY / 2);
    expect(sim.metrics.duplicatesDropped).toBeGreaterThan(0);
  });
});
