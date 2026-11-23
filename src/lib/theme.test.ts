// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  currentTheme,
  oppositeTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  subscribeTheme,
  THEME_COLORS,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from "./theme";

afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.head.innerHTML = "";
  localStorage.clear();
});

describe("tema", () => {
  it("es claro salvo que se elija el oscuro", () => {
    expect(resolveTheme(null)).toBe("light");
    expect(resolveTheme("sepia")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
    expect(currentTheme()).toBe("light");
    expect(oppositeTheme("light")).toBe("dark");
    expect(oppositeTheme("dark")).toBe("light");
  });

  it("se aplica a <html> y al color del navegador, y avisa del cambio", async () => {
    document.head.innerHTML = `<meta name="theme-color" content="${THEME_COLORS.light}">`;
    const listener = vi.fn();
    const stop = subscribeTheme(listener);
    applyTheme("dark");
    expect(currentTheme()).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(THEME_COLORS.dark);
    await Promise.resolve(); // MutationObserver avisa en una microtarea
    expect(listener).toHaveBeenCalled();
    stop();
  });

  it("se guarda, y el script de <head> lo aplica antes de pintar", () => {
    storeTheme(localStorage, "dark");
    expect(readStoredTheme(localStorage)).toBe("dark");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("no rompe nada si el almacenamiento falla o guarda otra cosa", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "<script>");
    expect(readStoredTheme(localStorage)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(readStoredTheme(broken)).toBeNull();
    expect(() => storeTheme(broken, "dark")).not.toThrow();
  });
});
