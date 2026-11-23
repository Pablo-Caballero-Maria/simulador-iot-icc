import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

// withSerwist deja esbuild, que construye el service worker (src/app/serwist/[path]/route.ts),
// fuera del bundle del servidor.
const nextConfig: NextConfig = {
  poweredByHeader: false,
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
};

export default withSerwist(nextConfig);
