/**
 * Parámetros ajustables de la simulación.
 *
 * Los valores por defecto son los del diseño descrito en la memoria; cada
 * control indica el apartado de la memoria donde se justifica, para que la web
 * y el documento digan lo mismo.
 */

export type ProcessingMode = "edge" | "raw";
export type Fidelity = "auto" | "signal" | "beat";
export type CellularTech = "auto" | "lte-m" | "nb-iot";
export type StaffMode = "auto" | "manual";

export interface SimParams {
  patient: {
    /** Peso seco (sin retención de líquido), kg. */
    dryWeightKg: number;
    /** Frecuencia cardíaca en reposo, lpm. */
    restingHr: number;
    /** Paseo diario por el exterior (17:00–18:00), fuera del alcance BLE. */
    dailyWalk: boolean;
    /** Probabilidad de que el paciente tome la pastilla cuando el dispensador la libera. */
    adherence: number;
    /** Probabilidad de dormir sobre el costado del wearable (más atenuación). */
    lyingOnDeviceProb: number;
  };
  wearable: {
    /** «edge»: procesado en el wearable (escenario optimizado); «raw»: envío en bruto (escenario base). */
    mode: ProcessingMode;
    /** Resolución del modelo de ECG: señal completa, nivel de latido o automática según la velocidad. */
    fidelity: Fidelity;
    batteryCapacityMah: number;
    /** Fracción de la capacidad nominal utilizable (85 %). */
    usableFraction: number;
    /** Salud de la batería (1 = nueva, 0,8 = envejecida). */
    batteryHealth: number;
    /** Carga inicial, %. */
    initialSocPct: number;
    /** Periodo del vector de rasgos, s. */
    vectorPeriodS: number;
    /** FC por encima de la cual una taquiarritmia ventricular es crítica, lpm. */
    vtHrThreshold: number;
    /** Duración mínima de una FA para avisar, s. */
    afMinSeconds: number;
    /** Pausa mínima sin latidos para alarma crítica, s. */
    pauseSeconds: number;
    /** Tira diaria programada de 30 s. */
    dailyStrip: boolean;
  };
  ble: {
    /** Intervalo de conexión, s. */
    connIntervalS: number;
    /** Latencia de periférico (eventos que el wearable puede saltarse). */
    peripheralLatency: number;
    /** Por debajo de este RSSI se pasa a LE Coded, dBm. */
    codedThresholdDbm: number;
    txPowerDbm: number;
    /** Pérdida por tabique, dB. */
    wallLossDb: number;
    /** Probabilidad de colisión con Wi-Fi u otros usuarios de 2,4 GHz. */
    interference: number;
  };
  station: {
    stationId: string;
    /** Espera aleatoria máxima al reconectar tras un corte, s. */
    backoffMaxS: number;
    /** Intervalo de keepalive MQTT, s. */
    keepAliveS: number;
    /** Usa alias de tema de MQTT 5 para no repetir el tema en cada mensaje. */
    topicAlias: boolean;
    /** Aviso por SMS de las alertas críticas si la plataforma no responde. */
    smsFallback: boolean;
    /** Periodo de subida del flujo en bruto en el escenario base, s. */
    rawUploadPeriodS: number;
  };
  cellular: {
    technology: CellularTech;
    /** Potencia de señal recibida en el domicilio (RSRP), dBm. */
    rsrpDbm: number;
    /** Probabilidad de perder el PUBACK de MQTT (provoca un duplicado). */
    pubackLoss: number;
  };
  cloud: {
    /** Tiempo medio de proceso en la plataforma (ingesta, reglas y envío a la consola), s. */
    platformLatencyS: number;
    /** Umbral del índice de congestión para generar alerta. */
    congestionThreshold: number;
  };
  staff: {
    /** «auto»: el personal simulado responde; «manual»: el usuario actúa desde la consola. */
    mode: StaffMode;
    /** Mediana del tiempo de atención de una alerta crítica de día, s. */
    dayAckMedianS: number;
    /** Mediana del tiempo de atención de una alerta crítica de noche, s. */
    nightAckMedianS: number;
    /** Mediana del tiempo que tarda el cardiólogo en firmar una propuesta (de 8 a 22 h), min. */
    signMedianMin: number;
    /** Hay analítica reciente (potasio y creatinina) para validar la propuesta. */
    labsAvailable: boolean;
    /** Tiempo de llegada de la ambulancia, min. */
    ambulanceTravelMin: number;
  };
  dispenser: {
    /** Hora de la toma basal. */
    basalHour: number;
    /** Hora preferida para la dosis adicional. */
    extraDoseHour: number;
    /** Intervalo mínimo entre aperturas impuesto por hardware, h. */
    minIntervalH: number;
    /** Aperturas máximas al día. */
    maxDailyOpenings: number;
    /** Validez de una orden firmada, h. */
    orderValidityH: number;
  };
  economy: {
    /** Tarifa de datos de referencia, €/MB (capítulo 5). */
    eurPerMb: number;
  };
}

