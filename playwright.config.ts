/**
 * Tests de extremo a extremo (`npm run test:e2e`): el build de producción (`npm run build` antes)
 * servido con `next start` y manejado en un Chromium real, con WebGL por software (SwiftShader)
 * para que la escena 3D se dibuje también sin GPU.
 *
 * El navegador es el Chromium de Playwright (`npx playwright install chromium`); PW_CHANNEL (p. ej.
 * `chrome`) o PW_EXECUTABLE_PATH usan otro.
 */
import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3120);

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    channel: process.env.PW_CHANNEL,
    launchOptions: {
      executablePath: process.env.PW_EXECUTABLE_PATH,
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next start --port ${PORT} --hostname 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
