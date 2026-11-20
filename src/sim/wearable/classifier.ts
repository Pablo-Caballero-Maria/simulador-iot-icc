/**
 * Clasificador de ritmo del wearable (TinyML).
 *
 * Red neuronal densa 10 → 16 → 5 cuantizada a INT8 tras el entrenamiento,
 * con la misma aritmética entera que usaría TensorFlow Lite Micro en el
 * microcontrolador: entradas y pesos de 8 bit, acumuladores de 32 bit y
 * recuantización entre capas. Los pesos los genera
 * `scripts/train-classifier.ts` a partir de ventanas sintéticas.
 */
import modelJson from "./rhythm-model.json";
import { RHYTHM_CLASSES, type RhythmClass } from "./classes";
import { FEATURE_COUNT } from "./features";

export { CLASS_LABELS, RHYTHM_CLASSES, type RhythmClass } from "./classes";

/** Modelo cuantizado tal como se guarda en JSON. */
export interface QuantizedModel {
  version: number;
  inputs: number;
  hidden: number;
  outputs: number;
  inputMean: number[];
  inputStd: number[];
  inputScale: number;
  /** Pesos de la capa oculta, int8, fila por neurona (hidden × inputs). */
  w1: number[];
  /** Escala por neurona de w1. */
  w1Scale: number[];
  /** Sesgos de la capa oculta, int32 en escala inputScale·w1Scale. */
  b1: number[];
  hiddenScale: number;
  w2: number[];
  w2Scale: number[];
  b2: number[];
  /** Métricas de entrenamiento (informativas). */
  meta: Record<string, unknown>;
}

export interface Prediction {
  cls: RhythmClass;
  /** Probabilidades (softmax de las salidas descuantizadas). */
  probs: number[];
  confidence: number;
}

const clampInt8 = (v: number) => (v > 127 ? 127 : v < -127 ? -127 : v);

/** Inferencia entera de la red cuantizada. */
export class RhythmClassifier {
  private readonly hq: Int32Array;
  private readonly xq: Int32Array;

  constructor(private readonly model: QuantizedModel = modelJson as QuantizedModel) {
    if (model.inputs !== FEATURE_COUNT) throw new Error("El modelo no coincide con el número de rasgos");
    this.hq = new Int32Array(model.hidden);
    this.xq = new Int32Array(model.inputs);
  }

  /** Número de parámetros (pesos y sesgos). */
  get parameterCount(): number {
    const m = this.model;
    return m.inputs * m.hidden + m.hidden + m.hidden * m.outputs + m.outputs;
  }

  /** Memoria de los pesos en el microcontrolador (int8 + sesgos int32), bytes. */
  get weightBytes(): number {
    const m = this.model;
    return m.w1.length + m.w2.length + 4 * (m.b1.length + m.b2.length);
  }

  get meta(): Record<string, unknown> {
    return this.model.meta;
  }

  predict(features: readonly number[]): Prediction {
    const m = this.model;
    // 1. Normalización y cuantización de la entrada.
    for (let i = 0; i < m.inputs; i++) {
      const z = (features[i] - m.inputMean[i]) / m.inputStd[i];
      this.xq[i] = clampInt8(Math.round(z / m.inputScale));
    }
    // 2. Capa oculta: acumulador int32, ReLU y recuantización a int8.
    for (let j = 0; j < m.hidden; j++) {
      let acc = m.b1[j];
      const row = j * m.inputs;
      for (let i = 0; i < m.inputs; i++) acc += m.w1[row + i] * this.xq[i];
      const real = acc * m.inputScale * m.w1Scale[j];
      this.hq[j] = real > 0 ? clampInt8(Math.round(real / m.hiddenScale)) : 0;
    }
    // 3. Capa de salida y softmax.
    const logits: number[] = [];
    for (let k = 0; k < m.outputs; k++) {
      let acc = m.b2[k];
      const row = k * m.hidden;
      for (let j = 0; j < m.hidden; j++) acc += m.w2[row + j] * this.hq[j];
      logits.push(acc * m.hiddenScale * m.w2Scale[k]);
    }
    const max = Math.max(...logits);
    const exps = logits.map((l) => Math.exp(l - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map((e) => e / sum);
    let best = 0;
    for (let k = 1; k < probs.length; k++) if (probs[k] > probs[best]) best = k;
    return { cls: RHYTHM_CLASSES[best], probs, confidence: probs[best] };
  }
}
