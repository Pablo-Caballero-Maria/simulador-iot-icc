/**
 * Generador de ventanas etiquetadas para entrenar y evaluar el clasificador.
 *
 * Cada muestra procede de un episodio sintético (ritmo, frecuencia,
 * actividad y calidad de señal al azar) procesado con exactamente la misma
 * cadena que usa el wearable en la simulación. En el producto real el
 * entrenamiento se haría con bases de PhysioNet y registros del propio
 * parche; aquí sirve para que la red funcione sobre la señal simulada.
 */
import { Rng } from "../core/rng";
import { ECG_FS, type EcgContext } from "../physiology/ecg";
import { BeatGenerator, type Beat, type HeartState, type Rhythm, type SignalCondition } from "../physiology/rhythm";
import { RHYTHM_CLASSES, type RhythmClass } from "./classes";
import { WINDOW_SECONDS } from "./features";
import { BeatFrontEnd, SignalFrontEnd, WindowAnalyzer, type FrontEnd } from "./frontend";

export interface LabeledWindow {
  features: number[];
  label: RhythmClass;
  path: "signal" | "beat";
}

interface EpisodeSpec {
  rhythm: Rhythm;
  hr: number;
  condition: SignalCondition;
  activity: number;
}

function sampleEpisode(cls: RhythmClass, rng: Rng): EpisodeSpec {
  switch (cls) {
    case "normal":
      return rng.chance(0.15)
        ? { rhythm: "brady", hr: rng.uniform(28, 45), condition: "clean", activity: rng.uniform(0, 0.3) }
        : { rhythm: "sinus", hr: rng.uniform(45, 130), condition: "clean", activity: rng.uniform(0, 0.85) };
    case "af":
      return { rhythm: "af", hr: rng.uniform(70, 160), condition: "clean", activity: rng.uniform(0, 0.6) };
    case "vt":
      return { rhythm: "vt", hr: rng.uniform(125, 230), condition: "clean", activity: rng.uniform(0, 0.3) };
    case "ectopy":
      return { rhythm: "ectopy", hr: rng.uniform(55, 100), condition: "clean", activity: rng.uniform(0, 0.5) };
    case "noise":
      return {
        rhythm: rng.chance(0.7) ? "sinus" : "af",
        hr: rng.uniform(55, 110),
        condition: rng.chance(0.8) ? "noisy" : "lead-off",
        activity: rng.uniform(0.4, 1),
      };
  }
}

/**
 * Simula un episodio de `windows + 1` ventanas (la primera calienta el
 * detector) y devuelve los rasgos de las restantes.
 */
function simulateEpisode(
  spec: EpisodeSpec,
  path: "signal" | "beat",
  rng: Rng,
  windows: number,
): { features: number[]; ventricularBeats: number }[] {
  const gen = new BeatGenerator(rng.fork("beats"), -1);
  const fe: FrontEnd = path === "signal" ? new SignalFrontEnd(rng.fork("sig"), 0) : new BeatFrontEnd(rng.fork("beat"));
  const analyzer = new WindowAnalyzer(fe);
  const respRate = rng.uniform(10, 24);
  const state = (): HeartState => ({ rhythm: spec.rhythm, hr: spec.hr, episodeEnd: 1e9, respRate });
  const ctx: EcgContext = {
    condition: spec.condition,
    activity: spec.activity,
    respRate,
    fibrillation: spec.rhythm === "af",
  };
  const beats: Beat[] = [];
  const out: { features: number[]; ventricularBeats: number }[] = [];
  const total = (windows + 1) * WINDOW_SECONDS;
  for (let sec = 0; sec < total; sec++) {
    gen.generate(sec + 1.6, state, beats);
    const relevant = beats.filter((b) => b.t > sec - 0.6 && b.t < sec + 1.4);
    analyzer.feedSecond({ t0: sec, beats: relevant, ctx });
    if ((sec + 1) % WINDOW_SECONDS === 0) {
      const start = sec + 1 - WINDOW_SECONDS;
      const f = analyzer.closeWindow(start, sec + 1);
      const ventricularBeats = beats.filter((b) => b.morph === "V" && b.t >= start && b.t < sec + 1).length;
      if (sec + 1 > WINDOW_SECONDS) out.push({ features: f.values, ventricularBeats });
    }
  }
  return out;
}

/**
 * Genera `episodesPerClass` episodios por clase (3 ventanas cada uno),
 * alternando la ruta de señal y la de latido.
 */
export function generateDataset(episodesPerClass: number, seed: number): LabeledWindow[] {
  const rng = new Rng(seed);
  const data: LabeledWindow[] = [];
  for (const label of RHYTHM_CLASSES) {
    for (let e = 0; e < episodesPerClass; e++) {
      const path = e % 2 === 0 ? "signal" : "beat";
      const spec = sampleEpisode(label, rng);
      for (const w of simulateEpisode(spec, path, rng.fork(`${label}-${e}`), 3)) {
        // La etiqueta describe el contenido de la ventana: en el ritmo con
        // extrasístoles, una ventana sin ningún latido ventricular es normal.
        const windowLabel = label === "ectopy" && w.ventricularBeats === 0 ? "normal" : label;
        data.push({ features: w.features, label: windowLabel, path });
      }
    }
  }
  return data;
}

/** Muestras por segundo de la ruta de señal (para estimar el coste). */
export const SIGNAL_SAMPLES_PER_SECOND = ECG_FS;
