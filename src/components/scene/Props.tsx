"use client";
/**
 * Elementos de decorado de la escena, en estilo low-poly y con formas simples para que la escena
 * siga siendo ligera: árboles, farolas, bancos, coches, casas vecinas, vallas, macetas… Los que se
 * repiten muchas veces (árboles, farolas, ventanas, marcas viales) se dibujan con instancias:
 * una sola llamada de dibujo por tipo, se pongan cuantos se pongan.
 */
import { Instance, Instances } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import type { MeshStandardMaterial } from "three";
import { streetLights } from "@/lib/daylight";
import { useSimStore } from "@/lib/sim-store";
import type { V3 } from "./positions";

/** Una caja con su material: la pieza básica de casi todo. */
export function Box({
  p,
  s,
  c,
  rotY = 0,
  emissive,
  shadow = true,
}: {
  p: V3;
  s: V3;
  c: string;
  rotY?: number;
  emissive?: string;
  shadow?: boolean;
}) {
  return (
    <mesh position={p} rotation-y={rotY} castShadow={shadow} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} emissive={emissive ?? "#000000"} emissiveIntensity={emissive ? 0.4 : 0} />
    </mesh>
  );
}

/** Un cilindro vertical (patas, troncos, postes). */
export function Post({ p, r, h, c, segments = 8 }: { p: V3; r: number; h: number; c: string; segments?: number }) {
  return (
    <mesh position={[p[0], p[1] + h / 2, p[2]]} castShadow>
      <cylinderGeometry args={[r, r, h, segments]} />
      <meshStandardMaterial color={c} />
    </mesh>
  );
}

/* ───────────── vegetación ───────────── */

export interface TreeSpot {
  p: V3;
  /** Escala del árbol (1 = unos 4 m de alto). */
  s?: number;
}

/** Árboles de copa redonda: troncos y copas en dos grupos de instancias. */
export function Trees({ trees }: { trees: TreeSpot[] }) {
  return (
    <group>
      <Instances limit={trees.length} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 1.6, 6]} />
        <meshStandardMaterial color="#7c5a3a" />
        {trees.map(({ p, s = 1 }, i) => (
          <Instance key={i} position={[p[0], 0.8 * s, p[2]]} scale={s} />
        ))}
      </Instances>
      <Instances limit={trees.length * 2} castShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#5f9e5a" flatShading />
        {trees.flatMap(({ p, s = 1 }, i) => [
          <Instance key={`a${i}`} position={[p[0], 2.3 * s, p[2]]} scale={1.15 * s} />,
          <Instance
            key={`b${i}`}
            position={[p[0] + 0.35 * s, 2.9 * s, p[2] - 0.2 * s]}
            scale={0.75 * s}
            color="#6fb067"
          />,
        ])}
      </Instances>
    </group>
  );
}

/** Pinos: tronco y dos conos. */
export function Pines({ pines }: { pines: TreeSpot[] }) {
  return (
    <group>
      <Instances limit={pines.length} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 1.2, 6]} />
        <meshStandardMaterial color="#6b4a2f" />
        {pines.map(({ p, s = 1 }, i) => (
          <Instance key={i} position={[p[0], 0.6 * s, p[2]]} scale={s} />
        ))}
      </Instances>
      <Instances limit={pines.length * 2} castShadow>
        <coneGeometry args={[1, 1.8, 7]} />
        <meshStandardMaterial color="#3f7d54" flatShading />
        {pines.flatMap(({ p, s = 1 }, i) => [
          <Instance key={`a${i}`} position={[p[0], 1.9 * s, p[2]]} scale={[1.1 * s, s, 1.1 * s]} />,
          <Instance key={`b${i}`} position={[p[0], 2.9 * s, p[2]]} scale={[0.75 * s, 0.85 * s, 0.75 * s]} />,
        ])}
      </Instances>
    </group>
  );
}

/** Arbustos bajos. */
export function Bushes({ bushes }: { bushes: TreeSpot[] }) {
  return (
    <Instances limit={bushes.length} castShadow>
      <dodecahedronGeometry args={[0.45, 0]} />
      <meshStandardMaterial color="#6aa35f" flatShading />
      {bushes.map(({ p, s = 1 }, i) => (
        <Instance key={i} position={[p[0], 0.32 * s, p[2]]} scale={[s * 1.2, s * 0.8, s]} />
      ))}
    </Instances>
  );
}

