"use client";
/** Suelo, carretera, estación base, plataforma en la nube, hospital y ambulancia. */
import { useRef } from "react";
import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group, MeshStandardMaterial } from "three";
import { useSimStore } from "@/lib/sim-store";
import { AMBULANCE_ROUTE, CLOUD_POS, HOSPITAL_POS, TOWER_BASE, pointAlong } from "./positions";
import { Selectable } from "./Selectable";
import { SCENE_FONT } from "./font";

export function Ground() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[30, -0.01, 5]} receiveShadow>
        <planeGeometry args={[700, 700]} />
        <meshStandardMaterial color="#e3eadf" />
      </mesh>
      {/* Carretera y acera */}
      <mesh rotation-x={-Math.PI / 2} position={[25, 0.005, 13]}>
        <planeGeometry args={[100, 3.4]} />
        <meshStandardMaterial color="#cfd6de" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[40, 0.006, 17]}>
        <planeGeometry args={[3.4, 8]} />
        <meshStandardMaterial color="#cfd6de" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[1, 0.012, 11.4]}>
        <planeGeometry args={[1.2, 2.8]} />
        <meshStandardMaterial color="#d6d3d1" />
      </mesh>
    </group>
  );
}

export function CellTower() {
  const light = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const sim = useSimStore.getState().sim;
    if (!light.current || !sim) return;
    const tech = sim.cell.tech;
    light.current.emissive.set(tech === "lte-m" ? "#fbbf24" : tech === "nb-iot" ? "#fb923c" : "#f43f5e");
    light.current.emissiveIntensity = 1 + Math.sin(clock.elapsedTime * 3);
  });
  const [x, , z] = TOWER_BASE;
  return (
    <Selectable node="tower">
      <group position={[x, 0, z]}>
        <mesh position={[0, 10, 0]} castShadow>
          <cylinderGeometry args={[0.25, 1.1, 20, 4, 6, true]} />
          <meshStandardMaterial color="#64748b" wireframe />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos((i * 2 * Math.PI) / 3) * 0.6, 19.5, Math.sin((i * 2 * Math.PI) / 3) * 0.6]}>
            <boxGeometry args={[0.3, 1.6, 0.15]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
        ))}
        <mesh position={[0, 21, 0]}>
          <sphereGeometry args={[0.35, 12, 12]} />
          <meshStandardMaterial ref={light} color="#111827" emissive="#fbbf24" />
        </mesh>
        <Billboard position={[0, 23.4, 0]}>
          <Text
            font={SCENE_FONT}
            fontSize={1.5}
            color="#92400e"
            anchorX="center"
            outlineWidth={0.06}
            outlineColor="#ffffff"
          >
            Red móvil LTE-M / NB-IoT
          </Text>
        </Billboard>
      </group>
    </Selectable>
  );
}

export function CloudPlatform() {
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (group.current) group.current.position.y = CLOUD_POS[1] + Math.sin(clock.elapsedTime * 0.6) * 0.4;
  });
  return (
    <Selectable node="cloud">
      <group ref={group} position={CLOUD_POS}>
        {(
          [
            [0, 0, 0, 3.4],
            [3, -0.6, 0.5, 2.6],
            [-3, -0.8, 0.2, 2.4],
            [1.2, 1.4, -0.4, 2.4],
            [-1.4, 1, 0.6, 2.2],
          ] as const
        ).map(([x, y, z, r], i) => (
          <mesh key={i} position={[x, y, z]}>
            <sphereGeometry args={[r, 20, 20]} />
            <meshStandardMaterial color="#c7dcf3" transparent opacity={0.75} depthWrite={false} />
          </mesh>
        ))}
        {[-1.6, 0, 1.6].map((x) => (
          <mesh key={x} position={[x, -0.4, 0]}>
            <boxGeometry args={[1.1, 2.4, 1]} />
            <meshStandardMaterial color="#334155" emissive="#2563eb" emissiveIntensity={0.25} />
          </mesh>
        ))}
        <Billboard position={[0, 4.6, 0]}>
          <Text
            font={SCENE_FONT}
            fontSize={1.5}
            color="#1e3a8a"
            anchorX="center"
            outlineWidth={0.06}
            outlineColor="#ffffff"
          >
            Plataforma en la nube (UE)
          </Text>
        </Billboard>
      </group>
    </Selectable>
  );
}

export function Hospital() {
  const [x, , z] = HOSPITAL_POS;
  return (
    <Selectable node="hospital">
      <group position={[x, 0, z]}>
        <mesh position={[0, 3.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[10, 7, 7]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
        {[1.6, 3.6, 5.6].map((y) => (
          <mesh key={y} position={[0, y, 3.52]}>
            <boxGeometry args={[8.6, 0.8, 0.05]} />
            <meshStandardMaterial color="#93c5fd" emissive="#60a5fa" emissiveIntensity={0.15} />
          </mesh>
        ))}
        {/* Cruz */}
        <mesh position={[0, 7.7, 0]}>
          <boxGeometry args={[2.4, 0.7, 0.7]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[0, 7.7, 0]}>
          <boxGeometry args={[0.7, 0.7, 2.4]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.6} />
        </mesh>
        <Billboard position={[0, 9.6, 0]}>
          <Text
            font={SCENE_FONT}
            fontSize={1.2}
            color="#1e3a8a"
            anchorX="center"
            outlineWidth={0.05}
            outlineColor="#ffffff"
          >
            Hospital: Cardiología y HaD
          </Text>
        </Billboard>
      </group>
    </Selectable>
  );
}

export function Ambulance() {
  const group = useRef<Group>(null);
  const beacon = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const sim = useSimStore.getState().sim;
    if (!sim || !group.current || !beacon.current) return;
    const a = sim.platform.ambulance;
    const t = sim.now;
    let f = 0;
    if (a.phase === "outbound") f = Math.max(0, Math.min(1, (t - a.departAt) / Math.max(1, a.arriveAt - a.departAt)));
    else if (a.phase === "onsite") f = 1;
    else if (a.phase === "return")
      f = 1 - Math.max(0, Math.min(1, (t - a.leaveAt) / Math.max(1, a.backAt - a.leaveAt)));
    const p = pointAlong(AMBULANCE_ROUTE, f);
    const ahead = pointAlong(AMBULANCE_ROUTE, Math.min(1, f + 0.01));
    group.current.position.set(p[0], 0, p[2]);
    if (f < 0.995)
      group.current.rotation.y = Math.atan2(ahead[0] - p[0], ahead[2] - p[2]) + (a.phase === "return" ? Math.PI : 0);
    const active = a.phase === "outbound" || a.phase === "onsite";
    beacon.current.emissive.set(Math.sin(clock.elapsedTime * 12) > 0 ? "#3b82f6" : "#ef4444");
    beacon.current.emissiveIntensity = active ? 2 : 0;
  });
  return (
    <Selectable node="ambulance">
      <group ref={group} position={AMBULANCE_ROUTE[0]}>
        <mesh position={[0, 0.9, 0]} castShadow>
          <boxGeometry args={[1.6, 1.4, 3.2]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
        <mesh position={[0, 0.75, 1.9]} castShadow>
          <boxGeometry args={[1.6, 1.1, 0.8]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
        <mesh position={[0, 1.15, 0]}>
          <boxGeometry args={[1.62, 0.25, 3.22]} />
          <meshStandardMaterial color="#facc15" />
        </mesh>
        <mesh position={[0, 1.7, 1.2]}>
          <boxGeometry args={[0.9, 0.15, 0.25]} />
          <meshStandardMaterial ref={beacon} color="#1e293b" />
        </mesh>
      </group>
    </Selectable>
  );
}
