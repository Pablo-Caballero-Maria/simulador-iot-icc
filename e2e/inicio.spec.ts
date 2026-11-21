import { expect, test } from "./fixtures";

test("el recorrido guiado se abre en la primera visita y se puede cerrar", async ({ page }) => {
  await page.goto("/");
  const recorrido = page.getByRole("dialog", { name: "Recorrido guiado" });
  await expect(recorrido).toBeVisible();
  await expect(recorrido.getByRole("heading", { level: 2 })).toBeVisible();
  await recorrido.getByRole("button", { name: "Cerrar el recorrido" }).click();
  await expect(recorrido).toBeHidden();
});

test("la escena 3D se dibuja", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Cerrar el recorrido" }).click();
  // La escena es el lienzo WebGL más grande (el ECG es otro lienzo, pequeño).
  await expect
    .poll(() =>
      page.evaluate(() => Math.max(...[...document.querySelectorAll("canvas")].map((c) => c.width * c.height))),
    )
    .toBeGreaterThan(200_000);
});

test("la barra superior ofrece los diez escenarios y la velocidad", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Cerrar el recorrido" }).click();
  await page.getByRole("button", { name: /Escenario/ }).click();
  await expect(page.getByRole("listbox", { name: "Escenarios" }).getByRole("option")).toHaveCount(10);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("combobox", { name: "Velocidad de la simulación" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Otras páginas" }).getByRole("link", { name: "Código" }),
  ).toHaveAttribute("href", "https://github.com/Pablo-Caballero-Maria/simulador-iot-icc");
});

test("la web tiene su propio icono", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", /\/icon\.svg/);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /\/apple-icon\.png/);
  const icono = await request.get("/icon.svg");
  expect(icono.ok()).toBe(true);
  expect(await icono.text()).toContain("#e11d48");
});
