import { describe, expect, it } from "vitest";
import { Rng } from "../core/rng";
import { ECG_FS, EcgSynth } from "../physiology/ecg";
import { BeatGenerator, type Beat, type HeartState, type Rhythm } from "../physiology/rhythm";
import { RHYTHM_CLASSES } from "./classes";
import { RhythmClassifier } from "./classifier";
import { generateDataset } from "./dataset";
import { PanTompkins, type DetectedBeat } from "./dsp";
import { Battery, CURRENT_TABLE, totalCurrent } from "./energy";
import {
  ALERT_BYTES,
  STRIP_BYTES,
  VECTOR_BYTES,
  decodeVector,
  encodeAlert,
  encodeStrip,
  encodeVector,
  type HourlyVector,
} from "./payloads";
import { RuleEngine } from "./rules";
import { RAW_BITRATE } from "./wearable";
import type { WindowFeatures } from "./features";
import model from "./rhythm-model.json";

/** Sintetiza `seconds` de ECG limpio y ejecuta el detector. */
function detect(rhythm: Rhythm, hr: number, seconds: number, seed = 1) {
  const rng = new Rng(seed);
  const gen = new BeatGenerator(rng.fork("b"), -1);
  const synth = new EcgSynth(rng.fork("s"));
  const pt = new PanTompkins();
  const state = (): HeartState => ({ rhythm, hr, episodeEnd: 1e9, respRate: 15 });
  const truth: Beat[] = [];
  const found: DetectedBeat[] = [];
  const block = new Float32Array(ECG_FS);
  for (let s = 0; s < seconds; s++) {
    gen.generate(s + 1.6, state, truth);
    synth.render(
      s,
      truth.filter((b) => b.t > s - 0.6 && b.t < s + 1.4),
      { condition: "clean", activity: 0.1, respRate: 15, fibrillation: rhythm === "af" },
      block,
    );
    found.push(...pt.processBlock(s, block));
  }
  return {
    truth: truth.filter((b) => b.t > 3 && b.t < seconds - 1),
    found: found.filter((b) => b.t > 3 && b.t < seconds - 1),
  };
}

describe("detector de QRS (Pan–Tompkins)", () => {
  it.each([
    ["sinus", 70],
    ["sinus", 120],
    ["af", 110],
    ["vt", 190],
  ] as const)("detecta los latidos en %s a %i lpm con sensibilidad y VPP ≥ 99 %%", (rhythm, hr) => {
    const { truth, found } = detect(rhythm, hr, 120);
    let tp = 0;
    for (const b of truth) if (found.some((f) => Math.abs(f.t - b.t) < 0.08)) tp++;
    expect(tp / truth.length).toBeGreaterThanOrEqual(0.99);
    expect(tp / found.length).toBeGreaterThanOrEqual(0.99);
  });

  it("mide el QRS ventricular bastante más ancho que el normal", () => {
    const narrow = detect("sinus", 70, 30).found.map((b) => b.qrsWidth);
    const wide = detect("vt", 170, 30).found.map((b) => b.qrsWidth);
    expect(Math.min(...wide)).toBeGreaterThan(2 * Math.max(...narrow));
  });
});

describe("clasificador TinyML", () => {
  const clf = new RhythmClassifier();

  it("es una red 10 → 16 → 5 con 261 parámetros que caben en menos de 1 KB", () => {
    expect(clf.parameterCount).toBe(261);
    expect(clf.weightBytes).toBeLessThan(1024);
  });

  it("los pesos están cuantizados a INT8", () => {
    for (const w of [...model.w1, ...model.w2]) {
      expect(Number.isInteger(w)).toBe(true);
      expect(Math.abs(w)).toBeLessThanOrEqual(127);
    }
  });

  it("acierta al menos el 95 % en un conjunto nuevo generado con otra semilla", () => {
    const data = generateDataset(40, 123456);
    let ok = 0;
    for (const d of data) if (clf.predict(d.features).cls === d.label) ok++;
    expect(ok / data.length).toBeGreaterThanOrEqual(0.95);
  });

  it("el entrenamiento registró una exactitud INT8 casi igual a la de coma flotante", () => {
    expect(model.meta.accuracyInt8).toBeGreaterThan(0.97);
    expect(Math.abs(model.meta.accuracyFloat - model.meta.accuracyInt8)).toBeLessThan(0.01);
    expect(model.meta.classes).toEqual([...RHYTHM_CLASSES]);
  });
});

