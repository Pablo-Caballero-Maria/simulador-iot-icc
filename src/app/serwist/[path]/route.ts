/**
 * /serwist/sw.js (y su mapa de código): el service worker, src/sw/worker.ts empaquetado por esbuild
 * al construir, con la lista de ficheros que precachear (la integración de Serwist con Turbopack).
 * Estático: lo genera `next build` una vez y lo sirve la CDN con `Service-Worker-Allowed: /` para
 * que controle toda la web.
 *
 * Con cacheComponents no existen `dynamic` ni `revalidate`, que es como Serwist marca su ruta como
 * estática: aquí su GET va dentro de una función con "use cache", y generateStaticParams hace que
 * cada fichero se prerenderice en el build.
 */
import { createSerwistRoute } from "@serwist/turbopack";
import { OFFLINE_FALLBACK } from "@/sw/pages";
import { buildRevision } from "@/sw/revision";

const serwist = createSerwistRoute({
  swSrc: "src/sw/worker.ts",
  useNativeEsbuild: true,
  additionalPrecacheEntries: [{ url: OFFLINE_FALLBACK, revision: buildRevision() }],
  // Un script clásico (no un módulo): lo ejecuta cualquier navegador con service workers.
  esbuildOptions: { format: "iife" },
});

export const { generateStaticParams } = serwist;

/** Un fichero del service worker, construido una sola vez. */
async function serviceWorkerFile(path: string): Promise<{ body: string; type: string }> {
  "use cache";
  const response = await serwist.GET(new Request("http://localhost/"), { params: Promise.resolve({ path }) });
  return { body: await response.text(), type: response.headers.get("content-type") ?? "text/plain" };
}

export async function GET(_request: Request, { params }: RouteContext<"/serwist/[path]">): Promise<Response> {
  const { body, type } = await serviceWorkerFile((await params).path);
  return new Response(body, { headers: { "Content-Type": type, "Service-Worker-Allowed": "/" } });
}
