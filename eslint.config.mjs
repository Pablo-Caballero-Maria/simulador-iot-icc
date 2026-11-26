import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // zod se importa de src/lib/zod.ts, que lo configura para no probar eval (el CSP lo prohíbe).
    ignores: ["src/lib/zod.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "zod", message: 'Importa z de "@/lib/zod" (zod sin eval, por el CSP).' }] },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Informes de cobertura (npm run test:coverage):
    "coverage/**",
  ]),
]);

export default eslintConfig;