describe("formatos binarios", () => {
  const vector: HourlyVector = {
    seq: 513,
    hourStart: 7200,
    hrMean: 71.3,
    hrMin: 58,
    hrMax: 97,
    rmssdMs: 31,
    sdnnMs: 44,
    classWindows: { normal: 440, af: 0, vt: 0, ectopy: 6, noise: 4 },
    pauseEvents: 0,
    bradyEvents: 0,
    respRate: 14.2,
    impedanceMean: 49.87,
    impedanceMin: 49.5,
    activity: 0.21,
    posture: 1,
    sqiMean: 0.97,
    temperature: 33.62,
    batteryPct: 87,
    rssiMean: -71,
    symptomPresses: 0,
    leadOffSeconds: 0,
    supineImpedanceCount: 0,
    flags: 0,
  };

  it("el vector horario ocupa 64 bytes y se decodifica igual", () => {
    const b = encodeVector(vector);
    expect(b.length).toBe(VECTOR_BYTES);
    const d = decodeVector(b);
    expect(d.hrMean).toBeCloseTo(71.3, 1);
    expect(d.impedanceMean).toBeCloseTo(49.87, 2);
    expect(d.classWindows).toEqual(vector.classWindows);
    expect(d.rssiMean).toBe(-71);
  });

  it("el CRC detecta un byte alterado", () => {
    const b = encodeVector(vector);
    b[9] ^= 0x40;
    expect(() => decodeVector(b)).toThrow(/CRC/);
  });

  it("la tira de 30 s ocupa 15 392 bytes y la alerta 24", () => {
    expect(STRIP_BYTES).toBe(15392);
    expect(encodeStrip(new Float32Array(7680), 0, 1, 1).length).toBe(15392);
    expect(
      encodeAlert({ seq: 1, code: "vt", alertClass: 1, detectedAt: 10, hr: 180, confidence: 0.9, sqi: 1 }).length,
    ).toBe(ALERT_BYTES);
  });
});

describe("energía y volumen de datos (apartado 4.3)", () => {
  it("las corrientes de la Tabla 6 suman 0,153 y 0,491 mA", () => {
    expect(totalCurrent(CURRENT_TABLE.edge)).toBeCloseTo(0.153, 3);
    expect(totalCurrent(CURRENT_TABLE.raw)).toBeCloseTo(0.491, 3);
  });

  it("la autonomía con 170 mAh útiles es de 46,3 y 14,4 días (ecuación 4)", () => {
    expect(Battery.autonomyDays(170, 0.153)).toBeCloseTo(46.3, 1);
    expect(Battery.autonomyDays(170, 0.491)).toBeCloseTo(14.4, 1);
    expect(new Battery(200, 0.85, 1, 100).usableMah).toBeCloseTo(170);
  });

  it("el flujo en bruto es de 6 064 bit/s, unos 65,5 MB al día (ecuación 1)", () => {
    expect(RAW_BITRATE).toBeCloseTo(6064, 0);
    expect(((RAW_BITRATE / 8) * 86400) / 1e6).toBeCloseTo(65.5, 1);
  });

  it("en el escenario optimizado el wearable envía unos 47,7 KB al día por BLE (ecuación 2)", () => {
    expect(24 * VECTOR_BYTES + 3 * STRIP_BYTES).toBe(47712);
  });
});

describe("reglas de actuación", () => {
  const features = (hr: number, sqi = 1): WindowFeatures => ({
    values: [hr, 0.3, 0.35, 0, 0, 0, 0, 0.07, 0, sqi],
    beatCount: Math.round((hr * 8) / 60),
    hr,
    sqi,
    longestGap: 0.4,
  });

  it("la taquiarritmia ventricular es crítica tras dos ventanas seguidas por encima del umbral", () => {
    const r = new RuleEngine({ vtHrThreshold: 150, afMinSeconds: 30, pauseSeconds: 4 });
    expect(r.onWindow(8, "vt", 0.99, features(180))).toEqual([]);
    const ev = r.onWindow(16, "vt", 0.99, features(180));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ code: "vt", alertClass: 1 });
    // No se repite mientras dura el mismo episodio.
    expect(r.onWindow(24, "vt", 0.99, features(180))).toEqual([]);
  });

  it("no avisa de TV con mala calidad de señal ni por debajo del umbral", () => {
    const r = new RuleEngine({ vtHrThreshold: 150, afMinSeconds: 30, pauseSeconds: 4 });
    r.onWindow(8, "vt", 0.9, features(140));
    expect(r.onWindow(16, "vt", 0.9, features(140))).toEqual([]);
    r.onWindow(24, "vt", 0.9, features(180, 0.2));
    expect(r.onWindow(32, "vt", 0.9, features(180, 0.2))).toEqual([]);
  });

  it("la FA genera alerta de clase 2 a los 32 s", () => {
    const r = new RuleEngine({ vtHrThreshold: 150, afMinSeconds: 30, pauseSeconds: 4 });
    const out = [8, 16, 24, 32].flatMap((t) => r.onWindow(t, "af", 0.95, features(100)));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: "af", alertClass: 2, t: 32 });
  });

  it("detecta una pausa de 4 s aunque la red no la clasifique", () => {
    const r = new RuleEngine({ vtHrThreshold: 150, afMinSeconds: 30, pauseSeconds: 4 });
    expect(r.onSecond(103, 100, false, false)).toEqual([]);
    const ev = r.onSecond(105, 100, false, false);
    expect(ev[0]).toMatchObject({ code: "pause", alertClass: 1, t: 104 });
  });

  it("no confunde un electrodo suelto con una pausa", () => {
    const r = new RuleEngine({ vtHrThreshold: 150, afMinSeconds: 30, pauseSeconds: 4 });
    expect(r.onSecond(110, 100, true, false)).toEqual([]);
    const later = r.onSecond(171, 100, true, false);
    expect(later[0]).toMatchObject({ code: "leadOff", alertClass: 3 });
  });
});
