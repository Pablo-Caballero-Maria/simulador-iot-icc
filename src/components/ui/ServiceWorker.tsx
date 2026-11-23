"use client";
/**
 * Registra el service worker (src/sw/worker.ts, servido en /serwist/sw.js) en los builds de
 * producción, para que el simulador abra y funcione sin conexión. En `next dev` no: allí las
 * páginas cambian a cada momento.
 */
import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";

export function ServiceWorker({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={process.env.NODE_ENV !== "production"}
      // Recuperar la conexión no debe recargar la página en mitad de una simulación.
      reloadOnOnline={false}
      options={{ scope: "/", type: "classic" }}
    >
      {children}
    </SerwistProvider>
  );
}
