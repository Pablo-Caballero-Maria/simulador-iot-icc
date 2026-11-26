"use client";
/**
 * Domicilio del paciente: suelos, tabiques (con la geometría de la simulación), ventanas, muebles
 * de cada estancia y el jardín. Los muebles quedan fuera de los recorridos del paciente entre las
 * puertas y sus sitios (SPOTS).
 */
import { Text } from "@react-three/drei";
import { ROOMS, SPOTS, WALLS } from "@/sim/physiology/home";
import { SCENE_FONT } from "./font";
import { Box, Bench, Bushes, Fence, FlowerBed, PottedPlant, Trees, Windows } from "./Props";

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
      <Garden />

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

      {/* Ventanas en los muros exteriores, a la altura de una ventana de verdad */}
      <Windows
        windows={[
          { p: [-4, 1.45, 4.55] },
          { p: [4.2, 1.45, 4.55] },
          { p: [-4.4, 1.45, -4.55] },
          { p: [3.4, 1.45, -4.55] },
          { p: [-6.05, 1.45, -2.4], rotY: Math.PI / 2 },
          { p: [-6.05, 1.45, 2.2], rotY: Math.PI / 2 },
          { p: [6.05, 1.45, -2.4], rotY: Math.PI / 2 },
          { p: [6.05, 1.75, 1.4], rotY: Math.PI / 2 },
        ]}
        size={[1.3, 1.05]}
      />

      <Furniture />
    </group>
  );
}

/** El jardín: valla, camino a la calle, árboles, parterres, un banco y el buzón. */
function Garden() {
  return (
    <group>
      <Fence from={[-6, 0, 4.5]} to={[-6, 0, 10]} />
      {/* La cancela al paseo, por donde sale el paciente (DOORS: jardín → calle, en z = 9) */}
      <Fence from={[6, 0, 4.5]} to={[6, 0, 8.4]} />
      <Fence from={[6, 0, 9.6]} to={[6, 0, 10]} />
      {/* La valla delantera deja paso al camino (x ≈ 1) */}
      <Fence from={[-6, 0, 10]} to={[0.4, 0, 10]} />
      <Fence from={[1.6, 0, 10]} to={[6, 0, 10]} />
      {/* Camino de losas de la puerta a la calle */}
      {[5.2, 6.1, 7, 7.9, 8.8, 9.7].map((z) => (
        <Box key={z} p={[1, 0.02, z]} s={[0.9, 0.03, 0.6]} c="#d6d3d1" shadow={false} />
      ))}
      <Trees
        trees={[
          { p: [-4.3, 0, 8.4], s: 0.9 },
          { p: [4.7, 0, 6], s: 0.8 },
        ]}
      />
      <Bushes bushes={[{ p: [-5.4, 0, 9.4] }, { p: [5.3, 0, 5.4], s: 0.8 }, { p: [-1.5, 0, 9.5], s: 0.7 }]} />
      <FlowerBed p={[-3.2, 0, 5]} w={3} />
      <FlowerBed p={[3.8, 0, 5]} w={2} />
      <Bench p={[-2.4, 0, 7.4]} rotY={Math.PI / 2} />
      {/* Buzón junto a la entrada */}
      <Box p={[2.1, 0.55, 10.25]} s={[0.08, 1.1, 0.08]} c="#475569" />
      <Box p={[2.1, 1.15, 10.25]} s={[0.4, 0.28, 0.25]} c="#dc2626" />
    </group>
  );
}

