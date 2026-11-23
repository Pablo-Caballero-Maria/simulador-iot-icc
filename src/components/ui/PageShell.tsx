/** Maqueta común de las páginas de texto (estudio económico, cómo funciona). */
import Link from "next/link";
import type { ReactNode } from "react";
import { HeartPulse } from "lucide-react";
import { MEMORIA_URL, REPO_URL } from "@/data/links";
import { ThemeToggle } from "./ThemeToggle";

const NAV_LINK = "rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-100 hover:text-slate-900";

export function PageShell({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <HeartPulse aria-hidden className="h-4 w-4" />
            </span>
            Simulador IoT · Insuficiencia cardíaca
          </Link>
          <nav className="ml-auto flex flex-wrap gap-1 text-xs text-slate-600" aria-label="Páginas">
            <Link href="/" className={NAV_LINK}>
              Simulador 3D
            </Link>
            <Link href="/como-funciona" className={NAV_LINK}>
              Cómo funciona
            </Link>
            <Link href="/economia" className={NAV_LINK}>
              Estudio económico
            </Link>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className={NAV_LINK}>
              Código
            </a>
            <a href={MEMORIA_URL} target="_blank" rel="noreferrer" className={NAV_LINK}>
              Memoria (PDF)
            </a>
          </nav>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="max-w-3xl space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <div className="text-sm leading-relaxed text-slate-600">{intro}</div>
        </div>
        {children}
      </main>
    </div>
  );
}
