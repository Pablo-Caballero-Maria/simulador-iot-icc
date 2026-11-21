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
  const supuesto = page.getByLabel("Precio del kit");
  await supuesto.fill(String(Number(await supuesto.inputValue()) * 2));
  await supuesto.blur();
  await expect.poll(() => resultados.innerText()).not.toBe(antes);
});
