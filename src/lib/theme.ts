/**
 * Tema de color: claro salvo que el visitante elija el oscuro con el botón de la barra, que se
 * recuerda en localStorage y se aplica como <html data-theme="dark">. Los colores de ambos temas
 * están en src/app/globals.css (el oscuro refleja la paleta de Tailwind); los del lienzo del ECG y
 * de la escena 3D, que no son clases, aquí (CANVAS_COLORS, SCENE_COLORS).
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "simulador-icc:tema";
export const DEFAULT_THEME: Theme = "light";

/** Fondo de la página en cada tema (slate-50), para el color del navegador en el móvil. */
export const THEME_COLORS: Record<Theme, string> = { light: "#f8fafc", dark: "#020617" };

/** Cielo y niebla de la escena 3D. */
export const SCENE_COLORS: Record<Theme, { sky: string }> = {
  light: { sky: "#eef3f8" },
  dark: { sky: "#0b1424" },
};

/** El papel del ECG del wearable (EcgMonitor). */
export const CANVAS_COLORS: Record<Theme, { paper: string; grid: string; ink: string; muted: string }> = {
  light: { paper: "#fffafa", grid: "#fbd5d5", ink: "#0f172a", muted: "#64748b" },
  dark: { paper: "#140b12", grid: "#3b1a24", ink: "#e2e8f0", muted: "#94a3b8" },
};

export const isTheme = (value: unknown): value is Theme => value === "light" || value === "dark";

/** El tema en vigor: la elección guardada, o el claro. */
export const resolveTheme = (stored: string | null | undefined): Theme => (isTheme(stored) ? stored : DEFAULT_THEME);

export const oppositeTheme = (theme: Theme): Theme => (theme === "dark" ? "light" : "dark");

/** Lee la elección guardada; el almacenamiento puede faltar o fallar (modo privado). */
export function readStoredTheme(storage: Pick<Storage, "getItem"> | undefined): Theme | null {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeTheme(storage: Pick<Storage, "setItem"> | undefined, theme: Theme): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // No se recuerda, pero la página cambia igual.
  }
}

/** El tema que muestra la página ahora mismo. */
export const currentTheme = (doc: Document = document): Theme => resolveTheme(doc.documentElement.dataset.theme);

/** Aplica un tema: <html data-theme> y el color del navegador (la barra de direcciones del móvil). */
export function applyTheme(theme: Theme, doc: Document = document): void {
  doc.documentElement.dataset.theme = theme;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
}

/** Avisa de cada cambio de tema (para useSyncExternalStore). */
export function subscribeTheme(listener: () => void, doc: Document = document): () => void {
  const observer = new MutationObserver(listener);
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/**
 * Se ejecuta en <head> antes de pintar nada, para que un tema guardado no parpadee. Pequeño y sin
 * dependencias: va dentro de cada página.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;
