"use client";
/**
 * Estado de la interfaz (zustand) y controlador que ejecuta la simulación en
 * el navegador.
 *
 * El motor (src/sim) es TypeScript puro; aquí se decide cuánto avanzarlo en
 * cada fotograma según la velocidad elegida, con un presupuesto de tiempo de
 * CPU para no bloquear la página, y se publica una «foto» del estado unas
 * ocho veces por segundo para los paneles. La escena 3D lee el motor
 * directamente en cada fotograma.
 */
import { create } from "zustand";
import { DEFAULT_PARAMS, type SimParams, cloneParams } from "@/sim/params";
import { type ScenarioId, createScenario, getScenario, scenarioParams } from "@/sim/scenarios";
import type { SimSnapshot, Simulation } from "@/sim/simulation";
import type { Narration, NodeId, Transmission } from "@/sim/types";

/** Velocidades disponibles (× tiempo real). */
export const SPEEDS = [1, 5, 30, 300, 3600, 21600] as const;

export const SPEED_LABELS: Record<number, string> = {
  1: "1×",
  5: "5×",
  30: "30×",
  300: "5 min/s",
  3600: "1 h/s",
  21600: "6 h/s",
};

/** Paquete que se anima en la escena 3D (con duración en tiempo real). */
export interface VisualPacket {
  id: number;
  tx: Transmission;
  /** Instante real (performance.now) de inicio y duración de la animación, ms. */
  start: number;
  duration: number;
}

interface SimState {
  sim: Simulation | null;
  snapshot: SimSnapshot | null;
  narrations: Narration[];
  log: Transmission[];
  playing: boolean;
  speed: number;
  /** Velocidad que realmente se consigue (si la CPU no da abasto, es menor). */
  effectiveSpeed: number;
  scenarioId: ScenarioId;
  baseParams: SimParams;
  selectedNode: NodeId | null;
  cameraPreset: CameraPreset;
  /** Panel lateral abierto (solo uno a la vez) o ninguno. */
  panel: PanelId | null;
  version: number;
  // Acciones
  load: (scenarioId: ScenarioId, base?: SimParams) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setParam: (group: keyof SimParams, key: string, value: unknown, restart?: boolean) => void;
  selectNode: (node: NodeId | null) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  /** Abre un panel; si ya estaba abierto, lo cierra. */
  togglePanel: (panel: PanelId | null) => void;
  refresh: () => void;
}

export type CameraPreset = "general" | "casa" | "paciente" | "red" | "hospital";

/** Paneles de información que se abren bajo demanda. */
export type PanelId = "explicacion" | "parametros" | "acciones" | "estadisticas" | "mensajes" | "consola";

/** Parámetros que exigen reiniciar la simulación al cambiarlos. */
const RESTART_KEYS = new Set([
  "wearable.mode",
  "wearable.batteryCapacityMah",
  "wearable.batteryHealth",
  "wearable.initialSocPct",
  "wearable.dailyStrip",
  "station.stationId",
  "station.rawUploadPeriodS",
]);

export function needsRestart(group: string, key: string): boolean {
  return RESTART_KEYS.has(`${group}.${key}`);
}

/** Paquetes en vuelo para la escena (fuera de zustand: cambian en cada fotograma). */
export const packetQueue: VisualPacket[] = [];
let packetId = 0;
let unsubscribers: (() => void)[] = [];

function attach(sim: Simulation, get: () => SimState) {
  for (const u of unsubscribers) u();
  packetQueue.length = 0;
  unsubscribers = [
    sim.bus.on("transmission", (tx) => {
      const speed = get().speed;
      const now = performance.now();
      // Duración visible: la real a la velocidad actual, entre 0,6 y 2,5 s.
      const duration = Math.min(2500, Math.max(600, ((tx.tEnd - tx.tStart) * 1000) / speed));
      // A velocidades altas se limita el número de paquetes simultáneos.
      if (packetQueue.length > 60) packetQueue.splice(0, packetQueue.length - 60);
      packetQueue.push({
        id: ++packetId,
        tx,
        start: now + Math.max(0, ((tx.tStart - sim.now) * 1000) / speed),
        duration,
      });
    }),
  ];
}

