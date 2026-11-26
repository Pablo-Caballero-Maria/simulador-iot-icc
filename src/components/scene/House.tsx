"use client";
/** Domicilio del paciente: suelos, tabiques (con la geometría de la simulación), muebles y jardín. */
import { Text } from "@react-three/drei";
import { ROOMS, SPOTS, WALLS } from "@/sim/physiology/home";
import { SCENE_FONT } from "./font";

const WALL_HEIGHT = 2.4;
/** Posición de los nombres de las estancias, donde no los tapan los muebles. */
const LABEL_POS: Partial<Record<string, [number, number, number]>> = {
  salon: [-2.4, 0.04, -3.3],
  cocina: [3.5, 0.04, -0.9],
  dormitorio: [-2.0, 0.04, 1.0],
  pasillo: [1.0, 0.04, 1.2],
  bano: [4.0, 0.04, 2.6],
};
const FLOOR_COLORS: Record<string, string> = {
  salon: "#ecdfc8",
  cocina: "#e2e8f0",
  dormitorio: "#e4def3",
  pasillo: "#e7e5e4",
  bano: "#d5ecf0",
};

export function House() {
  const indoor = Object.values(ROOMS).filter((r) => r.indoor);
  return (
    <group>
      {/* Jardín vallado */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 7.25]} receiveShadow>
        <planeGeometry args={[12, 5.5]} />
        <meshStandardMaterial color="#b7d3a8" />
      </mesh>
      {[-6, 6].map((x) => (
        <mesh key={x} position={[x, 0.45, 7.25]}>
          <boxGeometry args={[0.06, 0.9, 5.5]} />
          <meshStandardMaterial color="#a8a29e" />
        </mesh>
      ))}

      {/* Suelos de las estancias con su nombre */}
      {indoor.map((r) => (
        <group key={r.id}>
          <mesh rotation-x={-Math.PI / 2} position={[(r.x0 + r.x1) / 2, 0.02, (r.z0 + r.z1) / 2]} receiveShadow>
            <planeGeometry args={[r.x1 - r.x0, r.z1 - r.z0]} />
            <meshStandardMaterial color={FLOOR_COLORS[r.id] ?? "#e5e7eb"} />
          </mesh>
          <Text
            font={SCENE_FONT}
            position={LABEL_POS[r.id] ?? [(r.x0 + r.x1) / 2, 0.04, (r.z0 + r.z1) / 2]}
            rotation-x={-Math.PI / 2}
            fontSize={0.38}
            color="#475569"
            anchorX="center"
            anchorY="middle"
          >
            {r.name}
          </Text>
        </group>
      ))}

      {/* Muros y tabiques semitransparentes para ver el interior */}
      {WALLS.map((w, i) => {
        const len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
        const angle = Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x);
        return (
          <mesh
            key={i}
            position={[(w.a.x + w.b.x) / 2, WALL_HEIGHT / 2, (w.a.z + w.b.z) / 2]}
            rotation-y={-angle}
            castShadow
          >
            <boxGeometry args={[len, WALL_HEIGHT, w.exterior ? 0.18 : 0.1]} />
            <meshStandardMaterial
              color={w.exterior ? "#94a3b8" : "#cbd5e1"}
              transparent
              opacity={w.exterior ? 0.4 : 0.45}
              depthWrite={false}
            />
          </mesh>
        );
      })}

      <Furniture />
    </group>
  );
}

function Box({ p, s, c }: { p: [number, number, number]; s: [number, number, number]; c: string }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} />
    </mesh>
  );
}

function Furniture() {
  const { bed, sofa, kitchenTable, station } = SPOTS;
  return (
    <group>
      {/* Cama */}
      <Box p={[bed.x - 0.2, 0.25, bed.z]} s={[2.1, 0.5, 1.5]} c="#94a3b8" />
      <Box p={[bed.x - 1.1, 0.55, bed.z]} s={[0.25, 0.6, 1.5]} c="#78716c" />
      <Box p={[bed.x - 0.75, 0.56, bed.z]} s={[0.45, 0.12, 1.1]} c="#e2e8f0" />
      {/* Sofá */}
      <Box p={[sofa.x - 0.7, 0.25, sofa.z]} s={[0.8, 0.5, 2.2]} c="#8b9dc3" />
      <Box p={[sofa.x - 1.0, 0.6, sofa.z]} s={[0.25, 0.7, 2.2]} c="#6f83ad" />
      {/* Mesa de la cocina y encimera */}
      <Box p={[kitchenTable.x, 0.72, kitchenTable.z]} s={[1.4, 0.06, 0.9]} c="#a16207" />
      <Box p={[kitchenTable.x, 0.36, kitchenTable.z]} s={[0.1, 0.7, 0.1]} c="#713f12" />
      <Box p={[3.5, 0.45, -4.15]} s={[4.6, 0.9, 0.6]} c="#cbd5e1" />
      {/* Aparador bajo la estación */}
      <Box p={[station.x + 0.25, 0.42, station.z]} s={[1.8, 0.84, 0.5]} c="#a8a29e" />
      {/* Baño */}
      <Box p={[5.2, 0.3, 1.0]} s={[1.4, 0.6, 0.75]} c="#e2e8f0" />
      {/* Mesa del salón */}
      <Box p={[-2.6, 0.22, -1.6]} s={[0.9, 0.44, 0.6]} c="#a8a29e" />
    </group>
  );
}