/** Un parterre con flores de colores. */
export function FlowerBed({ p, w = 1.6, d = 0.6 }: { p: V3; w?: number; d?: number }) {
  const colors = ["#f472b6", "#facc15", "#fb7185", "#a78bfa", "#f97316"];
  const flowers = Array.from({ length: Math.round(w * 5) }, (_, i) => ({
    x: -w / 2 + 0.15 + (i * (w - 0.3)) / Math.max(1, Math.round(w * 5) - 1),
    z: (i % 2 ? 0.12 : -0.12) * d,
    c: colors[i % colors.length],
  }));
  return (
    <group position={p}>
      <Box p={[0, 0.06, 0]} s={[w, 0.12, d]} c="#8b6b4a" shadow={false} />
      {flowers.map((f, i) => (
        <mesh key={i} position={[f.x, 0.22, f.z]}>
          <sphereGeometry args={[0.07, 6, 6]} />
          <meshStandardMaterial color={f.c} />
        </mesh>
      ))}
    </group>
  );
}

/** Una maceta con planta (interior o terraza). */
export function PottedPlant({ p, s = 1 }: { p: V3; s?: number }) {
  return (
    <group position={p} scale={s}>
      <mesh position={[0, 0.18, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.12, 0.36, 10]} />
        <meshStandardMaterial color="#c2703d" />
      </mesh>
      <mesh position={[0, 0.55, 0]} castShadow>
        <icosahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color="#4d8f4f" flatShading />
      </mesh>
    </group>
  );
}

/* ───────────── calle ───────────── */

/** Farolas: postes, brazos y lámparas, que se encienden de noche según la hora simulada. */
export function StreetLamps({ lamps }: { lamps: { p: V3; rotY?: number }[] }) {
  const glow = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    const sim = useSimStore.getState().sim;
    if (glow.current) glow.current.emissiveIntensity = sim ? 2.2 * streetLights(sim.now) : 0;
  });
  return (
    <group>
      <Instances limit={lamps.length} castShadow>
        <cylinderGeometry args={[0.06, 0.09, 4.2, 6]} />
        <meshStandardMaterial color="#475569" />
        {lamps.map(({ p }, i) => (
          <Instance key={i} position={[p[0], 2.1, p[2]]} />
        ))}
      </Instances>
      <Instances limit={lamps.length}>
        <boxGeometry args={[0.9, 0.06, 0.08]} />
        <meshStandardMaterial color="#475569" />
        {lamps.map(({ p, rotY = 0 }, i) => (
          <Instance
            key={i}
            position={[p[0] + Math.cos(rotY) * 0.4, 4.15, p[2] - Math.sin(rotY) * 0.4]}
            rotation-y={rotY}
          />
        ))}
      </Instances>
      <Instances limit={lamps.length}>
        <boxGeometry args={[0.36, 0.12, 0.22]} />
        <meshStandardMaterial ref={glow} color="#fef3c7" emissive="#fde68a" emissiveIntensity={0} />
        {lamps.map(({ p, rotY = 0 }, i) => (
          <Instance
            key={i}
            position={[p[0] + Math.cos(rotY) * 0.8, 4.08, p[2] - Math.sin(rotY) * 0.8]}
            rotation-y={rotY}
          />
        ))}
      </Instances>
    </group>
  );
}

/** Un banco de parque. */
export function Bench({ p, rotY = 0 }: { p: V3; rotY?: number }) {
  return (
    <group position={p} rotation-y={rotY}>
      <Box p={[0, 0.42, 0]} s={[1.5, 0.06, 0.42]} c="#a16207" />
      <Box p={[0, 0.72, -0.19]} s={[1.5, 0.32, 0.05]} c="#a16207" />
      {[-0.62, 0.62].map((x) => (
        <Box key={x} p={[x, 0.21, 0]} s={[0.06, 0.42, 0.4]} c="#334155" />
      ))}
    </group>
  );
}

/** Un coche: carrocería, cabina con cristales y ruedas. */
export function Car({ p, rotY = 0, color }: { p: V3; rotY?: number; color: string }) {
  return (
    <group position={p} rotation-y={rotY}>
      <Box p={[0, 0.5, 0]} s={[1.7, 0.55, 3.6]} c={color} />
      <Box p={[0, 0.98, -0.2]} s={[1.5, 0.45, 1.9]} c={color} />
      <Box p={[0, 0.98, -0.2]} s={[1.52, 0.32, 1.7]} c="#1e293b" emissive="#0f172a" />
      {[
        [-0.82, 1.15],
        [0.82, 1.15],
        [-0.82, -1.15],
        [0.82, -1.15],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.32, z]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.32, 0.32, 0.22, 12]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))}
      {/* Faros */}
      {[-0.55, 0.55].map((x) => (
        <Box key={x} p={[x, 0.55, 1.81]} s={[0.32, 0.14, 0.02]} c="#fef9c3" emissive="#fef08a" shadow={false} />
      ))}
    </group>
  );
}

