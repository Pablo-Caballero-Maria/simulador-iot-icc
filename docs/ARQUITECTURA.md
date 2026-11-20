# Arquitectura del simulador

Este documento explica cómo funciona el motor de simulación por dentro. Resume lo que cuenta el apartado 7 de la
memoria, con referencias al código.

## 1. Simulación de eventos discretos

`src/sim/core/scheduler.ts` mantiene una cola de prioridad (montículo binario) de eventos ordenados por instante y,
a igualdad de instante, por orden de inserción. `Simulation.advance(dt)` ejecuta en orden todos los eventos hasta
`now + dt`. Los componentes planifican eventos puntuales (`after`, `at`) o periódicos (`every`):

| Periodo  | Evento                                                                         |
| -------- | ------------------------------------------------------------------------------ |
| 1 s      | Mundo físico (paciente, enlace BLE) y bloque de ECG del wearable               |
| 8 s      | Ventana de clasificación del ritmo                                             |
| 15 min   | Medida de bioimpedancia, respiración y temperatura                             |
| 1 h      | Vector de 64 B del wearable, envío horario de la estación (escalonado), hora   |
| 1 día    | Pesaje (07:10), índice de congestión (08:00), toma basal (09:00), tira (12:00) |
| Variable | Llegada de mensajes, reintentos, atención de alertas, firma, ambulancia…       |

Toda la aleatoriedad pasa por `Rng` (mulberry32 con semilla). Cada componente recibe un generador hijo (`fork`), de
modo que añadir un componente no altera las secuencias de los demás y la misma semilla reproduce la ejecución.

## 2. Paciente (`src/sim/physiology`)

- **Rutina y movimiento**: horario diario (dormir, pesarse, desayunar, salón, paseo de 17 a 18 h…) y recorridos por
  las puertas de la casa (`home.ts`, la misma geometría que dibuja la escena 3D).
- **Ritmo**: episodios programados o provocados (sinusal, FA, TV, extrasístoles, pausa, bradicardia).
  `BeatGenerator` produce los instantes de cada latido con variabilidad respiratoria, irregularidad de la FA, pausas
  compensadoras de las extrasístoles, etc.
- **Congestión**: variable entre 0 y 1,2 que sube durante una descompensación y baja con cada dosis adicional de
  diurético. El peso (+4,2 kg por unidad), la impedancia nocturna (−13 %), la respiración (+7 rpm) y la actividad
  (−45 %) dependen de ella. Con 0,9 el paciente necesitaría ingresar.

## 3. Wearable (`src/sim/wearable`)

1. **Señal** (`ecg.ts`): suma de gaussianas P-Q-R-S-T por latido, QRS ancho en los latidos ventriculares, ondas f en
   la FA, deriva respiratoria, 50 Hz, ruido muscular según la actividad, artefactos de movimiento y cuantización a
   16 bit (±10 mV).
2. **Detector** (`dsp.ts`): filtro 0,5–40 Hz y rechazo de 50 Hz para la señal; paso banda 5–15 Hz, derivada, cuadrado,
   integración de 150 ms y umbrales adaptativos (Pan–Tompkins) para los QRS. Mide la anchura de cada QRS.
3. **Rasgos** (`features.ts`): FC media, RR mínimo y máximo, SDNN, RMSSD, irregularidad, pNN50, anchura del QRS,
   fracción de latidos prematuros y un índice de calidad de la señal.
4. **Red neuronal** (`classifier.ts`): densa 10 → 16 → 5, cuantizada a INT8 (pesos por neurona, sesgos int32,
   recuantización entre capas). Clases: normal, FA o flúter, taquiarritmia ventricular, extrasistolia y ruido.
   La entrena `scripts/train-classifier.ts` con ventanas sintéticas generadas por la propia cadena.
5. **Reglas** (`rules.ts`): TV en dos ventanas seguidas con FC > 150 lpm; FA ≥ 30 s; FA > 110 lpm durante 10 min;
   pausa ≥ 4 s y bradicardias por reglas independientes de la red; electrodo despegado > 1 min.
6. **Energía** (`energy.ts`): corrientes de la Tabla 6 de la memoria; la radio se recalcula con el intervalo de
   conexión, la latencia de periférico, el PHY y los bytes enviados; la vibración y el zumbador se suman por evento.
