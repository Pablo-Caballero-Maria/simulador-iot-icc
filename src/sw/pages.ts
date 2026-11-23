/**
 * Las páginas que el service worker descarga al instalarse, para que la web abra sin conexión
 * aunque no se hayan visitado: el simulador (que corre entero en el navegador) y las de texto.
 */
export const OFFLINE_PAGES = ["/", "/como-funciona", "/economia"];

/** Lo que se ve, sin conexión, en una página que no está guardada (src/app/~offline/page.tsx). */
export const OFFLINE_FALLBACK = "/~offline";

/** Caché de las páginas (primero la red: con conexión, siempre la más nueva). */
export const PAGES_CACHE = "pages";
