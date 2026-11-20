"use client";
/**
 * Paciente con el wearable en el pecho. La posición y la postura salen del
 * modelo de paciente; el color del parche indica el estado del enlace BLE y
 * vibra cuando hay una alarma local.
 */
import { useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group, MeshStandardMaterial } from "three";
import { useSimStore } from "@/lib/sim-store";
import { Selectable } from "./Selectable";

/** Posición actual del wearable en la escena (la usan los enlaces y los paquetes). */
export const wearableWorld: [number, number, number] = [0, 1.3, 0];

export function Patient() {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const patch = useRef<MeshStandardMaterial>(null);
  const label = useRef<HTMLDivElement>(null);
  const smooth = useRef({ x: 0, z: 0, init: false, yaw: 0 });

  useFrame(({ clock }, delta) => {
    const sim = useSimStore.getState().sim;
    if (!sim || !root.current || !body.current || !patch.current) return;
    const p = sim.patient.position();
    const s = smooth.current;
    if (!s.init) {
      s.x = p.x;
      s.z = p.z;
      s.init = true;
    }
    // Suavizado para que el movimiento sea fluido aunque la simulación vaya a saltos.
    const k = Math.min(1, delta * 8);
    const dx = p.x - s.x;
    const dz = p.z - s.z;
    if (Math.hypot(dx, dz) > 6) {
      s.x = p.x;
      s.z = p.z;
    } else {
      s.x += dx * k;
      s.z += dz * k;
    }
    if (Math.hypot(dx, dz) > 0.02) s.yaw = Math.atan2(dx, dz);
    root.current.position.set(s.x, 0, s.z);

    const posture = sim.patient.postureAt(sim.now);
    const lying = posture === "supine";
    // Vibración durante la alarma local.
    const vibrating = sim.wearable.vibratingUntil > sim.now;
    const jitter = vibrating ? Math.sin(clock.elapsedTime * 60) * 0.02 : 0;
    if (lying) {
      // Tumbado a lo largo de la cama (eje x), con la cabeza hacia el cabecero.
      body.current.rotation.set(0, 0, Math.PI / 2);
      body.current.position.set(0.85 + jitter, 0.72, 0);
    } else {
      body.current.rotation.set(0, s.yaw, 0);
      body.current.position.set(jitter, 0, 0);
    }

    const color = sim.wearable.off
      ? "#475569"
      : vibrating
        ? "#f43f5e"
        : sim.ble.state === "disconnected"
          ? "#64748b"
          : sim.ble.phy === "coded"
            ? "#fbbf24"
            : "#22d3ee";
    patch.current.emissive.set(color);
    patch.current.emissiveIntensity = vibrating ? 2 + Math.sin(clock.elapsedTime * 20) : 1.2;

    // Posición del wearable para enlaces y paquetes.
    wearableWorld[0] = lying ? s.x - 0.43 : s.x;
    wearableWorld[1] = lying ? 0.92 : 1.3;
    wearableWorld[2] = s.z;

    if (label.current) {
      const heart = sim.patient.heartStateAt(sim.now);
      const hr = heart.rhythm === "pause" ? "—" : Math.round(heart.hr).toString();
      label.current.textContent = `♥ ${hr} lpm`;
      label.current.style.color = heart.rhythm === "sinus" ? "#334155" : "#e11d48";
    }
  });

  return (
    <Selectable node="wearable">
      <group ref={root}>
        <group ref={body}>
          {/* Cuerpo */}
          <mesh position={[0, 0.85, 0]} castShadow>
            <capsuleGeometry args={[0.2, 0.9, 6, 12]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
          {/* Cabeza */}
          <mesh position={[0, 1.62, 0]} castShadow>
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshStandardMaterial color="#fcd34d" />
          </mesh>
          {/* Wearable torácico */}
          <mesh position={[0, 1.28, 0.2]}>
            <boxGeometry args={[0.12, 0.08, 0.03]} />
            <meshStandardMaterial ref={patch} color="#0f172a" emissive="#22d3ee" emissiveIntensity={1.2} />
          </mesh>
        </group>
        <Html position={[0, 2.05, 0]} center distanceFactor={14} zIndexRange={[10, 0]}>
          <div
            ref={label}
            className="pointer-events-none rounded-full border border-slate-200 bg-white/90 px-2 py-0.5 font-mono text-[11px] whitespace-nowrap shadow-sm"
          />
        </Html>
      </group>
    </Selectable>
  );
}
