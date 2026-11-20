/**
 * Prueba de humo en un navegador real (Chrome sin interfaz):
 *
 *   npm run build && npm run test:e2e
 *
 * Arranca `next start`, abre el simulador, reproduce el escenario de
 * taquicardia ventricular y comprueba que la escena 3D se dibuja, que la
 * alerta llega a la consola y que no hay errores en la consola del navegador.
 * También abre las páginas «Cómo funciona» y «Estudio económico».
 *
 * Usa el Chrome instalado en el sistema (variable CHROME_PATH si no está en
 * la ruta habitual), de modo que no hace falta descargar navegadores.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/opt/google/chrome/chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error("No se encuentra Chrome. Indica su ruta con CHROME_PATH.");
  process.exit(1);
}

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: "ignore" });
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  server.kill();
  process.exit(1);
};

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      // todavía arrancando
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail("el servidor no arranca");
}

await waitForServer();
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

try {
  await page.goto(BASE, { waitUntil: "load", timeout: 60_000 });
  await page.getByRole("button", { name: "Cerrar el recorrido" }).click();
  await page.getByRole("button", { name: /Escenario/ }).click();
  await page.getByRole("option", { name: /Taquicardia ventricular/ }).click();
  // El historial de explicaciones está en su panel; la escena muestra solo la última.
  await page.getByRole("button", { name: "Explicación", exact: true }).click();
  // Dos ventanas de 8 s a 5× tardan unos 4 s; se espera algo más.
  await page.getByText("Alerta de clase 1 en la consola").first().waitFor({ timeout: 30_000 });
  console.log("✓ la alerta crítica llega a la consola");

  const canvasOk = await page.evaluate(() => {
    // La escena es el lienzo WebGL más grande (el ECG es otro lienzo, pequeño).
    const sizes = [...document.querySelectorAll("canvas")].map((c) => c.width * c.height);
    return sizes.some((area) => area > 200_000);
  });
  if (!canvasOk) fail("la escena 3D no se ha dibujado");
  console.log("✓ la escena 3D se dibuja");

  await page.getByRole("button", { name: "Datos", exact: true }).click();
  await page.getByRole("heading", { name: "Objetivos de la memoria" }).waitFor();
  await page.getByRole("button", { name: "Mensajes", exact: true }).click();
  await page
    .getByText(/Tira de ECG de 30 s/)
    .first()
    .waitFor({ timeout: 15_000 });
  console.log("✓ estadísticas y registro de mensajes");

  await page.goto(`${BASE}/como-funciona`, { waitUntil: "load", timeout: 60_000 });
  await page.getByRole("heading", { name: "Resultados frente a los requisitos" }).waitFor();
  await page.goto(`${BASE}/economia`, { waitUntil: "load", timeout: 60_000 });
  await page.getByRole("heading", { name: "Estudio económico" }).waitFor();
  console.log("✓ páginas «Cómo funciona» y «Estudio económico»");

  const relevant = errors.filter((e) => !e.includes("Failed to load resource"));
  if (relevant.length > 0) fail(`errores en la consola: ${relevant.join(" | ")}`);
  console.log("✓ sin errores en la consola del navegador");
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
} finally {
  await browser.close();
  server.kill();
}
