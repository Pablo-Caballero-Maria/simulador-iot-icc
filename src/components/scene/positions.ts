/**
 * Posiciones de los nodos en la escena (metros). La casa usa exactamente la
 * geometría de la simulación (src/sim/physiology/home.ts); el resto de la
 * infraestructura se acerca para que quepa en pantalla.
 */
import { SPOTS } from "@/sim/physiology/home";
import type { LinkId, NodeId } from "@/sim/types";

export type V3 = [number, number, number];

export const STATION_POS: V3 = [SPOTS.station.x, 0.95, SPOTS.station.z];
export const DISPENSER_POS: V3 = [SPOTS.station.x + 0.55, 0.95, SPOTS.station.z];
export const SCALE_POS: V3 = [SPOTS.scale.x, 0.08, SPOTS.scale.z];
export const TOWER_BASE: V3 = [24, 0, -16];
export const TOWER_TOP: V3 = [24, 21, -16];
export const CLOUD_POS: V3 = [46, 20, -6];
export const HOSPITAL_POS: V3 = [42, 0, 24];
export const HOSPITAL_ROOF: V3 = [42, 8, 24];
/** Recorrido de la ambulancia: del hospital a la puerta de la casa. */
export const AMBULANCE_ROUTE: V3[] = [
  [34, 0, 19],
  [34, 0, 13],
  [3, 0, 13],
];

/** Posición de un nodo fijo (el wearable se resuelve aparte, porque se mueve). */
export function nodePosition(node: Exclude<NodeId, "wearable" | "ambulance">): V3 {
  switch (node) {
    case "station":
      return STATION_POS;
    case "dispenser":
      return DISPENSER_POS;
    case "scale":
      return SCALE_POS;
    case "tower":
      return TOWER_TOP;
    case "cloud":
      return CLOUD_POS;
    case "hospital":
      return HOSPITAL_ROOF;
  }
}

/**
 * Recorrido que sigue un paquete según el enlace. `wearable` es la posición
 * actual del paciente.
 */
export function packetPath(link: LinkId, from: NodeId, to: NodeId, wearable: V3): V3[] {
  const pos = (n: NodeId): V3 =>
    n === "wearable" ? wearable : n === "ambulance" ? AMBULANCE_ROUTE[AMBULANCE_ROUTE.length - 1] : nodePosition(n);
  switch (link) {
    case "lte-m":
    case "nb-iot":
      return from === "station" ? [STATION_POS, TOWER_TOP, CLOUD_POS] : [CLOUD_POS, TOWER_TOP, STATION_POS];
    case "sms":
      return [STATION_POS, TOWER_TOP, HOSPITAL_ROOF];
    default:
      return [pos(from), pos(to)];
  }
}

/** Punto a una fracción `f` (0–1) de la longitud de un recorrido. */
export function pointAlong(path: V3[], f: number): V3 {
  if (path.length === 1) return path[0];
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]);
    lengths.push(d);
    total += d;
  }
  let target = Math.min(Math.max(f, 0), 1) * total;
  for (let i = 1; i < path.length; i++) {
    const seg = lengths[i - 1];
    if (target <= seg || i === path.length - 1) {
      const k = seg > 0 ? Math.min(target / seg, 1) : 1;
      const a = path[i - 1];
      const b = path[i];
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
    target -= seg;
  }
  return path[path.length - 1];
}

/** Puntos de vista de la cámara: posición y punto al que mira. */
export const CAMERA_PRESETS = {
  general: { position: [-14, 34, 58] as V3, target: [21, 6, 3] as V3 },
  casa: { position: [-8, 13, 13] as V3, target: [0, 0, 0] as V3 },
  paciente: { position: [-4, 6, 6] as V3, target: [-2, 0.8, -1] as V3 },
  red: { position: [6, 26, 26] as V3, target: [30, 12, -8] as V3 },
  hospital: { position: [18, 16, 44] as V3, target: [36, 4, 20] as V3 },
} as const;
