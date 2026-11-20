import { describe, expect, it } from "vitest";
import { Emitter } from "../core/emitter";
import { Rng } from "../core/rng";
import { Scheduler } from "../core/scheduler";
import { DAY, HOUR, timeAt } from "../core/time";
import { deriveKeyPair, signOrder, verifyOrder } from "../cloud/signing";
import { BleLink } from "../network/ble";
import { CellularLink } from "../network/cellular";
import { DEFAULT_PARAMS, cloneParams } from "../params";
import { SPOTS } from "../physiology/home";
import type { DoseOrder } from "../records";
import type { SimContext, SimEvents } from "../types";
import { congestionIndex, type DayRecord } from "./congestion";
import { Dispenser, type DispenserEvent } from "./dispenser";

function context(): SimContext {
  return {
    scheduler: new Scheduler(),
    params: cloneParams(DEFAULT_PARAMS),
    rng: new Rng(1),
    bus: new Emitter<SimEvents>(),
    transmit: (tx) => ({ ...tx, id: 0 }),
    narrate: () => {},
  };
}

const keys = deriveKeyPair("prueba");

function order(over: Partial<DoseOrder> = {}): DoseOrder {
  const o: DoseOrder = {
    orderId: "ORD-1",
    seq: 1,
    patient: "pac-1",
    drug: "Furosemida 40 mg",
    doseMg: 40,
    validFrom: timeAt(0, 8),
    validUntil: timeAt(1, 6),
    proposedAt: 0,
    reason: "prueba",
    status: "firmada",
    history: [],
    ...over,
  };
  o.signature = signOrder(o, keys.secretKey);
  return o;
}

describe("firma de órdenes (ECDSA P-256)", () => {
  it("verifica una orden firmada y rechaza una alterada", () => {
    const o = order();
    expect(verifyOrder(o, keys.publicKey)).toBe(true);
    expect(verifyOrder({ ...o, doseMg: 80 }, keys.publicKey)).toBe(false);
    expect(verifyOrder(o, deriveKeyPair("otra").publicKey)).toBe(false);
  });
});

describe("microcontrolador del dispensador", () => {
  function setup() {
    const ctx = context();
    const released: string[] = [];
    const events: DispenserEvent[] = [];
    const d = new Dispenser(
      ctx,
      keys.publicKey,
      (kind) => released.push(kind),
      (ev) => events.push(ev),
    );
    d.start();
    return { ctx, d, released, events };
  }

  it("ejecuta una orden firmada a la hora preferida (15:00) y respeta la toma basal", () => {
    const { ctx, d, released } = setup();
    ctx.scheduler.runUntil(timeAt(0, 10));
    expect(released).toEqual(["basal"]);
    expect(d.receiveOrder(order(), ctx.scheduler.now)).toBe(true);
    ctx.scheduler.runUntil(timeAt(0, 16));
    expect(released).toEqual(["basal", "extra"]);
  });

  it("rechaza firmas falsas, repeticiones, secuencias antiguas y órdenes caducadas", () => {
    const { ctx, d, events } = setup();
    ctx.scheduler.runUntil(timeAt(0, 10));
    const forged = { ...order(), signature: "ab".repeat(64) };
    expect(d.receiveOrder(forged, ctx.scheduler.now)).toBe(false);
    const ok = order();
    expect(d.receiveOrder(ok, ctx.scheduler.now)).toBe(true);
    expect(d.receiveOrder(structuredClone(ok), ctx.scheduler.now)).toBe(false);
    expect(d.receiveOrder(order({ orderId: "ORD-0", seq: 0 }), ctx.scheduler.now)).toBe(false);
    const expired = order({ orderId: "ORD-9", seq: 9, validUntil: timeAt(0, 9) });
    expect(d.receiveOrder(expired, ctx.scheduler.now)).toBe(false);
    expect(events.filter((e) => e.kind === "rejected").map((e) => e.reason)).toEqual([
      "firma no válida",
      "orden ya ejecutada (repetida)",
      "número de secuencia antiguo",
      "orden caducada",
    ]);
  });

  it("nunca abre dos veces en menos del intervalo mínimo", () => {
    const { ctx, d, released } = setup();
    ctx.scheduler.runUntil(timeAt(0, 10));
    // Orden firmada que pide la dosis enseguida (válida solo hasta las 12:00): no cabe.
    const tooSoon = order({ orderId: "ORD-2", seq: 2, validFrom: timeAt(0, 10), validUntil: timeAt(0, 12) });
    expect(d.receiveOrder(tooSoon, ctx.scheduler.now)).toBe(false);
    ctx.scheduler.runUntil(timeAt(0, 13));
    expect(released).toEqual(["basal"]);
  });
});

