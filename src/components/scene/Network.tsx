"use client";
/**
 * Enlaces y paquetes en tránsito. Cada mensaje que emite la simulación se
 * anima por su recorrido (BLE, red móvil, Internet, hospital) con el color de
 * su tipo y un tamaño que crece con sus bytes.
 */
import { useMemo, useRef } from "react";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Color, type InstancedMesh, Object3D } from "three";
import type { Line2 } from "three-stdlib";
import { KIND_COLORS, LINK_COLORS } from "@/data/system";
import { packetQueue, useSimStore } from "@/lib/sim-store";
import { wearableWorld } from "./Patient";
import {
  CLOUD_POS,
  DISPENSER_POS,
  HOSPITAL_ROOF,
  SCALE_POS,
  STATION_POS,
  TOWER_TOP,
  packetPath,
  pointAlong,
} from "./positions";

const MAX_PACKETS = 64;

export function Links() {
  const bleLine = useRef<Line2>(null);
  const cellLine = useRef<Line2>(null);
  useFrame(() => {
    const sim = useSimStore.getState().sim;
    if (!sim) return;
    if (bleLine.current) {
      bleLine.current.geometry.setPositions([...wearableWorld, ...STATION_POS]);
      const mat = bleLine.current.material;
      const connected = sim.ble.state === "connected";
      mat.color.set(connected ? (sim.ble.phy === "coded" ? "#d97706" : LINK_COLORS.ble) : "#94a3b8");
      mat.opacity = connected ? 0.85 : 0.25;
      mat.dashed = !connected || sim.ble.phy === "coded";
    }
    if (cellLine.current) {
      const tech = sim.cell.tech;
      const mat = cellLine.current.material;
      mat.color.set(tech === "lte-m" ? LINK_COLORS["lte-m"] : tech === "nb-iot" ? LINK_COLORS["nb-iot"] : "#e11d48");
      mat.dashed = tech === null;
      mat.opacity = tech === null ? 0.5 : 0.7;
    }
  });
  return (
    <group>
      <Line
        ref={bleLine}
        points={[wearableWorld, STATION_POS]}
        color={LINK_COLORS.ble}
        lineWidth={2}
        transparent
        dashSize={0.3}
        gapSize={0.2}
      />
      <Line
        points={[SCALE_POS, STATION_POS]}
        color={LINK_COLORS["ble-scale"]}
        lineWidth={1}
        transparent
        opacity={0.25}
        dashed
        dashSize={0.2}
        gapSize={0.2}
      />
      <Line points={[STATION_POS, DISPENSER_POS]} color={LINK_COLORS.uart} lineWidth={1.5} transparent opacity={0.5} />
      <Line
        ref={cellLine}
        points={[STATION_POS, TOWER_TOP]}
        color={LINK_COLORS["lte-m"]}
        lineWidth={2}
        transparent
        dashSize={1}
        gapSize={0.6}
      />
      <Line points={[TOWER_TOP, CLOUD_POS]} color={LINK_COLORS.internet} lineWidth={1.5} transparent opacity={0.5} />
      <Line
        points={[CLOUD_POS, HOSPITAL_ROOF]}
        color={LINK_COLORS.hospital}
        lineWidth={1.5}
        transparent
        opacity={0.6}
      />
    </group>
  );
}

export function Packets() {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const now = performance.now();
    let n = 0;
    for (let i = packetQueue.length - 1; i >= 0; i--) {
      const p = packetQueue[i];
      const f = (now - p.start) / p.duration;
      if (f > 1) {
        packetQueue.splice(i, 1);
        continue;
      }
      if (f < 0 || n >= MAX_PACKETS) continue;
      const path = packetPath(p.tx.link, p.tx.from, p.tx.to, wearableWorld);
      const pos = pointAlong(path, easeInOut(f));
      const longLink = p.tx.link !== "ble" && p.tx.link !== "ble-scale" && p.tx.link !== "uart";
      const base = 0.07 + 0.045 * Math.log10(Math.max(p.tx.bytes, 10));
      const scale = longLink ? base * 5 : base;
      dummy.position.set(pos[0], pos[1], pos[2]);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      m.setMatrixAt(n, dummy.matrix);
      color.set(KIND_COLORS[p.tx.kind]);
      m.setColorAt(n, color);
      n++;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX_PACKETS]} frustumCulled={false}>
      <sphereGeometry args={[1, 14, 14]} />
      <meshStandardMaterial emissive="#ffffff" emissiveIntensity={0.12} toneMapped={false} />
    </instancedMesh>
  );
}

function easeInOut(f: number): number {
  return f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
}
