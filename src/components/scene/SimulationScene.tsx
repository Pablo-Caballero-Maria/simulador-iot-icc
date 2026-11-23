"use client";
/**
 * Escena 3D completa. Se carga solo en el navegador (WebGL) desde
 * SimulatorApp mediante `next/dynamic` sin SSR.
 */
import { useEffect, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Color, Vector3, type DirectionalLight, type HemisphereLight } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useSimStore } from "@/lib/sim-store";
import { SCENE_COLORS } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";
import { Dispenser, Scale, Station } from "./Devices";
import { House } from "./House";
import { Ambulance, CellTower, CloudPlatform, Ground, Hospital } from "./Infrastructure";
import { Links, Packets } from "./Network";
import { Patient } from "./Patient";
import { CAMERA_PRESETS } from "./positions";

export default function SimulationScene() {
  const select = useSimStore((s) => s.selectNode);
  const { sky } = SCENE_COLORS[useTheme()];
  return (
    <Canvas
      shadows
      camera={{ position: CAMERA_PRESETS.general.position, fov: 42, near: 0.1, far: 600 }}
      dpr={[1, 1.5]}
      onPointerMissed={() => select(null)}
      aria-label="Escena 3D del sistema: domicilio, red móvil, nube y hospital"
    >
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 90, 220]} />
      <DayNightLights />
      <Ground />
      <House />
      <Station />
      <Dispenser />
      <Scale />
      <Patient />
      <CellTower />
      <CloudPlatform />
      <Hospital />
      <Ambulance />
      <Links />
      <Packets />
      <CameraRig />
    </Canvas>
  );
}

/** Luz del sol según la hora simulada. */
function DayNightLights() {
  const sun = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const day = useRef(new Color("#fff7e6"));
  const night = useRef(new Color("#a5b4fc"));
  useFrame(() => {
    const sim = useSimStore.getState().sim;
    if (!sim || !sun.current || !hemi.current) return;
    const h = (((sim.now / 3600 + 6) % 24) + 24) % 24;
    const elevation = Math.sin(((h - 6) / 12) * Math.PI); // > 0 de 6 a 18 h
    const daylight = Math.max(0, elevation);
    sun.current.intensity = 1.1 + 1.4 * daylight;
    sun.current.color.copy(night.current).lerp(day.current, daylight);
    sun.current.position.set(Math.cos(((h - 6) / 12) * Math.PI) * 60, 15 + 50 * daylight, 30);
    hemi.current.intensity = 1.3 + 0.5 * daylight;
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={["#ffffff", "#cbd5e1", 1.4]} />
      <ambientLight intensity={0.45} />
      <directionalLight
        ref={sun}
        position={[30, 50, 30]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
    </>
  );
}

/** Mueve la cámara con suavidad al punto de vista elegido. */
function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const preset = useSimStore((s) => s.cameraPreset);
  const { camera, size } = useThree();
  const goal = useRef<{ position: Vector3; target: Vector3; until: number } | null>(null);
  // En pantallas verticales (móvil) la cámara se aleja para que quepa la escena.
  const portrait = size.width < size.height;
  const distanceFactor = portrait ? Math.min(2, (size.height / size.width) ** 0.9) : 1;

  useEffect(() => {
    const p = CAMERA_PRESETS[preset];
    const target = new Vector3(...p.target);
    const position = new Vector3(...p.position).sub(target).multiplyScalar(distanceFactor).add(target);
    goal.current = { position, target, until: performance.now() + 1400 };
  }, [preset, distanceFactor]);

  useFrame((_, delta) => {
    const g = goal.current;
    const c = controls.current;
    if (!g || !c) return;
    const k = Math.min(1, delta * 3);
    camera.position.lerp(g.position, k);
    c.target.lerp(g.target, k);
    c.update();
    if (performance.now() > g.until) goal.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={CAMERA_PRESETS.general.target}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={2}
      maxDistance={180}
      enableDamping
    />
  );
}