export const DEFAULT_PARAMS: SimParams = {
  patient: {
    dryWeightKg: 78,
    restingHr: 68,
    dailyWalk: true,
    adherence: 0.95,
    lyingOnDeviceProb: 0.3,
  },
  wearable: {
    mode: "edge",
    fidelity: "auto",
    batteryCapacityMah: 200,
    usableFraction: 0.85,
    batteryHealth: 1,
    initialSocPct: 100,
    vectorPeriodS: 3600,
    vtHrThreshold: 150,
    afMinSeconds: 30,
    pauseSeconds: 4,
    dailyStrip: true,
  },
  ble: {
    connIntervalS: 1,
    peripheralLatency: 4,
    codedThresholdDbm: -85,
    txPowerDbm: 0,
    wallLossDb: 5,
    interference: 0.05,
  },
  station: {
    stationId: "est-0042",
    backoffMaxS: 600,
    keepAliveS: 1200,
    topicAlias: true,
    smsFallback: true,
    rawUploadPeriodS: 30,
  },
  cellular: {
    technology: "auto",
    rsrpDbm: -100,
    pubackLoss: 0.01,
  },
  cloud: {
    platformLatencyS: 1.5,
    congestionThreshold: 50,
  },
  staff: {
    mode: "auto",
    dayAckMedianS: 40,
    nightAckMedianS: 90,
    signMedianMin: 45,
    labsAvailable: true,
    ambulanceTravelMin: 12,
  },
  dispenser: {
    basalHour: 9,
    extraDoseHour: 15,
    minIntervalH: 4,
    maxDailyOpenings: 2,
    orderValidityH: 24,
  },
  economy: {
    eurPerMb: 0.02,
  },
};

/** Copia profunda de los parámetros (son datos planos). */
export function cloneParams(p: SimParams): SimParams {
  return structuredClone(p);
}

/** Aplica cambios parciales anidados sobre una copia de `base`. */
export function mergeParams(base: SimParams, patch: ParamPatch): SimParams {
  const out = cloneParams(base);
  for (const group of Object.keys(patch) as (keyof SimParams)[]) {
    Object.assign(out[group], patch[group]);
  }
  return out;
}

export type ParamPatch = { [G in keyof SimParams]?: Partial<SimParams[G]> };

// ---------------------------------------------------------------------------
// Metadatos para la interfaz: etiqueta, rango y explicación de cada control.
// ---------------------------------------------------------------------------

interface ControlBase {
  group: keyof SimParams;
  /** Clave dentro del grupo (los tests comprueban que existe en DEFAULT_PARAMS). */
  key: string;
  label: string;
  help: string;
  /** Apartado de la memoria donde se justifica el valor por defecto. */
  ref: string;
}

export interface RangeControl extends ControlBase {
  kind: "range";
  min: number;
  max: number;
  step: number;
  unit: string;
  /** Factor de presentación (p. ej. 100 para mostrar fracciones como %). */
  scale?: number;
}

export interface ToggleControl extends ControlBase {
  kind: "toggle";
}

export interface SelectControl extends ControlBase {
  kind: "select";
  options: { value: string; label: string }[];
}

export type ParamControl = RangeControl | ToggleControl | SelectControl;

export interface ControlGroup {
  id: keyof SimParams;
  title: string;
  level: string;
  controls: ParamControl[];
}

