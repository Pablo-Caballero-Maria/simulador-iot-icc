/**
 * Qué peticiones atiende el service worker (worker.ts) y cómo. Funciones puras de la petición, para
 * probarlas sin un service worker.
 */

/** Lo que Serwist pasa a cada regla de caché (la parte que se usa aquí). */
export interface RequestInfo {
  url: URL;
  request: Pick<Request, "mode" | "destination">;
  sameOrigin: boolean;
}

/** Abrir o recargar una de las páginas de la web. */
export const isPage = ({ request, sameOrigin }: RequestInfo): boolean => sameOrigin && request.mode === "navigate";

/** La página de respaldo es solo para documentos (una imagen o un script que falta, falla sin más). */
export const isDocument = ({ request }: Pick<RequestInfo, "request">): boolean => request.destination === "document";
