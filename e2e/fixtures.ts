/**
 * El `page` de los tests, que hace fallar el test ante cualquier error en la consola o excepción
 * sin capturar, y una ayuda para empezar un escenario desde la barra superior. Un test que espera
 * algún error a propósito (sin conexión) lo declara con `test.use({ erroresPermitidos: [/…/] })`.
 */
import { type Page, test as base, expect } from "@playwright/test";

export const test = base.extend<{ erroresPermitidos: RegExp[] }>({
  erroresPermitidos: [[], { option: true }],
  page: async ({ page, erroresPermitidos }, runTest) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (erroresPermitidos.some((patron) => patron.test(message.text()))) return;
      problems.push(`consola: ${message.text()}`);
    });
    page.on("pageerror", (error) => {
      if (erroresPermitidos.some((patron) => patron.test(error.message))) return;
      problems.push(`error de la página: ${error.message}`);
    });
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