7. **Formatos** (`payloads.ts`): vector horario de 64 B con CRC-16, alerta de 24 B y tira de 30 s de 15 392 B
   (cabecera de 32 B + 7 680 muestras int16).

**Dos resoluciones**: `SignalFrontEnd` sintetiza y procesa la señal muestra a muestra; `BeatFrontEnd` trabaja con los
instantes de los latidos y un modelo estadístico del detector (aciertos, falsos positivos, anchura del QRS medida
sobre la plantilla). La interfaz usa la primera hasta 120× y la segunda por encima. La red neuronal se entrena con
ventanas de ambas rutas.

## 4. Redes (`src/sim/network`)

- **BLE**: RSSI = potencia − 40 dB − 27·log₁₀(d) − tabiques × 5 dB − cuerpo − pérdidas exteriores + desvanecimiento
  AR(1) de 3 dB. LE Coded por debajo de −85 dBm; desconexión si no se alcanza la sensibilidad (−95 / −103 dBm)
  durante 4 s. Retardo de subida: espera al siguiente evento de conexión, tiempo en el aire y reintentos; de bajada,
  hasta (latencia + 1) intervalos.
- **Red móvil**: LTE-M hasta −118 dBm y NB-IoT hasta −126 dBm, con caudal y retardo por clase de cobertura. Los
  mensajes se transmiten en serie: si no caben, la cola crece.
- **Transporte**: cada PUBLISH paga 22 B por registro TLS 1.3, 52 B por segmento TCP/IPv4, el PUBACK y los ACK; se
  cuentan además el keepalive y el establecimiento diario de la sesión TLS con autenticación mutua.

## 5. Estación (`src/sim/station`)

Decodifica el vector (comprueba el CRC), confirma las alertas de clase 2 analizando la tira con el mismo detector y la
misma red, calcula el índice de congestión, codifica en SenML-CBOR y publica por MQTT 5 con QoS 1 y alias de tema.
Sin red guarda los mensajes y, al volver, espera un tiempo aleatorio (0–600 s) y los envía por prioridad. Si una
alerta crítica no llega a la plataforma en 30 s y hay cobertura, envía un SMS. Entrega las órdenes al
microcontrolador del dispensador, que verifica la firma ECDSA P-256, la secuencia, la validez y los límites.

## 6. Plataforma (`src/sim/cloud`)

Ingesta idempotente por (estación, secuencia), series en memoria, observaciones FHIR, motor de alertas (clase 1:
24 h con escalado a los 2 y 5 min; clase 2: en 4 h de 8 a 22 h) y motor de protocolo: ante congestión propone hasta
tres dosis adicionales de furosemida, que solo se envían cuando el cardiólogo las firma; si el índice mejora, las
restantes se cancelan. El personal se simula con tiempos de respuesta lognormales o lo controla el usuario.

## 7. Interfaz

`src/lib/sim-store.ts` avanza el motor en cada fotograma con un presupuesto de 10 ms de CPU y publica una «foto» del
estado ocho veces por segundo. La escena 3D (`src/components/scene`) lee el motor en cada fotograma y anima los
mensajes que emite el bus de eventos. Los paneles se suscriben a la foto con selectores de zustand.

La interfaz es deliberadamente mínima (tema claro): sobre la escena solo hay el estado resumido, la última explicación
(`Caption`) y el ECG; el resto vive en un único panel lateral (`ToolPanel`) que se abre desde la barra de iconos
(`ToolRail`) y muestra un contenido cada vez. El estado `panel` del store decide cuál está abierto.

## 8. Pruebas

- `src/sim/**/*.test.ts`: vectores de la RFC 8949, tamaños MQTT y TLS, detector de QRS (sensibilidad y VPP ≥ 99 %),
  exactitud de la red, formatos binarios, reglas, energía (ecuaciones 1, 2 y 4 de la memoria), dispensador y firma,
  índice de congestión, enlaces e integración de todos los escenarios.
- `src/components/__tests__`: componentes con Testing Library, incluida la consola conectada al motor y el panel
  lateral (uno a la vez).
- `scripts/smoke.mjs`: abre la web en Chrome sin interfaz y recorre el escenario de taquicardia ventricular.
