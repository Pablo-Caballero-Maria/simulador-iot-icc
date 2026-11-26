/**
 * Las pocas animaciones de la interfaz (motion), cortas y sutiles, definidas aquí para que se
 * parezcan entre sí. Solo se anima lo que aparece tras una acción, nunca el contenido
 * prerenderizado (quedaría oculto hasta que cargue el JavaScript), y nada si el sistema pide
 * reducir el movimiento (MotionConfig en Providers.tsx).
 */
import type { Transition } from "motion/react";

export const EASE_OUT: Transition = { duration: 0.18, ease: [0.22, 1, 0.36, 1] };

/** Aparece subiendo unos píxeles; se va igual. */
export const rise = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: EASE_OUT,
} as const;

/** Solo un fundido (para filas de tabla, que no deben moverse). */
export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.25 },
} as const;
