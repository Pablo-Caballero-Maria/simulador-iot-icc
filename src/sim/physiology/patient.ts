/**
 * Modelo del paciente: fisiología (congestión, peso, impedancia, respiración,
 * ritmo cardíaco), rutina diaria y movimiento por la casa.
 *
 * Es la «realidad» de la simulación. Los dispositivos solo la conocen a
 * través de lo que miden, con su ruido y sus limitaciones; la verdad se guarda
 * aparte para evaluar el sistema (sensibilidad, antelación…).
 */
import type { Rng } from "../core/rng";
import { DAY, HOUR, dayIndex, hourOfDay, timeAt } from "../core/time";
import { clamp } from "../core/stats";
import type { SimParams } from "../params";
import { SPOTS, type SpotId, type Vec2, distance, pathBetween, roomAt } from "./home";
import type { HeartState, Rhythm, SignalCondition } from "./rhythm";

export type Posture = "supine" | "sitting" | "upright" | "walking";

interface ScheduleEntry {
  from: number;
  spot: SpotId;
  posture: Posture;
  activity: number;
  label: string;
}

/** Rutina diaria del paciente (hora de inicio de cada actividad). */
const SCHEDULE: ScheduleEntry[] = [
  { from: 0, spot: "bed", posture: "supine", activity: 0.02, label: "Durmiendo" },
  { from: 7.0, spot: "scale", posture: "upright", activity: 0.3, label: "Aseo y pesaje" },
  { from: 7.35, spot: "kitchenTable", posture: "sitting", activity: 0.3, label: "Desayuno" },
  { from: 8.95, spot: "stationFront", posture: "upright", activity: 0.25, label: "Toma de la medicación" },
  { from: 9.15, spot: "sofa", posture: "sitting", activity: 0.1, label: "En el salón" },
  { from: 13.0, spot: "kitchenTable", posture: "sitting", activity: 0.3, label: "Comida" },
  { from: 14.5, spot: "bed", posture: "supine", activity: 0.05, label: "Siesta" },
  { from: 16.0, spot: "sofa", posture: "sitting", activity: 0.1, label: "En el salón" },
  { from: 17.0, spot: "street", posture: "walking", activity: 0.8, label: "Paseo" },
  { from: 18.0, spot: "sofa", posture: "sitting", activity: 0.1, label: "En el salón" },
  { from: 21.0, spot: "kitchenTable", posture: "sitting", activity: 0.3, label: "Cena" },
  { from: 21.5, spot: "sofa", posture: "sitting", activity: 0.1, label: "En el salón" },
  { from: 23.0, spot: "bed", posture: "supine", activity: 0.02, label: "Durmiendo" },
];

/** Episodio de ritmo programado (escenario) o aleatorio. */
export interface RhythmEpisode {
  start: number;
  end: number;
  rhythm: Rhythm;
  /** FC del episodio; si falta se usa la del ritmo sinusal. */
  hr?: number;
}

export interface ConditionEpisode {
  start: number;
  end: number;
  condition: SignalCondition;
}

/** Umbral de congestión a partir del cual el paciente necesitaría ingreso. */
export const ADMISSION_CONGESTION = 0.9;

const WALK_SPEED_INDOOR = 0.8;
const WALK_SPEED_OUTDOOR = 1.1;
/** Cada cuánto se cambia el parche de electrodos, s. */
export const PATCH_CHANGE_PERIOD = 3.5 * DAY;

export class Patient {
  private readonly rhythmEpisodes: RhythmEpisode[] = [];
  private readonly conditionEpisodes: ConditionEpisode[] = [];
  /** Congestión (0 = euvolemia; 0,9 = ingreso). */
  private congestion = 0;
  private congestionT: number;
  private decompRate = 0;
  private decompEnd = 0;
  private extraDosesTaken = 0;
  private readonly activeDoses: number[] = [];
  private _admittedAt: number | null = null;

  // Movimiento
  private pos: Vec2;
  private walkPath: Vec2[] = [];
  private walkFrom: Vec2;
  private walkStart = 0;
  private walkSegment = 0;
  private currentEntry: ScheduleEntry;
  private visit: { spot: SpotId; until: number; label: string } | null = null;
  private lyingOnDevice = false;
  private lastNight = -1;
  private patchChanges: number[] = [];

  constructor(
    private readonly params: SimParams,
    private readonly rng: Rng,
    startTime: number,
  ) {
    this.congestionT = startTime;
    this.currentEntry = this.scheduleAt(startTime);
    this.pos = { ...SPOTS[this.currentEntry.spot] };
    this.walkFrom = { ...this.pos };
    // Cambios de parche: cada 3,5 días a las 10:00, el primero hace dos días (antes del inicio).
    for (let d = -14; d < 400; d++) {
      const t = timeAt(0, 10) + (d * PATCH_CHANGE_PERIOD) / 1;
      this.patchChanges.push(t - 2 * DAY);
    }
  }

  // -------------------------------------------------------------------------
  // Escenarios y eventos externos
  // -------------------------------------------------------------------------

