/** Bloque con la forma de lo que se está cargando (skeleton loader): late suavemente. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;
}
