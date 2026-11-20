/** Recorrido guiado por los siete niveles del modelo del IoT World Forum. */
import type { CameraPreset } from "@/lib/sim-store";
import type { IotLevel, NodeId } from "@/sim/types";

export interface TourStep {
  level?: IotLevel;
  title: string;
  text: string;
  camera: CameraPreset;
  node?: NodeId;
}

export const TOUR: TourStep[] = [
  {
    title: "Un sistema IoT para pacientes con insuficiencia cardíaca",
    text: "Tras un ingreso por insuficiencia cardíaca, el paciente vuelve a casa con un wearable en el pecho, una báscula y una estación con dispensador de diurético. El objetivo es detectar a tiempo la retención de líquido y las arritmias, y actuar sin esperar a urgencias. Este recorrido sigue los siete niveles del modelo del IoT World Forum.",
    camera: "general",
  },
  {
    level: "N1",
    title: "Dispositivos: medir y actuar",
    text: "El wearable mide ECG continuo (256 Hz) y la impedancia del tórax, que baja cuando se acumula líquido. La báscula da el peso de cada mañana. El dispensador es el actuador: libera la medicación. Haz clic sobre cada uno para ver su ficha.",
    camera: "paciente",
    node: "wearable",
  },
  {
    level: "N2",
    title: "Conectividad: dos redes distintas",
    text: "Dentro de casa, BLE: pocos metros y muy poca energía; si la señal baja, LE Coded. Fuera, LTE-M con NB-IoT de respaldo: la estación es la única que habla con Internet y solo abre conexiones salientes. Mira el color de las líneas.",
    camera: "red",
    node: "tower",
  },
  {
    level: "N3",
    title: "Edge y Fog: decidir cerca del paciente",
    text: "El wearable clasifica el ritmo con una red neuronal INT8 de 261 parámetros y vibra ante una arritmia grave sin depender de la red. La estación confirma los eventos con la tira de ECG, calcula el índice de congestión y guarda hasta 72 h si no hay red. Así se pasa de unos 70 MB a menos de 100 KB al día.",
    camera: "casa",
    node: "station",
  },
  {
    level: "N4",
    title: "Acumulación: guardar sin duplicar",
    text: "MQTT con QoS 1 garantiza que los mensajes llegan al menos una vez; la plataforma descarta los duplicados por el par estación–secuencia y guarda las series temporales.",
    camera: "red",
    node: "cloud",
  },
  {
    level: "N5",
    title: "Abstracción: que otros entiendan los datos",
    text: "Dentro del sistema, SenML sobre CBOR (compacto). En la frontera con el hospital, HL7 FHIR con códigos LOINC, el formato que entiende la historia clínica. Abre la pestaña «Mensajes» para ver los bytes reales.",
    camera: "red",
    node: "cloud",
  },
  {
    level: "N6",
    title: "Aplicación: informar, avisar o actuar",
    text: "Las alertas llegan a la consola por prioridad. El ajuste del diurético es apoyo a la decisión (A3): el sistema propone, el cardiólogo firma y el dispensador solo ejecuta órdenes con firma válida.",
    camera: "hospital",
    node: "hospital",
  },
  {
    level: "N7",
    title: "Procesos: quién hace qué",
    text: "Enfermería atiende las críticas las 24 h (con escalado a los 2 y 5 min), revisa el resto en 4 h y el centro coordinador envía la ambulancia, cuya pasarela se empareja con el wearable al llegar.",
    camera: "hospital",
    node: "ambulance",
  },
  {
    level: "T",
    title: "Seguridad y gestión",
    text: "Cada dispositivo tiene su identidad en un elemento seguro, el firmware se actualiza firmado y las órdenes de dosis llevan la firma del médico. Prueba el escenario «Seguridad: órdenes falsas».",
    camera: "casa",
    node: "dispenser",
  },
  {
    title: "Ahora, experimenta",
    text: "Elige un escenario en el panel izquierdo, cambia los parámetros (intervalo BLE, cobertura, umbrales…) y mira cómo cambian las estadísticas. Todo lo que ves se calcula: no es una animación grabada.",
    camera: "general",
  },
];
