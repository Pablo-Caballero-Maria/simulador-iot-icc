/**
 * El service worker (src/sw/worker.ts): tras la primera visita, el simulador y las páginas de texto
 * abren sin conexión, también las que no se habían visitado. Y el tema claro/oscuro.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** Espera a que el service worker controle la página y haya guardado todas las páginas. */
async function esperarServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve));
  });
  await expect.poll(() => page.evaluate(async () => (await (await caches.open("pages")).keys()).length)).toBe(3);
}

test.describe("sin conexión", () => {
  // Sin red fallan las descargas que no están guardadas (el icono con su ?hash) y los prefetch de
  // Next.js de las otras páginas («Failed to fetch»): es lo esperado, la página sigue funcionando.
  // (Un solo patrón: Playwright lee una lista de dos elementos como [valor, opciones].)
  test.use({
    erroresPermitidos: [/Failed to load resource: net::ERR_(FAILED|INTERNET_DISCONNECTED)|^Failed to fetch$/],
  });

  test("abre páginas no visitadas y el simulador", async ({ page, context }) => {
    await page.goto("/");
    await esperarServiceWorker(page);
    await context.setOffline(true);

    await page.goto("/economia");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto("/");
    await page.getByRole("button", { name: "Cerrar el recorrido" }).click();
    await expect(page.getByRole("button", { name: /Escenario/ })).toBeVisible();

    await context.setOffline(false);
  });
});

/** El brillo (0-255) del fondo de la página: el navegador da el color en lab(), un lienzo lo pasa a RGB. */
const brilloDelFondo = (page: Page) =>
  page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return (r + g + b) / 3;
  });

test("el tema es claro por defecto; el oscuro se recuerda al recargar", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/como-funciona");
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme", "dark");
  expect(await brilloDelFondo(page)).toBeGreaterThan(240);

  await page.getByRole("button", { name: "Cambiar al tema oscuro" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => brilloDelFondo(page)).toBeLessThan(30);
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
});
