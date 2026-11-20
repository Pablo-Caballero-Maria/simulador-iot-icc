/**
 * Geometría del domicilio, compartida por la simulación (alcance BLE, recorridos
 * del paciente) y por la escena 3D, de modo que lo que se ve es exactamente lo
 * que se calcula. Coordenadas en metros sobre el plano del suelo (x, z).
 */

export interface Vec2 {
  x: number;
  z: number;
}

export type RoomId = "salon" | "cocina" | "dormitorio" | "pasillo" | "bano" | "jardin" | "calle";

export interface Room {
  id: RoomId;
  name: string;
  /** Rectángulo [x0, x1] × [z0, z1]. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Pérdida adicional fuera de casa (edificios, vegetación), dB. */
  extraLossDb: number;
  indoor: boolean;
}

export const ROOMS: Record<RoomId, Room> = {
  salon: { id: "salon", name: "Salón", x0: -6, x1: 1, z0: -4.5, z1: 0, extraLossDb: 0, indoor: true },
  cocina: { id: "cocina", name: "Cocina", x0: 1, x1: 6, z0: -4.5, z1: 0, extraLossDb: 0, indoor: true },
  dormitorio: {
    id: "dormitorio",
    name: "Dormitorio",
    x0: -6,
    x1: -0.5,
    z0: 0,
    z1: 4.5,
    extraLossDb: 0,
    indoor: true,
  },
  pasillo: { id: "pasillo", name: "Pasillo", x0: -0.5, x1: 2.5, z0: 0, z1: 4.5, extraLossDb: 0, indoor: true },
  bano: { id: "bano", name: "Baño", x0: 2.5, x1: 6, z0: 0, z1: 4.5, extraLossDb: 0, indoor: true },
  jardin: { id: "jardin", name: "Jardín", x0: -6, x1: 6, z0: 4.5, z1: 10, extraLossDb: 0, indoor: false },
  calle: { id: "calle", name: "Paseo por el barrio", x0: 14, x1: 40, z0: 8, z1: 22, extraLossDb: 25, indoor: false },
};

/** Puertas: unen dos estancias y sirven de punto de paso en los recorridos. */
export const DOORS: { a: RoomId; b: RoomId; at: Vec2 }[] = [
  { a: "salon", b: "cocina", at: { x: 1, z: -1.6 } },
  { a: "salon", b: "pasillo", at: { x: 0.4, z: 0 } },
  { a: "pasillo", b: "dormitorio", at: { x: -0.5, z: 2.6 } },
  { a: "pasillo", b: "bano", at: { x: 2.5, z: 3.0 } },
  { a: "pasillo", b: "jardin", at: { x: 1.0, z: 4.5 } },
  { a: "jardin", b: "calle", at: { x: 6, z: 9 } },
];

export interface Wall {
  a: Vec2;
  b: Vec2;
  exterior: boolean;
}

const DOOR_WIDTH = 0.9;

/** Tabiques y muros de la casa, con huecos en las puertas. */
export const WALLS: Wall[] = buildWalls();

function buildWalls(): Wall[] {
  // Segmentos completos (antes de abrir las puertas).
  const raw: Wall[] = [
    // Muros exteriores
    { a: { x: -6, z: -4.5 }, b: { x: 6, z: -4.5 }, exterior: true },
    { a: { x: 6, z: -4.5 }, b: { x: 6, z: 4.5 }, exterior: true },
    { a: { x: 6, z: 4.5 }, b: { x: -6, z: 4.5 }, exterior: true },
    { a: { x: -6, z: 4.5 }, b: { x: -6, z: -4.5 }, exterior: true },
    // Tabiques interiores
    { a: { x: -6, z: 0 }, b: { x: 6, z: 0 }, exterior: false },
    { a: { x: 1, z: -4.5 }, b: { x: 1, z: 0 }, exterior: false },
    { a: { x: -0.5, z: 0 }, b: { x: -0.5, z: 4.5 }, exterior: false },
    { a: { x: 2.5, z: 0 }, b: { x: 2.5, z: 4.5 }, exterior: false },
  ];
  const doorPoints = DOORS.filter((d) => ROOMS[d.a].indoor || ROOMS[d.b].indoor).map((d) => d.at);
  const out: Wall[] = [];
  for (const w of raw) {
    let pieces: Wall[] = [w];
    for (const p of doorPoints) {
      pieces = pieces.flatMap((seg) => cutGap(seg, p));
    }
    out.push(...pieces);
  }
  return out;
}

