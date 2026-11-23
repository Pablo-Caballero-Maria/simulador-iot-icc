import { Skeleton } from "@/components/ui/Skeleton";

/** Esqueleto de una página de texto (cómo funciona, economía) mientras se carga al navegar. */
export default function Loading() {
  return (
    <div className="min-h-dvh bg-slate-50" aria-busy="true" aria-label="Cargando">
      <div className="h-12 border-b border-slate-200 bg-white" />
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-80 max-w-full" />
        <Skeleton className="h-4 w-full max-w-3xl" />
        <Skeleton className="h-4 w-2/3 max-w-2xl" />
        <div className="grid gap-4 pt-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    </div>
  );
}
