"use client";
/**
 * Lo que envuelve todas las páginas: el cliente de TanStack Query, motion (solo sus animaciones
 * básicas, cargadas una vez; ninguna si el sistema pide reducir el movimiento) y el registro del
 * service worker.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { type ReactNode, useState } from "react";
import { ServiceWorker } from "./ServiceWorker";

/** Lo que se pide (simulaciones en un worker) no caduca: no se repite al volver a la pestaña. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false } },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  // Un cliente por pestaña, creado en el primer render.
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <LazyMotion features={domAnimation} strict>
          <ServiceWorker>{children}</ServiceWorker>
        </LazyMotion>
      </MotionConfig>
    </QueryClientProvider>
  );
}
