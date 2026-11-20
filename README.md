# Simulador IoT · Insuficiencia cardíaca

Simulación 3D e interactiva de un sistema IoT Edge–Fog–Cloud para monitorizar en casa a pacientes dados de alta tras un
ingreso por insuficiencia cardíaca. Acompaña a la memoria del trabajo final de la asignatura _Internet of Things_ (Máster
Universitario en Inteligencia Computacional e IoT, Universidad de Córdoba), que está en [`memoria/`](memoria/).

La web no es una animación: ejecuta un modelo del sistema completo, desde el corazón del paciente hasta la consola del
hospital, y cada mensaje que se ve viajar lleva bytes reales codificados con su protocolo.

| Nivel (IoT World Forum) | Qué se simula                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| N1 Dispositivos         | Paciente con ritmo cardíaco, congestión, peso, impedancia y rutina por la casa; wearable, báscula y dispensador            |
| N2 Conectividad         | BLE (LE 1M / LE Coded, alcance, reconexión) y LTE-M / NB-IoT (cobertura, caudal, retardo, cortes)                          |
| N3 Edge / Fog           | ECG a 256 Hz, detector de QRS de Pan–Tompkins, red neuronal INT8 de 261 parámetros, reglas de alerta, índice de congestión |
| N4 Acumulación          | MQTT 5 con QoS 1 sobre TLS 1.3, envío diferido, ingesta idempotente                                                        |
| N5 Abstracción          | SenML sobre CBOR (RFC 8428 y 8949) y observaciones HL7 FHIR con códigos LOINC                                              |
| N6 Aplicación           | Motor de alertas con escalado y propuesta de diurético firmada con ECDSA P-256 (autonomía A3)                              |
| N7 Procesos             | Enfermería, cardiología, centro coordinador y ambulancia                                                                   |

## Uso

```bash
npm install
npm run dev          # http://localhost:3000
```

La escena 3D ocupa toda la pantalla y solo muestra lo imprescindible: el estado resumido (ritmo, BLE, red móvil y
batería), la última explicación y el ECG del wearable. En la barra superior se elige el escenario (día normal,
taquicardia ventricular, fibrilación auricular, pausa, descompensación congestiva, corte de la red móvil, paciente fuera
de casa, ataque con órdenes falsas, envío en bruto, batería baja), la velocidad y se pausa o reinicia. El resto de la
información se abre bajo demanda, de una en una, desde la barra lateral:

| Panel       | Qué muestra                                                                      |
| ----------- | -------------------------------------------------------------------------------- |
| Explicación | Historial de lo que ocurre, etiquetado con su nivel del modelo, y «qué observar» |
| Parámetros  | Los parámetros del diseño (valores por defecto de la memoria), por grupos        |
| Provocar    | Arritmias, artefactos, corte de red, báscula usada por otra persona, ataques     |
| Datos       | Objetivos de la memoria en directo; datos, energía, clasificador y congestión    |
| Mensajes    | Cada paquete con sus bytes, cabeceras, CBOR y FHIR                               |
| Consola     | Alertas con la cadena de retardos y órdenes de diurético para firmar             |
| Guía        | Recorrido guiado por los siete niveles del IoT World Forum                       |

## Scripts

| Script                     | Para qué                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`              | Servidor de desarrollo                                                              |
| `npm run build` / `start`  | Compilación y servidor de producción                                                |
| `npm test`                 | Tests unitarios y de integración (Vitest)                                           |
| `npm run test:coverage`    | Tests con cobertura                                                                 |
| `npm run test:e2e`         | Prueba de humo en Chrome sin interfaz (requiere `npm run build` y Chrome instalado) |
| `npm run check`            | Lint, tipos, formato y tests                                                        |
| `npm run train:classifier` | Vuelve a entrenar y cuantizar la red del wearable                                   |
| `npm run results`          | Ejecuta todos los escenarios con varias semillas y guarda las cifras de la memoria  |

## Estructura

```
src/
  sim/            Motor de simulación (TypeScript puro, sin React)
    core/         Planificador de eventos, generador aleatorio, tiempo, estadística
    physiology/   Paciente, ritmo cardíaco, síntesis de ECG, geometría de la casa
    wearable/     DSP, rasgos, red INT8, reglas, energía, formatos binarios
    network/      BLE, red móvil, coste TLS/TCP/IP
    protocols/    CBOR, SenML, MQTT 5, FHIR
    station/      Estación Fog, índice de congestión, dispensador, báscula
    cloud/        Plataforma (broker, alertas, protocolo) y firma de órdenes
    simulation.ts Ensamblado y avance del sistema
    scenarios.ts  Escenarios guiados
    economics.ts  Modelo económico (apartado 6.15)
  components/     Interfaz: escena 3D (React Three Fiber), paneles y páginas
  lib/            Estado (zustand) y bucle de simulación en el navegador
  app/            Rutas de Next.js: /, /como-funciona, /economia
scripts/          Entrenamiento del clasificador, resultados y prueba de humo
memoria/          Memoria del trabajo (PDF) y sus figuras
```

La documentación técnica del motor está en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## Tecnologías

Next.js 16 (App Router), React 19, TypeScript estricto, Tailwind CSS 4, three.js con React Three Fiber y drei, zustand,
@noble/curves (ECDSA), Vitest y Testing Library, Playwright (prueba de humo), ESLint y Prettier. Despliegue en Vercel.

## Licencia

MIT. Los datos fisiológicos son sintéticos; el simulador no es un producto sanitario.