export const useSimStore = create<SimState>((set, get) => ({
  sim: null,
  snapshot: null,
  narrations: [],
  log: [],
  playing: false,
  speed: 5,
  effectiveSpeed: 0,
  scenarioId: "vt",
  baseParams: cloneParams(DEFAULT_PARAMS),
  selectedNode: null,
  cameraPreset: "general",
  panel: null,
  version: 0,

  load: (scenarioId, base) => {
    const baseParams = base ?? get().baseParams;
    const sim = createScenario(scenarioId, baseParams);
    const scenario = getScenario(scenarioId);
    attach(sim, get);
    sim.adaptFidelity(scenario.speed);
    set({
      sim,
      scenarioId,
      baseParams,
      speed: scenario.speed,
      snapshot: sim.snapshot(),
      narrations: [...sim.narrations].reverse(),
      log: [...sim.transmissions].reverse(),
      version: get().version + 1,
    });
  },

  setPlaying: (playing) => set({ playing }),

  setSpeed: (speed) => {
    get().sim?.adaptFidelity(speed);
    set({ speed });
  },

  setParam: (group, key, value, restart) => {
    const { sim, scenarioId } = get();
    const baseParams = cloneParams(get().baseParams);
    (baseParams[group] as Record<string, unknown>)[key] = value;
    if (restart || !sim) {
      set({ baseParams });
      get().load(scenarioId, baseParams);
      return;
    }
    (sim.params[group] as Record<string, unknown>)[key] = value;
    if (group === "wearable" && key === "fidelity") sim.adaptFidelity(get().speed);
    set({ baseParams, snapshot: sim.snapshot() });
  },

  selectNode: (selectedNode) => set({ selectedNode }),
  setCameraPreset: (cameraPreset) => set({ cameraPreset }),
  togglePanel: (panel) => set({ panel: panel !== null && get().panel === panel ? null : panel }),

  refresh: () => {
    const sim = get().sim;
    if (!sim) return;
    set({
      snapshot: sim.snapshot(),
      narrations: [...sim.narrations].reverse().slice(0, 120),
      log: [...sim.transmissions].reverse().slice(0, 150),
    });
  },
}));

/** Parámetros efectivos del escenario actual (para mostrar en los controles). */
export function currentParams(): SimParams {
  const { sim, baseParams, scenarioId } = useSimStore.getState();
  return sim?.params ?? scenarioParams(scenarioId, baseParams);
}

/**
 * Bucle de simulación: avanza el motor en cada fotograma. Devuelve una
 * función para detenerlo.
 */
export function startSimulationLoop(): () => void {
  let raf = 0;
  let last = performance.now();
  let lastRefresh = 0;
  let simAdvanced = 0;
  let realElapsed = 0;
  const frame = (now: number) => {
    const state = useSimStore.getState();
    const dtReal = Math.min(0.25, (now - last) / 1000);
    last = now;
    const sim = state.sim;
    if (sim && state.playing) {
      const target = dtReal * state.speed;
      // Presupuesto de 10 ms de CPU por fotograma; si no alcanza, la velocidad efectiva baja.
      const t0 = performance.now();
      let done = 0;
      const step = Math.max(1, Math.min(target, 600));
      while (done < target && performance.now() - t0 < 10) {
        const dt = Math.min(step, target - done);
        sim.advance(dt);
        done += dt;
      }
      simAdvanced += done;
      realElapsed += dtReal;
    }
    if (now - lastRefresh > 125) {
      lastRefresh = now;
      state.refresh();
      if (realElapsed > 0.5) {
        useSimStore.setState({ effectiveSpeed: simAdvanced / realElapsed });
        simAdvanced = 0;
        realElapsed = 0;
      }
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
