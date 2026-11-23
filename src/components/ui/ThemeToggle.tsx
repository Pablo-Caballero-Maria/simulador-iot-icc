"use client";
/** Botón de la barra que cambia entre el tema claro (el de siempre) y el oscuro, y lo recuerda. */
import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, currentTheme, oppositeTheme, storeTheme } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useTheme();
  // El script de <head> ya puso data-theme; el color del navegador lo sigue. Se lee del DOM, no de
  // `theme`: al hidratar, `theme` aún es el del servidor (claro).
  useEffect(() => applyTheme(currentTheme()), []);
  const next = oppositeTheme(theme);
  const label = next === "dark" ? "Cambiar al tema oscuro" : "Cambiar al tema claro";
  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next);
        storeTheme(browserStorage(), next);
      }}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 ${className}`}
    >
      {theme === "dark" ? <Sun aria-hidden className="h-4 w-4" /> : <Moon aria-hidden className="h-4 w-4" />}
    </button>
  );
}
