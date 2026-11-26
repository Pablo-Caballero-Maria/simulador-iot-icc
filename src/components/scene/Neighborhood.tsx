"use client";
/**
 * El barrio alrededor del domicilio: aceras, marcas viales y un paso de cebra, farolas que se
 * encienden al anochecer, árboles, casas vecinas, coches aparcados y un pequeño parque en la zona
 * del paseo (ROOMS.calle). Todo queda fuera de los recorridos del paciente y de la ambulancia.
 */
import { Bench, Bushes, Car, FlowerBed, NeighbourHouse, Pines, RoadMarks, StreetLamps, Trees } from "./Props";
import type { V3 } from "./positions";

/** La carretera principal va a lo largo de x, de -25 a 75, centrada en z = 13 (Ground). */
const ROAD_Z = 13;
/** La calle del hospital sale hacia el sur entre x = 38,3 y 41,7. */
const SIDE_ROAD_X = 40;

const range = (from: number, to: number, step: number) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

/** Línea discontinua del centro, sin cruzar la salida hacia el hospital ni el paso de cebra. */
const LANE_DASHES = range(-22, 72, 4)
  .filter((x) => Math.abs(x - SIDE_ROAD_X) > 3 && Math.abs(x - 34) > 2.5)
  .map((x) => ({ p: [x, 0.012, ROAD_Z] as V3 }));

/** Paso de cebra frente al hospital: franjas a lo largo de la calzada, una tras otra. */
const ZEBRA = range(11.6, 14.4, 0.7).map((z) => ({ p: [34, 0.013, z] as V3 }));

/** Farolas en la acera norte, con el brazo hacia la calzada. */
const LAMPS = [-14, -5, 9, 17, 25, 33, 47, 56, 65].map((x) => ({ p: [x, 0, 10.75] as V3, rotY: -Math.PI / 2 }));

const TREES = [
  // detrás y a los lados de la casa
  { p: [-4, 0, -7] as V3, s: 1.1 },
  { p: [3.5, 0, -7.2] as V3 },
  { p: [-8.5, 0, -1] as V3, s: 1.2 },
  { p: [8.5, 0, 2] as V3 },
  { p: [9.5, 0, 8.5] as V3, s: 0.9 },
  // acera sur y parque del paseo
  { p: [-18, 0, 16.4] as V3 },
  { p: [-9, 0, 16.4] as V3, s: 1.1 },
  { p: [16, 0, 19.5] as V3, s: 1.2 },
  { p: [23, 0, 20.5] as V3 },
  { p: [30.5, 0, 19.5] as V3, s: 1.1 },
  // alrededor del hospital
  { p: [49.5, 0, 19] as V3 },
  { p: [50, 0, 29] as V3, s: 1.2 },
  { p: [34, 0, 29.5] as V3 },
];

const PINES = [
  { p: [18, 0, -12] as V3, s: 1.3 },
  { p: [30, 0, -11] as V3, s: 1.1 },
  { p: [29, 0, -21] as V3, s: 1.4 },
  { p: [19, 0, -21] as V3 },
  { p: [-24, 0, -8] as V3, s: 1.5 },
  { p: [-26, 0, 3] as V3, s: 1.3 },
  { p: [60, 0, -4] as V3, s: 1.6 },
];

const BUSHES = [
  { p: [15, 0, 17] as V3 },
  { p: [26.5, 0, 17] as V3, s: 1.2 },
  { p: [36.5, 0, 18.5] as V3 },
  { p: [43.5, 0, 18.5] as V3 },
  { p: [-12, 0, -9.5] as V3, s: 1.3 },
  { p: [10.5, 0, -9.5] as V3 },
];

export function Neighborhood() {
  return (
    <group>
      {/* Aceras a ambos lados de la carretera */}
      <mesh rotation-x={-Math.PI / 2} position={[25, 0.008, 10.85]} receiveShadow>
        <planeGeometry args={[100, 0.9]} />
        <meshStandardMaterial color="#e7e5e4" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[25, 0.008, 15.15]} receiveShadow>
        <planeGeometry args={[100, 0.9]} />
        <meshStandardMaterial color="#e7e5e4" />
      </mesh>
      <RoadMarks marks={LANE_DASHES} size={[2, 0.15]} />
      <RoadMarks marks={ZEBRA} size={[2.6, 0.4]} />

      <StreetLamps lamps={LAMPS} />
      <Trees trees={TREES} />
      <Pines pines={PINES} />
      <Bushes bushes={BUSHES} />

      {/* Casas vecinas: una fila detrás del domicilio y otra al otro lado de la carretera */}
      <NeighbourHouse p={[-18, 0, -13]} wall="#f5e6d3" roof="#b45309" chimney />
      <NeighbourHouse p={[-7, 0, -13.5]} w={8} wall="#e0f2fe" roof="#475569" />
      <NeighbourHouse p={[5, 0, -13]} w={6} d={5} wall="#fef3c7" roof="#9a3412" chimney />
      <NeighbourHouse p={[-17, 0, 21]} rotY={Math.PI} wall="#ede9fe" roof="#7c2d12" />
      <NeighbourHouse p={[-6, 0, 21.5]} rotY={Math.PI} w={8} h={5.5} wall="#f1f5f9" roof="#334155" />
      <NeighbourHouse p={[4.5, 0, 21]} rotY={Math.PI} w={6} wall="#dcfce7" roof="#b91c1c" chimney />

      {/* Coches aparcados en la acera sur */}
      <Car p={[-12, 0, 16.6]} rotY={Math.PI / 2} color="#2563eb" />
      <Car p={[7.5, 0, 16.6]} rotY={-Math.PI / 2} color="#dc2626" />
      <Car p={[12.5, 0, 16.6]} rotY={Math.PI / 2} color="#e5e7eb" />

      {/* Parque del paseo */}
      <Bench p={[19.5, 0, 17.4]} rotY={Math.PI} />
      <Bench p={[27, 0, 18.6]} rotY={Math.PI} />
      <FlowerBed p={[23, 0, 17.4]} w={2.4} />
      <FlowerBed p={[31, 0, 17.4]} w={1.6} />
    </group>
  );
}