  addRhythmEpisode(ep: RhythmEpisode): void {
    this.rhythmEpisodes.push(ep);
    this.rhythmEpisodes.sort((a, b) => a.start - b.start);
  }

  addConditionEpisode(ep: ConditionEpisode): void {
    this.conditionEpisodes.push(ep);
    this.conditionEpisodes.sort((a, b) => a.start - b.start);
  }

  /** Termina en `t` cualquier episodio de ritmo en curso (p. ej. tras la asistencia). */
  endRhythmEpisodes(t: number): void {
    for (const ep of this.rhythmEpisodes) if (ep.start <= t && ep.end > t) ep.end = t;
  }

  /** Inicia una descompensación congestiva: la congestión sube `ratePerDay` durante `days` días. */
  startDecompensation(t: number, ratePerDay: number, days: number): void {
    this.advanceCongestion(t);
    this.decompRate = ratePerDay;
    this.decompEnd = t + days * DAY;
  }

  /** Fija la congestión inicial (para escenarios que empiezan ya descompensados). */
  setCongestion(t: number, value: number): void {
    this.advanceCongestion(t);
    this.congestion = value;
  }

  /** El paciente toma una dosis adicional de diurético. */
  takeExtraDiuretic(t: number): void {
    this.advanceCongestion(t);
    this.activeDoses.push(t);
    this.extraDosesTaken++;
  }

  /** El paciente no toma la dosis basal: algo más de retención ese día. */
  missBasalDose(t: number): void {
    this.advanceCongestion(t);
    this.congestion = clamp(this.congestion + 0.03, 0, 1.2);
  }

  /** Pide al paciente que vaya a un lugar durante un tiempo (p. ej. al dispensador). */
  requestVisit(spot: SpotId, t: number, durationS: number, label: string): void {
    this.visit = { spot, until: t + durationS, label };
    this.startWalk(t, SPOTS[spot]);
  }

  get admittedAt(): number | null {
    return this._admittedAt;
  }

  get extraDoses(): number {
    return this.extraDosesTaken;
  }

  // -------------------------------------------------------------------------
  // Evolución continua
  // -------------------------------------------------------------------------

  /** Avanza el estado continuo hasta `t` (se llama en cada tick de la simulación). */
  update(t: number): void {
    this.advanceCongestion(t);
    if (this._admittedAt === null && this.congestion >= ADMISSION_CONGESTION) this._admittedAt = t;

    // Sorteo nocturno: ¿dormirá sobre el costado del wearable?
    const day = dayIndex(t);
    if (day !== this.lastNight && hourOfDay(t) >= 23) {
      this.lastNight = day;
      this.lyingOnDevice = this.rng.chance(this.params.patient.lyingOnDeviceProb);
    }

    // Rutina y visitas.
    if (this.visit && t >= this.visit.until) this.visit = null;
    const entry = this.scheduleAt(t);
    if (!this.visit && entry !== this.currentEntry) {
      this.currentEntry = entry;
      this.startWalk(t, SPOTS[entry.spot]);
    }
    this.advanceWalk(t);

    // Artefactos de movimiento al caminar (señal ruidosa unos segundos).
    if (this.isWalking(t) && this.rng.chance(1 / 90)) {
      const len = this.rng.uniform(8, 24);
      this.addConditionEpisode({ start: t, end: t + len, condition: "noisy" });
    }
  }

  private advanceCongestion(t: number): void {
    const dtDays = (t - this.congestionT) / DAY;
    if (dtDays <= 0) return;
    let rate = 0;
    if (t <= this.decompEnd) {
      // El tratamiento corrige la causa: la subida se frena con cada dosis adicional.
      const factor = this.extraDosesTaken === 0 ? 1 : this.extraDosesTaken === 1 ? 0.5 : 0;
      rate += this.decompRate * factor;
    }
    // Cada dosis adicional elimina 0,12 de congestión repartida en 12 horas.
    for (const d of this.activeDoses) {
      if (t > d && this.congestionT < d + 0.5 * DAY) rate -= 0.24;
    }
    // Lenta vuelta a la normalidad con el tratamiento basal.
    if (this.congestion > 0 && rate <= 0) rate -= 0.02;
    this.congestion = clamp(this.congestion + rate * dtDays, 0, 1.2);
    this.congestionT = t;
  }

  // -------------------------------------------------------------------------
  // Magnitudes fisiológicas (la «verdad»)
  // -------------------------------------------------------------------------

  congestionAt(t: number): number {
    this.advanceCongestion(t);
    return this.congestion;
  }

  heartStateAt(t: number): HeartState {
    const respRate = this.respRateAt(t);
    for (const ep of this.rhythmEpisodes) {
      if (ep.start > t) break;
      if (t < ep.end) {
        return { rhythm: ep.rhythm, hr: ep.hr ?? this.sinusHrAt(t), episodeEnd: ep.end, respRate };
      }
    }
    return { rhythm: "sinus", hr: this.sinusHrAt(t), episodeEnd: Number.POSITIVE_INFINITY, respRate };
  }

