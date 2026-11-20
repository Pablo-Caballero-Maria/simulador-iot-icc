/**
 * Escenarios predefinidos: cada uno prepara una situación del apartado 7 de
 * la memoria y explica qué se va a ver.
 */
import { DAY, HOUR, MINUTE } from "./core/time";
import { deriveKeyPair, signOrder } from "./cloud/signing";
import { CLINICIAN_KEY_LABEL } from "./cloud/platform";
import { DEFAULT_PARAMS, type ParamPatch, type SimParams, mergeParams } from "./params";
import type { DoseOrder } from "./records";
import { Simulation } from "./simulation";
import type { NodeId } from "./types";

export type ScenarioId =
  "normal" | "vt" | "af" | "pause" | "decompensation" | "outage" | "away" | "attack" | "raw" | "battery";

export interface Scenario {
  id: ScenarioId;
  title: string;
  /** Una frase para el selector. */
  summary: string;
  /** Qué observar, en orden. */
  watch: string[];
  /** Hora del día a la que empieza (se avanza en modo rápido hasta ella). */
  startHour: number;
  /** Velocidad recomendada (× tiempo real). */
  speed: number;
  params?: ParamPatch;
  focus: NodeId;
  setup?: (sim: Simulation) => void;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "normal",
    title: "Un día normal",
    summary: "Rutina de un paciente estable: vectores horarios, pesaje, toma basal y paseo fuera de alcance.",
    watch: [
      "Cada hora el wearable envía 64 bytes por BLE y la estación los publica en SenML-CBOR.",
      "A las 07:10 el paciente se pesa; a las 08:00 la estación calcula el índice de congestión; a las 09:00 el dispensador libera la toma basal.",
      "De 17 a 18 h sale a pasear: el wearable guarda los datos y los envía al volver.",
      "Fíjate en los datos por día: unas decenas de KB frente a los 70 MB del envío en bruto.",
    ],
    startHour: 6.9,
    speed: 300,
    focus: "station",
  },
  {
    id: "vt",
    title: "Taquicardia ventricular",
    summary: "Arritmia crítica: aviso local en el wearable, alerta en la consola en segundos y ambulancia.",
    watch: [
      "El wearable clasifica dos ventanas seguidas de 8 s como taquiarritmia ventricular y vibra sin esperar a la red.",
      "La alerta y la tira de 30 s viajan por BLE, LTE-M y MQTT hasta la consola: mira el desglose de retardos.",
      "Enfermería atiende la alerta y el centro coordinador envía la ambulancia, que se empareja con el wearable al llegar.",
    ],
    startHour: 10.5,
    speed: 5,
    focus: "wearable",
    setup: (sim) => sim.triggerRhythm("vt", 40 * MINUTE, 185, 25),
  },
  {
    id: "af",
    title: "Fibrilación auricular",
    summary: "Arritmia no crítica: alerta de clase 2 tras 30 s y confirmación con la tira en la estación.",
    watch: [
      "La red clasifica las ventanas como FA por la irregularidad del intervalo RR.",
      "A los 32 s (cuatro ventanas) se genera la alerta de clase 2; la estación la confirma con la tira antes de enviarla.",
      "Si la FA se mantiene más de 10 min con más de 110 lpm llega una segunda alerta.",
    ],
    startHour: 11,
    speed: 10,
    focus: "station",
    setup: (sim) => sim.triggerRhythm("af", 25 * MINUTE, 122, 20),
  },
  {
    id: "pause",
    title: "Pausa de 6 segundos",
    summary: "Asistolia breve detectada por una regla independiente de la red neuronal.",
    watch: [
      "Durante 6 s no hay latidos: la regla de pausa (≥ 4 s) salta aunque la red no la haya visto nunca.",
      "Es una alerta de clase 1: vibración inmediata y aviso a la consola.",
    ],
    startHour: 15,
    speed: 2,
    focus: "wearable",
    setup: (sim) => sim.triggerRhythm("pause", 6, undefined, 20),
  },
  {
    id: "decompensation",
    title: "Descompensación congestiva",
    summary: "Diez días en un minuto: el índice de congestión avisa días antes y el diurético se ajusta en casa.",
    watch: [
      "El paciente retiene líquido: sube el peso y baja la impedancia nocturna.",
      "Hacia el tercer día el índice supera el umbral: alerta de clase 2 y propuesta de diurético.",
      "El cardiólogo firma; la orden baja firmada y el dispensador la verifica y libera la dosis.",
      "Compara con la línea «sin sistema»: el paciente habría ingresado hacia el día 8.",
    ],
    startHour: 7.9,
    speed: 21600,
    focus: "dispenser",
    setup: (sim) => sim.patient.startDecompensation(sim.now, 0.11, 10),
  },
  {
    id: "outage",
    title: "Corte de la red móvil",
    summary: "Tres horas sin datos con una arritmia en medio: alarma local, SMS y envío diferido.",
    watch: [
      "Se cae la red de datos del operador. La estación sigue funcionando sola.",
      "A los 20 min aparece una taquicardia: el wearable vibra igual, porque no depende de la red.",
      "La alerta no llega a la plataforma: a los 30 s la estación envía un SMS de respaldo.",
      "Al volver la red, espera un tiempo aleatorio y envía lo guardado por prioridad.",
    ],
    startHour: 12,
    speed: 30,
    focus: "station",
    setup: (sim) => {
      sim.scheduler.after(5 * MINUTE, "scenario-outage-on", () => sim.setCellularOutage(true));
      sim.scheduler.after(3 * HOUR, "scenario-outage-off", () => sim.setCellularOutage(false));
      sim.triggerRhythm("vt", 3 * MINUTE, 178, 20 * MINUTE);
    },
  },
  {
    id: "away",
    title: "Fuera de casa",
    summary: "El paciente sale a pasear y tiene una FA lejos de la estación.",
    watch: [
      "Al alejarse, el enlace pasa a LE Coded y luego se pierde.",
      "La FA se detecta igual en el wearable; la alerta y la tira se guardan en la flash.",
      "Al volver, se envían primero las alertas y después el resto.",
    ],
    startHour: 16.9,
    speed: 30,
    params: { patient: { dailyWalk: true } },
    focus: "wearable",
    setup: (sim) => sim.triggerRhythm("af", 4 * MINUTE, 118, 25 * MINUTE),
  },
  {
    id: "attack",
    title: "Seguridad: órdenes falsas",
    summary: "Un atacante controla la plataforma e intenta liberar medicación.",
    watch: [
      "Primero envía una orden con una firma inventada: el microcontrolador del dispensador la rechaza.",
      "Después reenvía una orden auténtica que ya se ejecutó: se rechaza por estar repetida.",
      "Ni la estación ni la nube tienen la clave del cardiólogo: lo peor que puede hacer el atacante es bloquear el servicio.",
    ],
    startHour: 10,
    speed: 5,
    focus: "dispenser",
    setup: (sim) => {
      // Orden auténtica ejecutada ayer (la que el atacante intentará repetir).
      const keys = deriveKeyPair(CLINICIAN_KEY_LABEL);
      const order: DoseOrder = {
        orderId: "ORD-AYER-1",
        seq: 1,
        patient: "pac-7f3a",
        drug: "Furosemida 40 mg (dosis adicional)",
        doseMg: 40,
        validFrom: sim.now - DAY,
        validUntil: sim.now + 6 * HOUR,
        proposedAt: sim.now - DAY,
        reason: "Índice de congestión 58",
        status: "tomada",
        history: [{ t: sim.now - DAY, status: "tomada" }],
        signedBy: "Cardiólogo de guardia",
        signedAt: sim.now - DAY,
      };
      order.signature = signOrder(order, keys.secretKey);
      sim.platform.orders.push(order);
      sim.dispenser.markExecuted(order);
      sim.scheduler.after(40, "scenario-attack-1", () => sim.injectAttack("forged"));
      sim.scheduler.after(3 * MINUTE, "scenario-attack-2", () => sim.injectAttack("replay"));
    },
  },
  {
    id: "raw",
    title: "Escenario base: todo a la nube",
    summary: "Sin procesado en el borde: 70 MB al día, menos batería y alertas que dependen de la red.",
    watch: [
      "El wearable envía las señales en bruto (6 064 bit/s): mira los datos por día y la autonomía.",
      "Llega una taquicardia: la detecta la nube cuando recibe el bloque de 30 s, y el aviso al paciente tiene que volver por la red.",
      "Compara con el escenario «Taquicardia ventricular».",
    ],
    startHour: 10.5,
    speed: 10,
    params: { wearable: { mode: "raw" } },
    focus: "cloud",
    setup: (sim) => sim.triggerRhythm("vt", 30 * MINUTE, 185, 60),
  },
  {
    id: "battery",
    title: "Batería baja",
    summary: "El paciente olvida cargar el wearable: avisos al 20 % y al 10 % y modo de solo alarmas al 5 %.",
    watch: [
      "La batería envejecida (80 %) empieza al 22 %.",
      "Al 20 % avisa al paciente; al 10 % la plataforma crea una tarea para enfermería.",
      "Al 5 % apaga la bioimpedancia y el acelerómetro, pero sigue vigilando las arritmias.",
    ],
    startHour: 8,
    speed: 21600,
    params: { wearable: { initialSocPct: 22, batteryHealth: 0.8 } },
    focus: "wearable",
  },
];

export function getScenario(id: ScenarioId): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`Escenario desconocido: ${id}`);
  return s;
}

/** Parámetros efectivos de un escenario a partir de unos parámetros base. */
export function scenarioParams(id: ScenarioId, base: SimParams = DEFAULT_PARAMS): SimParams {
  const s = getScenario(id);
  return s.params ? mergeParams(base, s.params) : base;
}

/**
 * Crea una simulación lista para un escenario: avanza en modo rápido hasta la
 * hora de inicio y prepara los episodios.
 */
export function createScenario(id: ScenarioId, base: SimParams = DEFAULT_PARAMS, seed = 42): Simulation {
  const scenario = getScenario(id);
  const sim = new Simulation({ params: scenarioParams(id, base), seed });
  sim.fastForwardTo(scenario.startHour);
  scenario.setup?.(sim);
  sim.narrate({
    level: "N7",
    title: `Escenario: ${scenario.title}`,
    text: scenario.summary,
    tone: "info",
    focus: scenario.focus,
  });
  return sim;
}
