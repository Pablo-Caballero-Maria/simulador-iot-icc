/**
 * Entrena la red de clasificación de ritmo del wearable y la cuantiza a INT8.
 *
 *   npm run train:classifier
 *
 * 1. Genera ventanas sintéticas etiquetadas con la misma cadena de procesado
 *    que usa la simulación (src/sim/wearable/dataset.ts).
 * 2. Entrena en coma flotante una red densa 10 → 16 → 5 con Adam y entropía
 *    cruzada.
 * 3. Cuantiza tras el entrenamiento: pesos int8 por neurona, entradas y capa
 *    oculta int8 con escala calibrada, sesgos int32.
 * 4. Evalúa en un conjunto de prueba independiente (otra semilla) en coma
 *    flotante y en INT8, y guarda el modelo en src/sim/wearable/rhythm-model.json.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Rng } from "../src/sim/core/rng";
import { RHYTHM_CLASSES } from "../src/sim/wearable/classes";
import type { QuantizedModel } from "../src/sim/wearable/classifier";
import { generateDataset, type LabeledWindow } from "../src/sim/wearable/dataset";
import { FEATURE_COUNT } from "../src/sim/wearable/features";

const HIDDEN = 16;
const OUTPUTS = RHYTHM_CLASSES.length;
const EPISODES_TRAIN = Number(process.env.EPISODES ?? 900);
const EPISODES_TEST = Math.round(EPISODES_TRAIN / 3);
const EPOCHS = 80;
const BATCH = 64;
const LR = 0.004;

interface FloatNet {
  w1: Float64Array; // HIDDEN × FEATURE_COUNT
  b1: Float64Array;
  w2: Float64Array; // OUTPUTS × HIDDEN
  b2: Float64Array;
}

function log(msg: string) {
  process.stdout.write(`${msg}\n`);
}

function standardize(data: LabeledWindow[]) {
  const mean = new Array(FEATURE_COUNT).fill(0);
  const std = new Array(FEATURE_COUNT).fill(0);
  for (const d of data) d.features.forEach((v, i) => (mean[i] += v / data.length));
  for (const d of data) d.features.forEach((v, i) => (std[i] += (v - mean[i]) ** 2 / data.length));
  return { mean, std: std.map((s) => Math.sqrt(s) || 1) };
}

function initNet(rng: Rng): FloatNet {
  const he = (fanIn: number) => Math.sqrt(2 / fanIn);
  const w1 = new Float64Array(HIDDEN * FEATURE_COUNT).map(() => rng.normal(0, he(FEATURE_COUNT)));
  const w2 = new Float64Array(OUTPUTS * HIDDEN).map(() => rng.normal(0, he(HIDDEN)));
  return { w1, b1: new Float64Array(HIDDEN), w2, b2: new Float64Array(OUTPUTS) };
}

function forward(net: FloatNet, x: number[]) {
  const h = new Float64Array(HIDDEN);
  for (let j = 0; j < HIDDEN; j++) {
    let s = net.b1[j];
    for (let i = 0; i < FEATURE_COUNT; i++) s += net.w1[j * FEATURE_COUNT + i] * x[i];
    h[j] = Math.max(0, s);
  }
  const logits = new Float64Array(OUTPUTS);
  for (let k = 0; k < OUTPUTS; k++) {
    let s = net.b2[k];
    for (let j = 0; j < HIDDEN; j++) s += net.w2[k * HIDDEN + j] * h[j];
    logits[k] = s;
  }
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return { h, probs: exps.map((e) => e / sum) };
}

function train(net: FloatNet, xs: number[][], ys: number[], rng: Rng) {
  const params = [net.w1, net.b1, net.w2, net.b2];
  const m = params.map((p) => new Float64Array(p.length));
  const v = params.map((p) => new Float64Array(p.length));
  let step = 0;
  const idx = xs.map((_, i) => i);
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    // Barajado de Fisher-Yates.
    for (let i = idx.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    let loss = 0;
    for (let start = 0; start < idx.length; start += BATCH) {
      const grads = params.map((p) => new Float64Array(p.length));
      const batch = idx.slice(start, start + BATCH);
      for (const n of batch) {
        const x = xs[n];
        const { h, probs } = forward(net, x);
        loss -= Math.log(Math.max(probs[ys[n]], 1e-12));
        const dLogits = probs.map((p, k) => p - (k === ys[n] ? 1 : 0));
        const dh = new Float64Array(HIDDEN);
        for (let k = 0; k < OUTPUTS; k++) {
          grads[3][k] += dLogits[k];
          for (let j = 0; j < HIDDEN; j++) {
            grads[2][k * HIDDEN + j] += dLogits[k] * h[j];
            dh[j] += dLogits[k] * net.w2[k * HIDDEN + j];
          }
        }
        for (let j = 0; j < HIDDEN; j++) {
          if (h[j] <= 0) continue;
          grads[1][j] += dh[j];
          for (let i = 0; i < FEATURE_COUNT; i++) grads[0][j * FEATURE_COUNT + i] += dh[j] * x[i];
        }
      }
      // Paso de Adam.
      step++;
      const lr = LR * (epoch < EPOCHS * 0.7 ? 1 : 0.3);
      params.forEach((p, pi) => {
        for (let q = 0; q < p.length; q++) {
          const g = grads[pi][q] / batch.length + (pi % 2 === 0 ? 1e-4 * p[q] : 0);
          m[pi][q] = 0.9 * m[pi][q] + 0.1 * g;
          v[pi][q] = 0.999 * v[pi][q] + 0.001 * g * g;
          const mh = m[pi][q] / (1 - 0.9 ** step);
          const vh = v[pi][q] / (1 - 0.999 ** step);
          p[q] -= (lr * mh) / (Math.sqrt(vh) + 1e-8);
        }
      });
    }
    if (epoch % 10 === 0 || epoch === EPOCHS - 1)
      log(`  época ${epoch}: pérdida media ${(loss / xs.length).toFixed(4)}`);
  }
}

function quantize(net: FloatNet, calib: number[][], mean: number[], std: number[]): QuantizedModel {
  // Escala de entrada: percentil 99,9 del valor absoluto de las entradas normalizadas.
  const absIn = calib.flatMap((x) => x.map(Math.abs)).sort((a, b) => a - b);
  const inputScale = absIn[Math.floor(absIn.length * 0.999)] / 127;
  const w1Scale: number[] = [];
  const w1: number[] = [];
  for (let j = 0; j < HIDDEN; j++) {
    const row = Array.from(net.w1.slice(j * FEATURE_COUNT, (j + 1) * FEATURE_COUNT));
    const s = Math.max(...row.map(Math.abs)) / 127 || 1e-6;
    w1Scale.push(s);
    w1.push(...row.map((w) => Math.round(w / s)));
  }
  const b1 = Array.from(net.b1, (b, j) => Math.round(b / (inputScale * w1Scale[j])));
  // Escala de la capa oculta calibrada con las activaciones reales.
  const hiddenVals = calib.flatMap((x) => Array.from(forward(net, x).h)).sort((a, b) => a - b);
  const hiddenScale = hiddenVals[Math.floor(hiddenVals.length * 0.999)] / 127 || 1e-6;
  const w2Scale: number[] = [];
  const w2: number[] = [];
  for (let k = 0; k < OUTPUTS; k++) {
    const row = Array.from(net.w2.slice(k * HIDDEN, (k + 1) * HIDDEN));
    const s = Math.max(...row.map(Math.abs)) / 127 || 1e-6;
    w2Scale.push(s);
    w2.push(...row.map((w) => Math.round(w / s)));
  }
  const b2 = Array.from(net.b2, (b, k) => Math.round(b / (hiddenScale * w2Scale[k])));
  return {
    version: 1,
    inputs: FEATURE_COUNT,
    hidden: HIDDEN,
    outputs: OUTPUTS,
    inputMean: mean.map((v) => +v.toPrecision(6)),
    inputStd: std.map((v) => +v.toPrecision(6)),
    inputScale: +inputScale.toPrecision(6),
    w1,
    w1Scale: w1Scale.map((v) => +v.toPrecision(6)),
    b1,
    hiddenScale: +hiddenScale.toPrecision(6),
    w2,
    w2Scale: w2Scale.map((v) => +v.toPrecision(6)),
    b2,
    meta: {},
  };
}

async function main() {
  const t0 = Date.now();
  log(`Generando ${EPISODES_TRAIN} episodios por clase para entrenamiento…`);
  const trainSet = generateDataset(EPISODES_TRAIN, 2026);
  log(`Generando ${EPISODES_TEST} episodios por clase para prueba (otra semilla)…`);
  const testSet = generateDataset(EPISODES_TEST, 9091);
  log(
    `  ${trainSet.length} ventanas de entrenamiento, ${testSet.length} de prueba (${((Date.now() - t0) / 1000).toFixed(1)} s)`,
  );

  const { mean, std } = standardize(trainSet);
  const norm = (f: number[]) => f.map((v, i) => (v - mean[i]) / std[i]);
  const xs = trainSet.map((d) => norm(d.features));
  const ys = trainSet.map((d) => RHYTHM_CLASSES.indexOf(d.label));

  const rng = new Rng(7);
  const net = initNet(rng);
  log("Entrenando…");
  train(net, xs, ys, rng);

  const model = quantize(net, xs, mean, std);
  // Evaluación en coma flotante y en INT8 con la clase de inferencia real.
  const { RhythmClassifier } = await import("../src/sim/wearable/classifier");
  const clf = new RhythmClassifier(model);
  const confusion = RHYTHM_CLASSES.map(() => RHYTHM_CLASSES.map(() => 0));
  let okFloat = 0;
  let okInt8 = 0;
  for (const d of testSet) {
    const truth = RHYTHM_CLASSES.indexOf(d.label);
    const pf = forward(net, norm(d.features)).probs;
    const predFloat = pf.indexOf(Math.max(...pf));
    const predInt8 = RHYTHM_CLASSES.indexOf(clf.predict(d.features).cls);
    if (predFloat === truth) okFloat++;
    if (predInt8 === truth) okInt8++;
    confusion[truth][predInt8]++;
  }
  const accFloat = okFloat / testSet.length;
  const accInt8 = okInt8 / testSet.length;
  const perClass = Object.fromEntries(
    RHYTHM_CLASSES.map((c, i) => {
      const tp = confusion[i][i];
      const fn = confusion[i].reduce((a, b) => a + b, 0) - tp;
      const fp = confusion.reduce((a, row) => a + row[i], 0) - tp;
      return [c, { sensitivity: +(tp / (tp + fn)).toFixed(4), ppv: +(tp / Math.max(tp + fp, 1)).toFixed(4) }];
    }),
  );
  model.meta = {
    generatedBy: "scripts/train-classifier.ts",
    trainWindows: trainSet.length,
    testWindows: testSet.length,
    accuracyFloat: +accFloat.toFixed(4),
    accuracyInt8: +accInt8.toFixed(4),
    perClass,
    confusion,
    classes: RHYTHM_CLASSES,
  };
  const out = join(import.meta.dirname, "../src/sim/wearable/rhythm-model.json");
  writeFileSync(out, `${JSON.stringify(model, null, 2)}\n`);
  log(`Exactitud en prueba: ${(accFloat * 100).toFixed(2)} % (float) · ${(accInt8 * 100).toFixed(2)} % (INT8)`);
  log(`Por clase (INT8): ${JSON.stringify(perClass)}`);
  log(`Matriz de confusión (filas = verdad): ${JSON.stringify(confusion)}`);
  log(`Modelo guardado en ${out} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

void main();
