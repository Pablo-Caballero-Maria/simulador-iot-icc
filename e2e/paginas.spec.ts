import { expect, test } from "./fixtures";

test("«Cómo funciona» resume el diseño y los resultados", async ({ page }) => {
  await page.goto("/como-funciona");
  await expect(page.getByRole("heading", { name: "Resultados frente a los requisitos" })).toBeVisible();
});

test("el estudio económico recalcula al cambiar un supuesto", async ({ page }) => {
  await page.goto("/economia");
  await expect(page.getByRole("heading", { name: "Estudio económico" })).toBeVisible();
  const resultados = page.getByRole("region", { name: "Resultados" });
  const antes = await resultados.innerText();
  const supuesto = page.getByRole("spinbutton", { name: "Precio del kit" });
  await supuesto.fill(String(Number(await supuesto.inputValue()) * 2));
  await supuesto.blur();
  await expect.poll(() => resultados.innerText()).not.toBe(antes);

  // Un valor fuera de rango se explica y no cambia los resultados.
  const despues = await resultados.innerText();
  await supuesto.fill("5");
  await expect(page.getByText("Entre 300 y 1500.")).toBeVisible();
  expect(await resultados.innerText()).toBe(despues);
});

test("«Cómo funciona» repite la semana normal en el navegador", async ({ page }) => {
  await page.goto("/como-funciona");
  await page.getByRole("button", { name: "Simular una semana" }).click();
  // Unos segundos en un Web Worker; la fila de la semilla 6 se llena con sus cifras.
  const fila = page.getByRole("row", { name: /Semilla 6/ });
  await expect(fila).toContainText(/días/, { timeout: 25_000 });
  await expect(fila).toContainText("KB/día");
  await expect(page.getByRole("button", { name: "Simular otra semana" })).toBeEnabled();
});
