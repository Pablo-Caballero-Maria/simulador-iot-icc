import { abrirEscenario, expect, salidaDeLaRed, test } from "./fixtures";

test("taquicardia ventricular: la red la detecta y la alerta llega a la consola", async ({ page }) => {
  await abrirEscenario(page, /Taquicardia ventricular/);
  await page.getByRole("button", { name: "Explicación", exact: true }).click();
  // Dos ventanas de 8 s a 5× tardan unos 4 s.
  await expect(page.getByText("Alerta de clase 1 en la consola").first()).toBeVisible({ timeout: 45_000 });
  await expect(salidaDeLaRed(page)).toContainText("Taquiarritmia ventricular");

  await page.getByRole("button", { name: "Consola", exact: true }).click();
  await expect(page.getByText(/Clase 1 · Taquiarritmia ventricular/).first()).toBeVisible();
  await expect(page.getByText(/Ambulancia/).first()).toBeVisible({ timeout: 30_000 });
});

test("fibrilación auricular: la red la clasifica y se avisa a enfermería", async ({ page }) => {
  await abrirEscenario(page, /Fibrilación auricular/);
  await expect(salidaDeLaRed(page)).toContainText("FA o flúter", { timeout: 60_000 });
  await page.getByRole("button", { name: "Explicación", exact: true }).click();
  await expect(page.getByText("Alerta de clase 2 en la consola").first()).toBeVisible({ timeout: 60_000 });
});

test("órdenes falsas: el dispensador rechaza la firma inventada y la orden repetida", async ({ page }) => {
  await abrirEscenario(page, /órdenes falsas/);
  await page.getByRole("button", { name: "Explicación", exact: true }).click();
  await expect(page.getByText(/Motivo: firma no válida/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Motivo: orden ya ejecutada/).first()).toBeVisible({ timeout: 60_000 });
});
