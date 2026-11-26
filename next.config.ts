import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { deploymentOptions, securityHeaders } from "./src/lib/security-headers";

/** Lo que el CSP base no cubre: el worker del texto 3D (troika) se crea desde un blob. */
const EXTRA_SOURCES = { "script-src": ["blob:"], "worker-src": ["blob:"] };

// withSerwist deja esbuild, que construye el service worker (src/app/serwist/[path]/route.ts),
// fuera del bundle del servidor. Todas las respuestas llevan las cabeceras de seguridad de
// src/lib/security-headers.ts (CSP, HSTS, sin incrustar…).
const baseConfig = (phase: string): NextConfig => ({
  poweredByHeader: false,
  async headers() {
    const options = { ...deploymentOptions(), dev: phase === PHASE_DEVELOPMENT_SERVER, extra: EXTRA_SOURCES };
    return [{ source: "/(.*)", headers: securityHeaders(options) }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Sin conexión, una navegación o un prefetch fallidos esperan a que vuelva en lugar de lanzar un
  // error (el service worker sirve las páginas guardadas; esto cubre las de la propia app).
  experimental: { useOffline: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
});

/** Next.js la llama con la fase en que se ejecuta (`next dev`, `next build`, `next start`…). */
const nextConfig = (phase: string): NextConfig => withSerwist(baseConfig(phase));

export default nextConfig;
