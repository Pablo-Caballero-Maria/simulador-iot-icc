/**
 * La revisión del build, para los ficheros precacheados cuya URL no cambia entre builds (la página
 * sin conexión): el commit que construye Vercel, si no el commit local de git, y si no uno al azar.
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

export function buildRevision(env: Readonly<Record<string, string | undefined>> = process.env): string {
  if (env.VERCEL_GIT_COMMIT_SHA) return env.VERCEL_GIT_COMMIT_SHA;
  const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  return (git.status === 0 && git.stdout.trim()) || randomUUID();
}
