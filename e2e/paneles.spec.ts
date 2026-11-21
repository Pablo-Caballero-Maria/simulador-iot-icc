import { abrirEscenario, expect, test } from "./fixtures";

test("los paneles se abren de uno en uno: datos y mensajes con bytes reales", async ({ page }) => {
  await abrirEscenario(page, /Taquicardia ventricular/);

  await page.getByRole("button", { name: "Datos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Objetivos de la memoria" })).toBeVisible();
  await page.getByText("Clasificador del wearable").click();
  await expect(page.getByText("Ventanas de 8 s")).toBeVisible();

  await page.getByRole("button", { name: "Mensajes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Objetivos de la memoria" })).toBeHidden();
  await expect(page.getByText(/Tira de ECG de 30 s/).first()).toBeVisible({ timeout: 30_000 });
});

test("el panel de parámetros muestra los valores de la memoria", async ({ page }) => {
  await abrirEscenario(page, /Un día normal/);
  await page.getByRole("button", { name: "Parámetros", exact: true }).click();
  await expect(page.getByRole("complementary").last()).toContainText(/BLE/);
});
