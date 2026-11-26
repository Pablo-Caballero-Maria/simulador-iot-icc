/**
 * Los mensajes entre la página y el worker de la semana normal, validados con zod en los dos
 * sentidos: lo que llega por postMessage no lo comprueba TypeScript.
 */
import { z } from "@/lib/zod";
import type { NormalWeekRun } from "@/sim/experiments";

export const workerRequestSchema = z.object({
  seed: z.number().int().nonnegative(),
  days: z.number().positive().max(31).default(7),
});

export type WorkerRequest = z.input<typeof workerRequestSchema>;

const finite = z.number().refine(Number.isFinite, { error: "No es un número finito." });

export const normalWeekRunSchema = z.object({
  seed: z.number().int(),
  days: z.number(),
  blePerDay: finite,
  wanPerDay: finite,
  payloadPerDay: finite,
  autonomy: finite,
  current: finite,
  accuracy: z.number().min(0).max(1),
  windows: z.number().int().nonnegative(),
  falseAlerts: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative(),
  bleCodedPct: finite,
  bleDisconnectedPct: finite,
  duplicates: z.number().int().nonnegative(),
}) satisfies z.ZodType<NormalWeekRun>;

export const workerReplySchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), run: normalWeekRunSchema }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export type WorkerReply = z.infer<typeof workerReplySchema>;
