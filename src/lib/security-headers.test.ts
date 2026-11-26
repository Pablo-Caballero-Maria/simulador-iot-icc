import { describe, expect, it } from "vitest";

import {
  VERCEL_TOOLBAR,
  contentSecurityPolicy,
  deploymentOptions,
  mergePolicies,
  securityHeaders,
} from "@/lib/security-headers";

/** El CSP como { directiva: fuentes }. */
function parse(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp.split("; ").map((directive) => {
      const [name, ...sources] = directive.split(" ");
      return [name!, sources];
    }),
  );
}

describe("contentSecurityPolicy", () => {
  it("solo deja cargar de la propia web y conectarse con ella", () => {
    const csp = parse(contentSecurityPolicy());
    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["script-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp["connect-src"]).toEqual(["'self'"]);
    expect(csp["img-src"]).toEqual(["'self'", "data:", "blob:"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    expect(csp["form-action"]).toEqual(["'self'"]);
    expect(csp).not.toHaveProperty("upgrade-insecure-requests");
  });

  it("solo permite eval en desarrollo", () => {
    expect(parse(contentSecurityPolicy({ dev: true }))["script-src"]).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy()).not.toContain("unsafe-eval");
  });

  it("solo deja entrar la barra de Vercel en las vistas previas", () => {
    const preview = parse(contentSecurityPolicy({ preview: true }));
    expect(preview["script-src"]).toContain("https://vercel.live");
    expect(preview["frame-src"]).toEqual(["'self'", "https://vercel.live"]);
    expect(contentSecurityPolicy()).not.toContain("vercel.live");
  });

  it("cambia a https las peticiones http cuando se sirve por HTTPS", () => {
    expect(contentSecurityPolicy({ https: true }).endsWith("; upgrade-insecure-requests")).toBe(true);
  });

  it("añade fuentes sin repetir ninguna", () => {
    const csp = parse(contentSecurityPolicy({ extra: { "connect-src": ["'self'", "https://example.org"] } }));
    expect(csp["connect-src"]).toEqual(["'self'", "https://example.org"]);
  });
});

describe("mergePolicies", () => {
  it("deja cada fuente una vez, en orden", () => {
    expect(mergePolicies({ "img-src": ["a", "b"] }, { "img-src": ["b", "c"], "font-src": ["d"] })).toEqual({
      "img-src": ["a", "b", "c"],
      "font-src": ["d"],
    });
    expect(mergePolicies(VERCEL_TOOLBAR)).toEqual(VERCEL_TOOLBAR);
  });
});

describe("securityHeaders", () => {
  it("envía HSTS, nosniff, sin incrustar, referrer estricto y sin funciones sensibles", () => {
    const headers = Object.fromEntries(securityHeaders().map(({ key, value }) => [key, value]));
    expect(Object.keys(headers)).toEqual([
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
    ]);
    expect(headers["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  });
});

describe("deploymentOptions", () => {
  it("lee el entorno de Vercel", () => {
    expect(deploymentOptions({ VERCEL: "1", VERCEL_ENV: "preview" })).toEqual({ preview: true, https: true });
    expect(deploymentOptions({ VERCEL: "1", VERCEL_ENV: "production" })).toEqual({
      preview: false,
      https: true,
    });
    expect(deploymentOptions({})).toEqual({ preview: false, https: false });
  });
});
