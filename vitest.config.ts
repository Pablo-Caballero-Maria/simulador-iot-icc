import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/sim/**/*.ts", "src/lib/**/*.ts", "src/sw/**/*.ts"],
      // La entrada del service worker solo corre en un navegador: la prueba e2e/offline.spec.ts.
      exclude: ["**/*.test.ts", "src/sw/worker.ts"],
      reporter: ["text-summary", "json-summary", "lcov", "html"],
    },
  },
});