export const CONTROL_GROUPS: ControlGroup[] = [
  {
    id: "wearable",
    title: "Wearable",
    level: "N1 · N3",
    controls: [
      {
        kind: "select",
        group: "wearable",
        key: "mode",
        label: "Procesado",
        help: "Optimizado: el wearable clasifica el ritmo y solo envía vectores horarios y eventos. Base: envía las señales en bruto y todo se procesa en la nube.",
        ref: "4.3",
        options: [
          { value: "edge", label: "Optimizado (en el borde)" },
          { value: "raw", label: "Base (envío en bruto)" },
        ],
      },
      {
        kind: "range",
        group: "wearable",
        key: "batteryHealth",
        label: "Salud de la batería",
        help: "Capacidad que conserva la batería. El requisito de 14 días se comprueba con el 80 %.",
        ref: "4.2 (RNF-02)",
        min: 0.5,
        max: 1,
        step: 0.05,
        unit: "%",
        scale: 100,
      },
      {
        kind: "range",
        group: "wearable",
        key: "initialSocPct",
        label: "Carga inicial",
        help: "Carga de la batería al empezar. Por debajo del 20 % y del 10 % avisa; al 5 % pasa a modo de solo alarmas.",
        ref: "6.1 (1.5)",
        min: 3,
        max: 100,
        step: 1,
        unit: "%",
      },
      {
        kind: "range",
        group: "wearable",
        key: "vtHrThreshold",
        label: "Umbral de FC para TV crítica",
        help: "Una taquiarritmia ventricular es crítica si supera esta frecuencia en dos ventanas seguidas de 8 s.",
        ref: "6.11",
        min: 120,
        max: 200,
        step: 5,
        unit: "lpm",
      },
      {
        kind: "range",
        group: "wearable",
        key: "afMinSeconds",
        label: "Duración mínima de FA",
        help: "La FA solo genera alerta si dura al menos este tiempo. Más corto, más sensible pero más falsas alarmas.",
        ref: "6.6 (6.3)",
        min: 8,
        max: 120,
        step: 8,
        unit: "s",
      },
      {
        kind: "select",
        group: "wearable",
        key: "fidelity",
        label: "Resolución del ECG",
        help: "Señal: se genera y filtra el ECG muestra a muestra (256 Hz). Latido: se trabaja con los instantes de cada latido, para simular días en segundos. Automática: elige según la velocidad.",
        ref: "7",
        options: [
          { value: "auto", label: "Automática" },
          { value: "signal", label: "Señal (256 Hz)" },
          { value: "beat", label: "Latido a latido" },
        ],
      },
    ],
  },
  {
    id: "ble",
    title: "Enlace BLE",
    level: "N2",
    controls: [
      {
        kind: "range",
        group: "ble",
        key: "connIntervalS",
        label: "Intervalo de conexión",
        help: "Cada cuánto se encuentran wearable y estación. Más corto, menos retardo y más consumo.",
        ref: "6.2 (2.6)",
        min: 0.05,
        max: 2,
        step: 0.05,
        unit: "s",
      },
      {
        kind: "range",
        group: "ble",
        key: "peripheralLatency",
        label: "Latencia de periférico",
        help: "Eventos de conexión que el wearable puede saltarse si no tiene nada que enviar. Ahorra energía, pero una orden hacia el wearable puede tardar (latencia + 1) × intervalo.",
        ref: "6.2 (2.6)",
        min: 0,
        max: 9,
        step: 1,
        unit: "",
      },
      {
        kind: "range",
        group: "ble",
        key: "codedThresholdDbm",
        label: "Umbral de LE Coded",
        help: "Con menos señal que este valor el enlace cambia a LE Coded: unas cuatro veces más alcance a cambio de más tiempo en el aire.",
        ref: "6.2 (2.3)",
        min: -95,
        max: -70,
        step: 1,
        unit: "dBm",
      },
      {
        kind: "range",
        group: "ble",
        key: "interference",
        label: "Interferencia en 2,4 GHz",
        help: "Probabilidad de que un paquete choque con Wi-Fi, microondas u otros dispositivos. BLE reintenta y salta de canal.",
        ref: "6.2 (2.7)",
        min: 0,
        max: 0.5,
        step: 0.01,
        unit: "%",
        scale: 100,
      },
    ],
  },
  {
    id: "cellular",
    title: "Red móvil",
    level: "N2",
    controls: [
      {
        kind: "select",
        group: "cellular",
        key: "technology",
        label: "Tecnología",
        help: "LTE-M por defecto y NB-IoT como respaldo cuando la cobertura es peor (tolera unos 8 dB más de pérdidas).",
        ref: "6.2 (2.3)",
        options: [
          { value: "auto", label: "Automática (LTE-M → NB-IoT)" },
          { value: "lte-m", label: "Solo LTE-M" },
          { value: "nb-iot", label: "Solo NB-IoT" },
        ],
      },
      {
        kind: "range",
        group: "cellular",
        key: "rsrpDbm",
        label: "Cobertura (RSRP)",
        help: "Nivel de señal de la red móvil en el domicilio. Por debajo de −118 dBm LTE-M deja de funcionar y por debajo de −126 dBm tampoco NB-IoT.",
        ref: "6.2 (2.3)",
        min: -135,
        max: -70,
        step: 1,
        unit: "dBm",
      },
      {
        kind: "range",
        group: "cellular",
        key: "pubackLoss",
        label: "Pérdida de confirmaciones",
        help: "Probabilidad de perder el PUBACK de MQTT. La estación reenvía el mensaje y la plataforma descarta el duplicado por su número de secuencia.",
        ref: "6.4 (4.3)",
        min: 0,
        max: 0.3,
        step: 0.01,
        unit: "%",
        scale: 100,
      },
    ],
  },
  {
    id: "station",
    title: "Estación (Fog)",
    level: "N3",
    controls: [
      {
        kind: "range",
        group: "station",
        key: "keepAliveS",
        label: "Keepalive MQTT",
        help: "Si no hay tráfico, la estación envía un PINGREQ con este periodo para mantener la sesión abierta y poder recibir órdenes.",
        ref: "6.2 (2.6)",
        min: 60,
        max: 3600,
        step: 60,
        unit: "s",
      },
      {
        kind: "range",
        group: "station",
        key: "backoffMaxS",
        label: "Espera máxima al reconectar",
        help: "Tras un corte, cada estación espera un tiempo aleatorio antes de reenviar para no saturar la plataforma.",
        ref: "6.2 (2.5)",
        min: 0,
        max: 1800,
        step: 30,
        unit: "s",
      },
      {
        kind: "toggle",
        group: "station",
        key: "topicAlias",
        label: "Alias de tema (MQTT 5)",
        help: "Sustituye el tema por un número de 2 bytes tras el primer mensaje.",
        ref: "6.10",
      },
      {
        kind: "toggle",
        group: "station",
        key: "smsFallback",
        label: "SMS de respaldo",
        help: "Si la plataforma no confirma una alerta crítica en 30 s pero hay cobertura, la estación envía un SMS sin datos identificables.",
        ref: "6.3 (3.2)",
      },
    ],
  },
  {
    id: "staff",
    title: "Hospital",
    level: "N6 · N7",
    controls: [
      {
        kind: "select",
        group: "staff",
        key: "mode",
        label: "Personal clínico",
        help: "Automático: enfermería y cardiología simuladas atienden alertas y firman. Manual: lo haces tú desde la pestaña Consola.",
        ref: "6.7",
        options: [
          { value: "auto", label: "Simulado" },
          { value: "manual", label: "Yo atiendo la consola" },
        ],
      },
      {
        kind: "range",
        group: "staff",
        key: "dayAckMedianS",
        label: "Atención de críticas (día)",
        help: "Mediana del tiempo que tarda enfermería en atender una alerta crítica. A los 2 min se avisa a una segunda persona y a los 5 min al 112.",
        ref: "6.7 (7.2)",
        min: 5,
        max: 600,
        step: 5,
        unit: "s",
      },
      {
        kind: "range",
        group: "staff",
        key: "signMedianMin",
        label: "Firma del cardiólogo",
        help: "Mediana del tiempo hasta que el cardiólogo revisa y firma una propuesta de diurético (solo de 8 a 22 h).",
        ref: "6.7 (7.2)",
        min: 5,
        max: 240,
        step: 5,
        unit: "min",
      },
      {
        kind: "toggle",
        group: "staff",
        key: "labsAvailable",
        label: "Analítica reciente",
        help: "Sin potasio y creatinina recientes la propuesta de diurético queda bloqueada.",
        ref: "6.13",
      },
      {
        kind: "range",
        group: "staff",
        key: "ambulanceTravelMin",
        label: "Llegada de la ambulancia",
        help: "Tiempo desde la activación hasta que la ambulancia llega al domicilio.",
        ref: "6.7",
        min: 5,
        max: 45,
        step: 1,
        unit: "min",
      },
    ],
  },
  {
    id: "patient",
    title: "Paciente",
    level: "N1",
    controls: [
      {
        kind: "toggle",
        group: "patient",
        key: "dailyWalk",
        label: "Paseo diario",
        help: "De 17 a 18 h el paciente sale y queda fuera del alcance BLE: el wearable sigue detectando y guarda los datos.",
        ref: "6.2 (2.2)",
      },
      {
        kind: "range",
        group: "patient",
        key: "adherence",
        label: "Adherencia",
        help: "Probabilidad de que el paciente retire la pastilla cuando el dispensador la libera.",
        ref: "6.1",
        min: 0.5,
        max: 1,
        step: 0.05,
        unit: "%",
        scale: 100,
      },
    ],
  },
];
