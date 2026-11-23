import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "Sin conexión", robots: { index: false } };

/** Lo que muestra el service worker, sin conexión, para una página que no tiene guardada. */
export default function Offline() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md space-y-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <WifiOff aria-hidden className="mx-auto h-8 w-8 text-slate-400" />
        <h1 className="text-lg font-semibold text-slate-900">Sin conexión</h1>
        <p className="text-sm text-slate-600">
          Esta página aún no está guardada en el dispositivo. El simulador y las páginas de texto funcionan sin conexión
          una vez abierta la web.
        </p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-800"
        >
          Volver al simulador
        </Link>
      </div>
    </main>
  );
}
