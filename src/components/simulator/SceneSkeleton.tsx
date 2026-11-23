/**
 * Esqueleto de la escena 3D mientras se descargan three.js y los modelos (skeleton loader): el
 * cielo, el suelo y la silueta de la casa, la torre, la nube y el hospital donde van a aparecer.
 */
import { Skeleton } from "@/components/ui/Skeleton";

export function SceneSkeleton() {
  return (
    <div
      className="relative h-full w-full overflow-hidden bg-slate-100"
      role="status"
      aria-label="Cargando escena 3D"
      data-testid="escena-cargando"
    >
      <Skeleton className="absolute inset-x-0 bottom-0 h-2/5 rounded-none" />
      <Skeleton className="absolute bottom-[34%] left-[12%] h-[22%] w-[18%]" />
      <Skeleton className="absolute bottom-[34%] left-[40%] h-[38%] w-[3%]" />
      <Skeleton className="absolute top-[16%] left-[54%] h-[12%] w-[16%] rounded-full" />
      <Skeleton className="absolute right-[10%] bottom-[34%] h-[28%] w-[16%]" />
      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-slate-500">Cargando escena 3D…</span>
    </div>
  );
}