/** Corta un hueco de puerta centrado en `p` si `p` está sobre el segmento. */
function cutGap(w: Wall, p: Vec2): Wall[] {
  const horizontal = w.a.z === w.b.z;
  if (horizontal && Math.abs(p.z - w.a.z) < 1e-6) {
    const [lo, hi] = [Math.min(w.a.x, w.b.x), Math.max(w.a.x, w.b.x)];
    if (p.x <= lo || p.x >= hi) return [w];
    const parts: Wall[] = [];
    if (p.x - DOOR_WIDTH / 2 > lo)
      parts.push({ a: { x: lo, z: w.a.z }, b: { x: p.x - DOOR_WIDTH / 2, z: w.a.z }, exterior: w.exterior });
    if (p.x + DOOR_WIDTH / 2 < hi)
      parts.push({ a: { x: p.x + DOOR_WIDTH / 2, z: w.a.z }, b: { x: hi, z: w.a.z }, exterior: w.exterior });
    return parts;
  }
  if (!horizontal && Math.abs(p.x - w.a.x) < 1e-6) {
    const [lo, hi] = [Math.min(w.a.z, w.b.z), Math.max(w.a.z, w.b.z)];
    if (p.z <= lo || p.z >= hi) return [w];
    const parts: Wall[] = [];
    if (p.z - DOOR_WIDTH / 2 > lo)
      parts.push({ a: { x: w.a.x, z: lo }, b: { x: w.a.x, z: p.z - DOOR_WIDTH / 2 }, exterior: w.exterior });
    if (p.z + DOOR_WIDTH / 2 < hi)
      parts.push({ a: { x: w.a.x, z: p.z + DOOR_WIDTH / 2 }, b: { x: w.a.x, z: hi }, exterior: w.exterior });
    return parts;
  }
  return [w];
}

/** Puntos de interés del domicilio. */
export const SPOTS = {
  station: { x: -1.3, z: -4.0 },
  stationFront: { x: -1.3, z: -3.3 },
  scale: { x: 4.8, z: 3.7 },
  bed: { x: -3.9, z: 2.9 },
  sofa: { x: -4.2, z: -1.6 },
  kitchenTable: { x: 3.6, z: -2.3 },
  hallway: { x: 1.0, z: 2.0 },
  garden: { x: 0, z: 7.5 },
  street: { x: 30, z: 15 },
} satisfies Record<string, Vec2>;

export type SpotId = keyof typeof SPOTS;

/** Estancia que contiene un punto (o «jardin» si está fuera de la casa y cerca). */
export function roomAt(p: Vec2): RoomId {
  for (const room of Object.values(ROOMS)) {
    if (room.indoor && p.x >= room.x0 && p.x <= room.x1 && p.z >= room.z0 && p.z <= room.z1) return room.id;
  }
  const street = ROOMS.calle;
  if (p.x >= street.x0 && p.x <= street.x1 && p.z >= street.z0 && p.z <= street.z1) return "calle";
  return "jardin";
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Número de muros que atraviesa la línea recta entre dos puntos. */
export function wallsBetween(a: Vec2, b: Vec2): number {
  let n = 0;
  for (const w of WALLS) if (segmentsIntersect(a, b, w.a, w.b)) n++;
  return n;
}

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
}

function segmentsIntersect(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): boolean {
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Recorrido entre dos puntos pasando por las puertas (búsqueda en anchura en
 * el grafo de estancias). Devuelve la lista de puntos, incluido el destino.
 */
export function pathBetween(from: Vec2, to: Vec2): Vec2[] {
  const start = roomAt(from);
  const goal = roomAt(to);
  if (start === goal) return [to];
  const prev = new Map<RoomId, { room: RoomId; door: Vec2 }>();
  const queue: RoomId[] = [start];
  const seen = new Set<RoomId>([start]);
  while (queue.length > 0) {
    const r = queue.shift()!;
    if (r === goal) break;
    for (const d of DOORS) {
      const next = d.a === r ? d.b : d.b === r ? d.a : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        prev.set(next, { room: r, door: d.at });
        queue.push(next);
      }
    }
  }
  const waypoints: Vec2[] = [to];
  let cur: RoomId = goal;
  while (cur !== start) {
    const step = prev.get(cur);
    if (!step) return [to]; // sin camino: se va en línea recta
    waypoints.unshift(step.door);
    cur = step.room;
  }
  return waypoints;
}
