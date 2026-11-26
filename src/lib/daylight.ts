/**
 * La luz del día según la hora simulada, para la escena 3D: el sol, el cielo y las farolas.
 * La simulación empieza a las 06:00 (sim.now = 0).
 */

/** Hora del día (0–24) que corresponde a `now` segundos de simulación. */
export const simHour = (now: number): number => (((now / 3600 + 6) % 24) + 24) % 24;

/** Altura del sol: 1 a mediodía, 0 al amanecer y al anochecer (6 y 18 h), negativa de noche. */
export const sunElevation = (now: number): number => Math.sin(((simHour(now) - 6) / 12) * Math.PI);

/** Cuánto luce el sol (0–1). */
export const daylight = (now: number): number => Math.max(0, sunElevation(now));

/**
 * Cuánto lucen las farolas (0–1): apagadas de día, se encienden poco a poco al atardecer, cuando
 * el sol baja de un 25 % de su altura, y del todo cuando se ha puesto.
 */
export const streetLights = (now: number): number => Math.min(1, Math.max(0, (0.25 - sunElevation(now)) / 0.25));
