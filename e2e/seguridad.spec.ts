import { expect, test } from "./fixtures";

// Los fixtures hacen fallar un test ante cualquier error de la consola: un script, estilo, worker o
// petición que el CSP bloquee en cualquier otro test (la escena 3D incluida) lo hace fallar también.
test.describe("cabeceras de seguridad", () => {
  for (const ruta of ["/", "/como-funciona", "/fonts/noto-sans-latin-400.woff"]) {
    test(`llegan con ${ruta}`, async ({ request }) => {
      const cabeceras = (await request.get(ruta)).headers();
      expect(cabeceras["content-security-policy"]).toContain("default-src 'self'");
      expect(cabeceras["content-security-policy"]).toContain("worker-src 'self' blob:");
      expect(cabeceras["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(cabeceras["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
      expect(cabeceras["x-content-type-options"]).toBe("nosniff");
      expect(cabeceras["x-frame-options"]).toBe("DENY");
      expect(cabeceras["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(cabeceras["x-powered-by"]).toBeUndefined();
    });
  }
});

test.describe("el CSP", () => {
  // El navegador avisa en la consola del script bloqueado, como debe.
  // Un solo patrón: Playwright lee un array de dos elementos como [valor, opciones].
  test.use({
    erroresPermitidos: [
      /violates the following Content Security Policy|CSP violation: script-src-elem blocked https:\/\/example\.org\//,
    ],
  });

  test("bloquea los scripts de otros sitios", async ({ page }) => {
    await page.goto("/como-funciona");
    const violations = await page.evaluate(
      () =>
        new Promise<{ directive: string; blocked: string }[]>((resolve) => {
          const seen: { directive: string; blocked: string }[] = [];
          document.addEventListener("securitypolicyviolation", (event) =>
            seen.push({ directive: event.violatedDirective, blocked: event.blockedURI }),
          );
          const script = document.createElement("script");
          script.src = "https://example.org/malicioso.js";
          script.onerror = () => setTimeout(() => resolve(seen), 200);
          document.head.append(script);
        }),
    );
    expect(violations).toEqual([{ directive: "script-src-elem", blocked: "https://example.org/malicioso.js" }]);
  });
});
