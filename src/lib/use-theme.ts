"use client";
/** El tema actual en React (lo cambian ThemeToggle o el script de layout.tsx). */
import { useSyncExternalStore } from "react";
import { currentTheme, DEFAULT_THEME, subscribeTheme, type Theme } from "./theme";

export function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => subscribeTheme(listener),
    () => currentTheme(),
    () => DEFAULT_THEME,
  );
}