/** Marcas viales repetidas (líneas discontinuas, pasos de cebra): cajas planas instanciadas. */
export function RoadMarks({ marks, size }: { marks: { p: V3; rotY?: number }[]; size: [number, number] }) {
  return (
    <Instances limit={marks.length} receiveShadow>
      <boxGeometry args={[size[0], 0.01, size[1]]} />
      <meshStandardMaterial color="#f8fafc" />
      {marks.map(({ p, rotY = 0 }, i) => (
        <Instance key={i} position={p} rotation-y={rotY} />
      ))}
    </Instances>
  );
}

/** Una valla de tablas entre dos puntos del suelo (a lo largo de x o de z). */
export function Fence({ from, to, h = 0.9, color = "#d6c3a5" }: { from: V3; to: V3; h?: number; color?: string }) {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  const posts = Math.max(2, Math.round(length / 1.2) + 1);
  const rotY = -Math.atan2(dz, dx);
  return (
    <group>
      <Instances limit={posts}>
        <boxGeometry args={[0.1, h, 0.1]} />
        <meshStandardMaterial color={color} />
        {Array.from({ length: posts }, (_, i) => (
          <Instance key={i} position={[from[0] + (dx * i) / (posts - 1), h / 2, from[2] + (dz * i) / (posts - 1)]} />
        ))}
      </Instances>
      {[0.3, 0.7].map((k) => (
        <Box
          key={k}
          p={[(from[0] + to[0]) / 2, h * k, (from[2] + to[2]) / 2]}
          s={[length, 0.08, 0.04]}
          c={color}
          rotY={rotY}
          shadow={false}
        />
      ))}
    </group>
  );
}

/* ───────────── edificios ───────────── */

/** Ventanas: paneles de cristal instanciados sobre las fachadas. */
export function Windows({
  windows,
  size,
  color = "#bfdbfe",
}: {
  windows: { p: V3; rotY?: number }[];
  size: [number, number];
  color?: string;
}) {
  return (
    <Instances limit={windows.length}>
      <boxGeometry args={[size[0], size[1], 0.05]} />
      <meshStandardMaterial color={color} emissive="#60a5fa" emissiveIntensity={0.12} metalness={0.2} roughness={0.3} />
      {windows.map(({ p, rotY = 0 }, i) => (
        <Instance key={i} position={p} rotation-y={rotY} />
      ))}
    </Instances>
  );
}

/** Tejado a cuatro aguas sobre una caja de w × d. */
export function HipRoof({ p, w, d, h, color }: { p: V3; w: number; d: number; h: number; color: string }) {
  return (
    <mesh position={p} rotation-y={Math.PI / 4} scale={[w / Math.SQRT2, h, d / Math.SQRT2]} castShadow>
      {/* Una pirámide de 4 caras girada 45° y escalada a la planta de la casa. */}
      <coneGeometry args={[1, 1, 4]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  );
}

/** Una casa vecina: cuerpo, tejado, puerta, ventanas y, si se pide, chimenea. */
export function NeighbourHouse({
  p,
  rotY = 0,
  w = 7,
  d = 6,
  h = 3,
  wall,
  roof,
  chimney = false,
  children,
}: {
  p: V3;
  rotY?: number;
  w?: number;
  d?: number;
  h?: number;
  wall: string;
  roof: string;
  chimney?: boolean;
  children?: ReactNode;
}) {
  return (
    <group position={p} rotation-y={rotY}>
      <Box p={[0, h / 2, 0]} s={[w, h, d]} c={wall} />
      <HipRoof p={[0, h + 0.9, 0]} w={w + 0.5} d={d + 0.5} h={1.8} color={roof} />
      <Box p={[0, 1, d / 2 + 0.03]} s={[1, 2, 0.06]} c="#7c4a2d" />
      <Windows
        windows={[
          { p: [-w / 4 - 0.4, 1.6, d / 2 + 0.03] },
          { p: [w / 4 + 0.4, 1.6, d / 2 + 0.03] },
          { p: [-w / 2 - 0.03, 1.6, 0], rotY: Math.PI / 2 },
          { p: [w / 2 + 0.03, 1.6, 0], rotY: Math.PI / 2 },
        ]}
        size={[1.2, 0.9]}
      />
      {chimney && <Box p={[w / 4, h + 1.6, -d / 5]} s={[0.5, 1.4, 0.5]} c="#9a3412" />}
      {children}
    </group>
  );
}
