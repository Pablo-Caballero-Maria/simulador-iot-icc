import { describe, expect, it } from "vitest";
import { Rng } from "./rng";
import { Scheduler } from "./scheduler";
import { mean, percentile, stdDev, RingSeries } from "./stats";
import { DAY, HOUR, dayIndex, formatBytes, formatDuration, hourOfDay, nextTimeOfDay, timeAt } from "./time";

describe("Rng", () => {
  it("es determinista para una misma semilla", () => {
    const a = new Rng(7);
    const b = new Rng(7);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it("genera normales con la media y la desviación pedidas", () => {
    const r = new Rng(1);
    const xs = Array.from({ length: 20000 }, () => r.normal(5, 2));
    expect(mean(xs)).toBeCloseTo(5, 1);
    expect(stdDev(xs)).toBeCloseTo(2, 1);
  });

  it("los generadores hijos son independientes entre sí", () => {
    const r = new Rng(3);
    expect(r.fork("a").next()).not.toEqual(r.fork("b").next());
  });
});

describe("Scheduler", () => {
  it("ejecuta los eventos por orden de instante y, a igualdad, por orden de inserción", () => {
    const s = new Scheduler();
    const log: string[] = [];
    s.at(2, "b", () => log.push("b"));
    s.at(1, "a", () => log.push("a"));
    s.at(2, "c", () => log.push("c"));
    s.runUntil(10);
    expect(log).toEqual(["a", "b", "c"]);
    expect(s.now).toBe(10);
  });

  it("permite cancelar eventos y tareas periódicas", () => {
    const s = new Scheduler();
    let n = 0;
    const h = s.at(5, "x", () => n++);
    s.cancel(h);
    const stop = s.every(1, 1, "tick", () => n++);
    s.runUntil(3);
    stop();
    s.runUntil(10);
    expect(n).toBe(3);
  });

  it("no ejecuta eventos posteriores al límite", () => {
    const s = new Scheduler();
    let fired = false;
    s.after(5, "late", () => (fired = true));
    s.runUntil(4.999);
    expect(fired).toBe(false);
  });
});

describe("tiempo", () => {
  it("la simulación empieza el día 0 a las 06:00", () => {
    expect(hourOfDay(0)).toBeCloseTo(6);
    expect(dayIndex(0)).toBe(0);
    expect(timeAt(1, 6)).toBe(DAY);
    expect(nextTimeOfDay(0, 8)).toBe(2 * HOUR);
    expect(nextTimeOfDay(3 * HOUR, 8)).toBe(DAY + 2 * HOUR);
  });

  it("formatea duraciones y tamaños como en la memoria", () => {
    expect(formatDuration(0.25)).toBe("250 ms");
    expect(formatDuration(4.2)).toBe("4,2 s");
    expect(formatBytes(64)).toBe("64 B");
    expect(formatBytes(87800)).toBe("87,8 KB");
    expect(formatBytes(65.5e6)).toBe("65,5 MB");
  });
});

describe("estadística", () => {
  it("calcula percentiles con interpolación", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([10], 95)).toBe(10);
  });

  it("el buffer circular conserva las últimas muestras en orden", () => {
    const r = new RingSeries(3);
    for (let i = 0; i < 5; i++) r.push(i, i * 10);
    expect(r.toArray().map((p) => p.value)).toEqual([20, 30, 40]);
  });
});