describe("índice de congestión", () => {
  const base = (): DayRecord[] =>
    Array.from({ length: 16 }, (_, i) => ({
      day: i - 16,
      weight: 78,
      nightImpedance: 50,
      nightResp: 13,
      dayActivity: 0.2,
    }));

  it("es bajo con el paciente estable", () => {
    const h = [...base(), { day: 0, weight: 78.1, nightImpedance: 49.9, nightResp: 13.1 }];
    h[15].dayActivity = 0.2;
    expect(congestionIndex(h, 0).index).toBeLessThan(10);
  });

  it("supera el umbral con +2 kg, −6 % de impedancia y más respiración", () => {
    const h = base().filter((r) => r.day < -2);
    h.push(
      { day: -2, weight: 79.5, nightImpedance: 49, nightResp: 14 },
      { day: -1, weight: 80, nightImpedance: 48, nightResp: 15, dayActivity: 0.15 },
      { day: 0, weight: 80.4, nightImpedance: 47, nightResp: 16 },
    );
    const r = congestionIndex(h, 0);
    expect(r.deltaWeightKg).toBeGreaterThan(1.5);
    expect(r.deltaImpedancePct).toBeGreaterThan(5);
    expect(r.index).toBeGreaterThanOrEqual(50);
  });

  it("excluye de la línea basal las noches tras un cambio de parche", () => {
    const h = base();
    h[10].nightImpedance = 60;
    h[10].patchExcluded = true;
    h.push({ day: 0, weight: 78, nightImpedance: 50, nightResp: 13 });
    expect(congestionIndex(h, 0).deltaImpedancePct).toBeCloseTo(0, 5);
  });
});

describe("enlaces", () => {
  it("BLE: la señal cae con la distancia y los tabiques", () => {
    const near = BleLink.meanRssi(SPOTS.sofa, SPOTS.station, 0, 5, 3);
    const bed = BleLink.meanRssi(SPOTS.bed, SPOTS.station, 0, 5, 3);
    const street = BleLink.meanRssi(SPOTS.street, SPOTS.station, 0, 5, 3);
    expect(near).toBeGreaterThan(bed);
    expect(street).toBeLessThan(-103);
  });

  it("BLE: se desconecta lejos de casa y reconecta al volver", () => {
    const p = cloneParams(DEFAULT_PARAMS);
    const ble = new BleLink(p, new Rng(2));
    let t = 0;
    for (; t < 30; t++) ble.update(t, SPOTS.street, SPOTS.station, 3);
    expect(ble.state).toBe("disconnected");
    for (; t < 40; t++) ble.update(t, SPOTS.sofa, SPOTS.station, 3);
    expect(ble.state).toBe("connected");
  });

  it("red móvil: LTE-M con buena cobertura, NB-IoT con peor y nada por debajo de −126 dBm", () => {
    const p = cloneParams(DEFAULT_PARAMS);
    const cell = new CellularLink(p, new Rng(1));
    p.cellular.rsrpDbm = -100;
    expect(cell.tech).toBe("lte-m");
    p.cellular.rsrpDbm = -122;
    expect(cell.tech).toBe("nb-iot");
    p.cellular.rsrpDbm = -130;
    expect(cell.tech).toBeNull();
    p.cellular.rsrpDbm = -100;
    cell.outage = true;
    expect(cell.sendUp(0, 100)).toBeNull();
  });

  it("red móvil: los mensajes se transmiten en serie y la cola crece si no caben", () => {
    const p = cloneParams(DEFAULT_PARAMS);
    p.cellular.rsrpDbm = -123; // NB-IoT con repeticiones: 1,5 kbit/s
    const cell = new CellularLink(p, new Rng(1));
    for (let i = 0; i < 10; i++) cell.sendUp(0, 15000);
    expect(cell.backlog(0)).toBeGreaterThan(HOUR / 5);
    expect(DAY).toBe(86400);
  });
});
