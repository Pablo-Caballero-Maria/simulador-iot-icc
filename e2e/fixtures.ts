/**
 * El `page` de los tests, que hace fallar el test ante cualquier error en la consola o excepción
 * sin capturar, y una ayuda para empezar un escenario desde la barra superior.
 */
import { type Page, test as base, expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, runTest) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`consola: ${message.text()}`);
    });
    page.on("pageerror", (error) => problems.push(`error de la página: ${error.message}`));
    await runTest(page);
    expect(problems, "la página registró errores").toEqual([]);
  },
});

/** Abre el simulador, cierra el recorrido guiado y elige un escenario. */
export async function abrirEscenario(page: Page, escenario: RegExp) {
  await page.goto("/");
  await page.getByRole("button", { name: "Cerrar el recorrido" }).click();
  await page.getByRole("button", { name: /Escenario/ }).click();
  await page.getByRole("option", { name: escenario }).click();
  await expect(page.getByRole("button", { name: /Escenario/ })).toContainText(escenario);
}

/** La línea del ECG con la clase que da la red neuronal del wearable. */
export const salidaDeLaRed = (page: Page) => page.getByText("Red neuronal:").locator("..");

export { expect };
