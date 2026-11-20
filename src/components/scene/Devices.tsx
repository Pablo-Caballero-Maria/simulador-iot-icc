"use client";
/** Estación domiciliaria, dispensador y báscula. Su aspecto refleja el estado de la simulación. */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh, MeshStandardMaterial } from "three";
import { useSimStore } from "@/lib/sim-store";
import { DISPENSER_POS, SCALE_POS, STATION_POS } from "./positions";
import { Selectable } from "./Selectable";

export function Station() {
  const screen = useRef<MeshStandardMaterial>(null);
  const led = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const sim = useSimStore.getState().sim;
    if (!sim || !screen.current || !led.current) return;
    const online = sim.station.connected && sim.cell.available;
    const queued = sim.station.queueLength > 0;
    led.current.emissive.set(online ? (queued ? "#fbbf24" : "#34d399") : "#f43f5e");
    led.current.emissiveIntensity = 1.5 + Math.sin(clock.elapsedTime * 4);
    screen.current.emissive.set(
      sim.station.lastWeight && sim.now - sim.station.lastWeight.t < 120 ? "#22d3ee" : "#0e7490",
    );
  });
  const [x, y, z] = STATION_POS;
  return (
    <Selectable node="station">
      <group position={[x, y, z]}>
        <mesh castShadow>
          <boxGeometry args={[0.5, 0.22, 0.3]} />
          <meshStandardMaterial color="#e5e7eb" />
        </mesh>
        <mesh position={[0, 0.02, 0.152]}>
          <boxGeometry args={[0.32, 0.12, 0.005]} />
          <meshStandardMaterial ref={screen} color="#0f172a" emissive="#0e7490" emissiveIntensity={0.8} />
        </mesh>
        <mesh position={[0.21, 0.08, 0.152]}>
          <sphereGeometry args={[0.018, 12, 12]} />
          <meshStandardMaterial ref={led} color="#111827" emissive="#34d399" />
        </mesh>
        {/* Antena del módem */}
        <mesh position={[-0.2, 0.25, -0.1]}>
          <cylinderGeometry args={[0.012, 0.012, 0.3]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
      </group>
    </Selectable>
  );
}

export function Dispenser() {
  const carousel = useRef<Mesh>(null);
  const tray = useRef<Mesh>(null);
  const body = useRef<MeshStandardMaterial>(null);
  useFrame((_, delta) => {
    const sim = useSimStore.getState().sim;
    if (!sim || !carousel.current || !tray.current || !body.current) return;
    const open = sim.dispenser.trayOpenUntil > sim.now;
    carousel.current.rotation.y += open ? delta * 1.5 : 0;
    const targetZ = open ? 0.22 : 0.1;
    tray.current.position.z += (targetZ - tray.current.position.z) * Math.min(1, delta * 6);
    const lastReject = sim.dispenser.log.findLast((e) => e.kind === "rejected");
    const rejecting = lastReject && sim.now - lastReject.t < 60;
    body.current.emissive.set(rejecting ? "#f43f5e" : open ? "#a78bfa" : "#000000");
    body.current.emissiveIntensity = rejecting || open ? 0.6 : 0;
  });
  const [x, y, z] = DISPENSER_POS;
  return (
    <Selectable node="dispenser">
      <group position={[x, y, z]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.17, 0.19, 0.24, 24]} />
          <meshStandardMaterial ref={body} color="#ddd6fe" />
        </mesh>
        <mesh ref={carousel} position={[0, 0.14, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.04, 14]} />
          <meshStandardMaterial color="#7c3aed" />
        </mesh>
        <mesh ref={tray} position={[0, -0.08, 0.1]}>
          <boxGeometry args={[0.12, 0.04, 0.1]} />
          <meshStandardMaterial color="#f5f3ff" />
        </mesh>
      </group>
    </Selectable>
  );
}

export function Scale() {
  const display = useRef<MeshStandardMaterial>(null);
  const group = useRef<Group>(null);
  useFrame(() => {
    const sim = useSimStore.getState().sim;
    if (!sim || !display.current) return;
    const w = sim.station.lastWeight;
    const recent = w && sim.now - w.t < 300;
    display.current.emissive.set(recent ? (w.valid ? "#34d399" : "#f43f5e") : "#164e63");
  });
  const [x, y, z] = SCALE_POS;
  return (
    <Selectable node="scale">
      <group ref={group} position={[x, y, z]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.36, 0.05, 0.36]} />
          <meshStandardMaterial color="#cbd5e1" />
        </mesh>
        <mesh position={[0, 0.027, 0.11]}>
          <boxGeometry args={[0.12, 0.005, 0.05]} />
          <meshStandardMaterial ref={display} color="#0f172a" emissive="#164e63" />
        </mesh>
      </group>
    </Selectable>
  );
}