function Furniture() {
  const { bed, sofa, kitchenTable, station } = SPOTS;
  return (
    <group>
      {/* Dormitorio: cama, mesilla con lámpara, armario y alfombra */}
      <Box p={[bed.x - 0.2, 0.25, bed.z]} s={[2.1, 0.5, 1.5]} c="#94a3b8" />
      <Box p={[bed.x - 1.1, 0.55, bed.z]} s={[0.25, 0.6, 1.5]} c="#78716c" />
      <Box p={[bed.x - 0.75, 0.56, bed.z]} s={[0.45, 0.12, 1.1]} c="#e2e8f0" />
      <Box p={[bed.x + 0.35, 0.53, bed.z]} s={[1.1, 0.06, 1.52]} c="#c4b5fd" />
      <Box p={[bed.x - 1.05, 0.28, bed.z - 1.15]} s={[0.45, 0.55, 0.45]} c="#a16207" />
      <mesh position={[bed.x - 1.05, 0.72, bed.z - 1.15]}>
        <coneGeometry args={[0.16, 0.25, 12, 1, true]} />
        <meshStandardMaterial color="#fef3c7" emissive="#fde68a" emissiveIntensity={0.3} side={2} />
      </mesh>
      <Box p={[-4.6, 1.05, 0.35]} s={[1.6, 2.1, 0.55]} c="#d6c3a5" />
      <Box p={[-4.6, 1.05, 0.64]} s={[0.02, 1.9, 0.02]} c="#78716c" shadow={false} />
      <Box p={[-2.6, 0.03, 2.9]} s={[1.4, 0.02, 1.8]} c="#e9d5ff" shadow={false} />

      {/* Salón: sofá, mesa baja con alfombra, mueble de la tele, estantería, planta y lámpara de pie */}
      <Box p={[sofa.x - 0.7, 0.25, sofa.z]} s={[0.8, 0.5, 2.2]} c="#8b9dc3" />
      <Box p={[sofa.x - 1.0, 0.6, sofa.z]} s={[0.25, 0.7, 2.2]} c="#6f83ad" />
      {[-0.95, 0.95].map((dz) => (
        <Box key={dz} p={[sofa.x - 0.7, 0.45, sofa.z + dz]} s={[0.8, 0.4, 0.2]} c="#6f83ad" />
      ))}
      <Box p={[-2.6, 0.22, -1.6]} s={[0.9, 0.44, 0.6]} c="#a8a29e" />
      <Box p={[-2.8, 0.03, -1.6]} s={[2.4, 0.02, 1.6]} c="#fde68a" shadow={false} />
      <Box p={[-4, 0.3, -4.2]} s={[1.7, 0.6, 0.42]} c="#57534e" />
      <Box p={[-4, 1.05, -4.33]} s={[1.3, 0.75, 0.05]} c="#0f172a" emissive="#1e3a8a" />
      <Box p={[-5.7, 0.9, -3.4]} s={[0.4, 1.8, 1.1]} c="#a16207" />
      {[0.45, 0.95, 1.45].map((y) => (
        <Box key={y} p={[-5.5, y, -3.4]} s={[0.04, 0.3, 0.9]} c={y > 1 ? "#2563eb" : "#dc2626"} shadow={false} />
      ))}
      <PottedPlant p={[0.55, 0, -4.1]} s={1.2} />
      <Box p={[-5.6, 0.8, -0.4]} s={[0.05, 1.6, 0.05]} c="#334155" />
      <mesh position={[-5.6, 1.65, -0.4]}>
        <cylinderGeometry args={[0.12, 0.22, 0.3, 12, 1, true]} />
        <meshStandardMaterial color="#fef3c7" emissive="#fde68a" emissiveIntensity={0.3} side={2} />
      </mesh>

      {/* Cocina: encimera con fogones y fregadero, armarios altos, nevera, mesa y sillas */}
      <Box p={[3.5, 0.45, -4.15]} s={[4.6, 0.9, 0.6]} c="#cbd5e1" />
      <Box p={[2.3, 0.91, -4.15]} s={[0.6, 0.02, 0.48]} c="#1f2937" shadow={false} />
      <Box p={[4.4, 0.91, -4.15]} s={[0.6, 0.02, 0.44]} c="#94a3b8" shadow={false} />
      <Box p={[3.3, 1.85, -4.3]} s={[3.4, 0.7, 0.32]} c="#e2e8f0" />
      <Box p={[5.6, 0.95, -2.9]} s={[0.65, 1.9, 0.7]} c="#f1f5f9" />
      <Box p={[5.26, 1.2, -2.9]} s={[0.02, 0.5, 0.04]} c="#64748b" shadow={false} />
      <Box p={[kitchenTable.x, 0.72, kitchenTable.z]} s={[1.4, 0.06, 0.9]} c="#a16207" />
      {[
        [-0.6, -0.35],
        [0.6, -0.35],
        [-0.6, 0.35],
        [0.6, 0.35],
      ].map(([dx, dz]) => (
        <Box
          key={`${dx}${dz}`}
          p={[kitchenTable.x + dx, 0.35, kitchenTable.z + dz]}
          s={[0.06, 0.7, 0.06]}
          c="#713f12"
        />
      ))}
      {/* Sillas a los lados largos de la mesa, fuera del paso desde la puerta */}
      {[-0.85, 0.85].map((dz) => (
        <group key={dz} position={[kitchenTable.x, 0, kitchenTable.z + dz]}>
          <Box p={[0, 0.45, 0]} s={[0.42, 0.05, 0.42]} c="#a16207" />
          <Box p={[0, 0.72, dz > 0 ? 0.19 : -0.19]} s={[0.42, 0.5, 0.04]} c="#a16207" />
          <Box p={[0, 0.22, 0]} s={[0.05, 0.44, 0.05]} c="#713f12" />
        </group>
      ))}

      {/* Aparador bajo la estación */}
      <Box p={[station.x + 0.25, 0.42, station.z]} s={[1.8, 0.84, 0.5]} c="#a8a29e" />

      {/* Baño: bañera, inodoro, lavabo con espejo */}
      <Box p={[5.2, 0.3, 1.0]} s={[1.4, 0.6, 0.75]} c="#e2e8f0" />
      <Box p={[5.2, 0.55, 1.0]} s={[1.2, 0.08, 0.55]} c="#bae6fd" shadow={false} />
      <Box p={[3.1, 0.22, 0.45]} s={[0.42, 0.44, 0.55]} c="#f8fafc" />
      <Box p={[3.1, 0.6, 0.25]} s={[0.42, 0.4, 0.16]} c="#f8fafc" />
      <Box p={[5.72, 0.42, 2.4]} s={[0.5, 0.84, 0.7]} c="#cbd5e1" />
      <Box p={[5.94, 1.45, 2.4]} s={[0.03, 0.7, 0.6]} c="#e0f2fe" emissive="#bae6fd" shadow={false} />

      {/* Pasillo: zapatero y una planta */}
      <Box p={[-0.25, 0.4, 3.95]} s={[0.35, 0.8, 0.8]} c="#a8a29e" />
      <PottedPlant p={[2.15, 0, 0.45]} />
    </group>
  );
}