  conditionAt(t: number): SignalCondition {
    let cond: SignalCondition = "clean";
    for (const ep of this.conditionEpisodes) {
      if (ep.start > t) break;
      if (t < ep.end) {
        if (ep.condition === "lead-off") return "lead-off";
        cond = ep.condition;
      }
    }
    return cond;
  }

  sinusHrAt(t: number): number {
    const factor: Record<Posture, number> = { supine: 0.88, sitting: 1, upright: 1.06, walking: 1.3 };
    const slow = 3 * Math.sin((2 * Math.PI * t) / (3.1 * HOUR));
    return this.params.patient.restingHr * factor[this.postureAt(t)] + 8 * this.congestion + slow;
  }

  respRateAt(t: number): number {
    const posture = this.postureAt(t);
    const base = 14 + 7 * this.congestion;
    return base + (posture === "walking" ? 3 : posture === "supine" ? -1 : 0);
  }

  activityAt(t: number): number {
    const a = this.isWalking(t) ? 0.8 : this.currentActivity();
    return a * (1 - 0.45 * clamp(this.congestion, 0, 1));
  }

  postureAt(t: number): Posture {
    if (this.isWalking(t)) return "walking";
    if (this.visit) return "upright";
    return this.currentEntry.posture;
  }

  /** Peso en báscula (con ruido de la medida y variación diaria). */
  weighKg(): number {
    return this.params.patient.dryWeightKg + 4.2 * this.congestion + this.rng.normal(0, 0.25);
  }

  /** Impedancia transtorácica medida, Ω (cae al acumularse líquido). */
  thoracicImpedance(t: number): number {
    const posture = this.postureAt(t);
    const postureOffset = posture === "supine" ? 0 : 2;
    return 50 * (1 - 0.13 * this.congestion) + postureOffset + this.patchOffset(t) + this.rng.normal(0, 0.25);
  }

  /** Temperatura cutánea, °C. */
  skinTemperature(t: number): number {
    return 33.6 + 0.4 * Math.sin((2 * Math.PI * (hourOfDay(t) - 15)) / 24) + this.rng.normal(0, 0.05);
  }

  /** Último cambio de parche anterior a `t`. */
  lastPatchChange(t: number): number {
    let last = Number.NEGATIVE_INFINITY;
    for (const c of this.patchChanges) {
      if (c <= t) last = c;
      else break;
    }
    return last;
  }

  private patchOffset(t: number): number {
    const since = t - this.lastPatchChange(t);
    return since >= 0 && since < 2 * DAY ? 2.5 * Math.exp(-since / (0.6 * DAY)) : 0;
  }

  /** Atenuación del cuerpo sobre la señal BLE del wearable, dB. */
  bodyLossDb(t: number): number {
    return this.postureAt(t) === "supine" ? (this.lyingOnDevice ? 14 : 6) : 3;
  }

  // -------------------------------------------------------------------------
  // Movimiento
  // -------------------------------------------------------------------------

  position(): Vec2 {
    return this.pos;
  }

  activityLabel(): string {
    if (this.visit) return this.visit.label;
    return this.currentEntry.label;
  }

  isAway(): boolean {
    return roomAt(this.pos) === "calle";
  }

  private currentActivity(): number {
    return this.visit ? 0.25 : this.currentEntry.activity;
  }

  private isWalking(t: number): boolean {
    return this.walkPath.length > 0 && t >= this.walkStart;
  }

  private scheduleAt(t: number): ScheduleEntry {
    const h = hourOfDay(t);
    let entry = SCHEDULE[0];
    for (const e of SCHEDULE) if (e.from <= h) entry = e;
    if (entry.spot === "street" && !this.params.patient.dailyWalk) {
      return { ...entry, spot: "sofa", posture: "sitting", activity: 0.1, label: "En el salón" };
    }
    return entry;
  }

  private startWalk(t: number, target: Vec2): void {
    if (distance(this.pos, target) < 0.05) {
      this.walkPath = [];
      return;
    }
    this.walkPath = pathBetween(this.pos, target);
    this.walkFrom = { ...this.pos };
    this.walkStart = t;
    this.walkSegment = 0;
  }

  private advanceWalk(t: number): void {
    if (this.walkPath.length === 0) return;
    let elapsed = t - this.walkStart;
    let from = this.walkFrom;
    for (let i = 0; i < this.walkPath.length; i++) {
      const to = this.walkPath[i];
      const outdoor = roomAt(to) === "calle" || roomAt(from) === "calle" || roomAt(to) === "jardin";
      const speed = outdoor ? WALK_SPEED_OUTDOOR : WALK_SPEED_INDOOR;
      const segTime = distance(from, to) / speed;
      if (elapsed < segTime) {
        const f = segTime > 0 ? elapsed / segTime : 1;
        this.pos = { x: from.x + (to.x - from.x) * f, z: from.z + (to.z - from.z) * f };
        this.walkSegment = i;
        return;
      }
      elapsed -= segTime;
      from = to;
    }
    this.pos = { ...this.walkPath[this.walkPath.length - 1] };
    this.walkPath = [];
  }
}
