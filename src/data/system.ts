/**
 * Contenido descriptivo de la interfaz: niveles del IoT World Forum,
 * componentes del sistema y colores de cada tipo de mensaje. Es el mismo
 * vocabulario que usa la memoria.
 */
import type { IotLevel, LinkId, MessageKind, NodeId } from "@/sim/types";

export const LEVELS: Record<IotLevel, { name: string; color: string; question: string }> = {
  N1: { name: "Dispositivos", color: "#0284c7", question: "¿Qué se mide y sobre qué se actúa?" },
  N2: { name: "Conectividad", color: "#0891b2", question: "¿Cómo llegan los datos y las órdenes?" },
  N3: { name: "Edge / Fog", color: "#059669", question: "¿Qué se procesa antes de salir de casa?" },
  N4: { name: "Acumulación", color: "#65a30d", question: "¿Qué se guarda, dónde y cuánto tiempo?" },
  N5: { name: "Abstracción", color: "#ca8a04", question: "¿Cómo se describen los datos para otros?" },
  N6: { name: "Aplicación", color: "#ea580c", question: "¿Informar, avisar o actuar, y quién decide?" },
  N7: { name: "Procesos", color: "#db2777", question: "¿Qué procesos usan los resultados?" },
  T: { name: "Seguridad y gestión", color: "#7c3aed", question: "¿Cómo se protege y mantiene?" },
};

export interface NodeInfo {
  name: string;
  levels: IotLevel[];
  tech: string[];
  description: string;
  /** Apartado de la memoria. */
  ref: string;
}

export const NODES: Record<NodeId, NodeInfo> = {
  wearable: {
    name: "Wearable torácico",
    levels: ["N1", "N3"],
    tech: [
      "nRF52840 (BLE 5)",
      "Front-end ECG + bioimpedancia",
      "Zephyr + TensorFlow Lite Micro",
      "Li-Po 200 mAh",
      "Elemento seguro",
    ],
    description:
      "Mide ECG continuo a 256 Hz y la impedancia torácica 60 s cada 15 min. Detecta los QRS, calcula 10 rasgos por ventana de 8 s y clasifica el ritmo con una red INT8 de 261 parámetros. Avisa localmente sin depender de la red y envía cada hora un vector de 64 bytes.",
    ref: "6.1, 6.3 y 6.11",
  },
  scale: {
    name: "Báscula BLE",
    levels: ["N1"],
    tech: ["Perfil Weight Scale", "LE Secure Connections"],
    description:
      "Báscula comercial. Envía el peso cada mañana; la estación solo lo acepta si el wearable del paciente está a menos de unos 2 m.",
    ref: "6.10",
  },
  station: {
    name: "Estación domiciliaria (Fog)",
    levels: ["N2", "N3", "N4"],
    tech: [
      "Raspberry Pi Compute Module 5",
      "Módem LTE-M/NB-IoT",
      "Mosquitto local + Docker",
      "MQTT 5 + TLS 1.3",
      "SenML-CBOR",
      "LwM2M (gestión)",
    ],
    description:
      "Recibe los datos por BLE, confirma los eventos con la tira de ECG, calcula el índice de congestión, guarda 72 h sin red y publica por MQTT con QoS 1. Entrega al dispensador las órdenes firmadas.",
    ref: "6.2, 6.3 y 6.10",
  },
  dispenser: {
    name: "Dispensador de diurético",
    levels: ["N1", "N3", "T"],
    tech: [
      "Microcontrolador de seguridad",
      "Firma ECDSA P-256",
      "Cerradura normalmente cerrada",
      "Temporizador hardware",
    ],
    description:
      "Libera la toma basal sin red y solo ejecuta dosis adicionales firmadas por un cardiólogo, sin repetir órdenes, sin superar dos aperturas al día ni bajar de 4 h entre aperturas.",
    ref: "6.1 y 6.13",
  },
  tower: {
    name: "Red móvil del operador",
    levels: ["N2"],
    tech: ["LTE-M", "NB-IoT (respaldo)", "APN privado", "SMS de respaldo"],
    description:
      "LTE-M por defecto; NB-IoT donde la cobertura es peor. Solo conexiones salientes: las órdenes bajan por la sesión MQTT que abre la estación.",
    ref: "6.2",
  },
  cloud: {
    name: "Plataforma en la nube (UE)",
    levels: ["N4", "N5", "N6", "T"],
    tech: [
      "Broker MQTT (Mosquitto)",
      "PostgreSQL + TimescaleDB",
      "HL7 FHIR R4",
      "Motor de alertas y de protocolo",
      "Eclipse Leshan (LwM2M)",
    ],
    description:
      "Ingesta idempotente, series temporales, traducción a FHIR, motor de alertas con escalado y motor de protocolo que propone ajustes de diurético para que los firme un médico.",
    ref: "6.4 a 6.6",
  },
  hospital: {
    name: "Unidad de Cardiología y HaD",
    levels: ["N6", "N7"],
    tech: ["Consola web", "Historia clínica (FHIR)", "Guardia de cardiología", "Centro coordinador 112"],
    description:
      "Enfermería atiende las alertas (críticas 24 h, resto de 8 a 22 h); el cardiólogo firma las órdenes; el centro coordinador activa la ambulancia.",
    ref: "6.7",
  },
  ambulance: {
    name: "Unidad móvil",
    levels: ["N1", "N2", "N7"],
    tech: ["Pasarela móvil", "Router 4G/5G del vehículo", "Emparejamiento fuera de banda"],
    description:
      "Recibe la ubicación, el resumen y la última tira; al llegar, su pasarela se empareja con el wearable y la monitorización continúa en el traslado.",
    ref: "6.10",
  },
};

export const LINK_COLORS: Record<LinkId, string> = {
  ble: "#0891b2",
  "ble-scale": "#06b6d4",
  uart: "#8b5cf6",
  "lte-m": "#d97706",
  "nb-iot": "#ea580c",
  internet: "#64748b",
  hospital: "#2563eb",
  sms: "#db2777",
};

export const LINK_LABELS: Record<LinkId, string> = {
  ble: "BLE",
  "ble-scale": "BLE (báscula)",
  uart: "UART",
  "lte-m": "LTE-M",
  "nb-iot": "NB-IoT",
  internet: "Internet",
  hospital: "Hospital",
  sms: "SMS",
};

export const KIND_COLORS: Record<MessageKind, string> = {
  vector: "#0891b2",
  strip: "#0284c7",
  alert: "#e11d48",
  weight: "#06b6d4",
  raw: "#d97706",
  telemetry: "#94a3b8",
  congestion: "#ca8a04",
  order: "#7c3aed",
  dispense: "#a78bfa",
  control: "#64748b",
  sms: "#db2777",
  console: "#2563eb",
};

export const KIND_LABELS: Record<MessageKind, string> = {
  vector: "Vector horario",
  strip: "Tira de ECG",
  alert: "Alerta",
  weight: "Peso",
  raw: "Señal en bruto",
  telemetry: "Estado",
  congestion: "Índice de congestión",
  order: "Orden firmada",
  dispense: "Dispensador",
  control: "Control",
  sms: "SMS",
  console: "Consola / FHIR",
};
