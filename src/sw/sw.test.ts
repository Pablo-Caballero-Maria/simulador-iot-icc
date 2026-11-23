import { describe, expect, it } from "vitest";
import { OFFLINE_FALLBACK, OFFLINE_PAGES } from "./pages";
import { isDocument, isPage, type RequestInfo } from "./requests";
import { buildRevision } from "./revision";

const info = (path: string, mode: string, destination: string, sameOrigin = true): RequestInfo => ({
  url: new URL(path, "https://simulador-iot-icc.vercel.app"),
  request: { mode: mode as RequestMode, destination: destination as RequestDestination },
  sameOrigin,
});

describe("service worker", () => {
  it("descarga todas las páginas al instalarse", () => {
    expect(OFFLINE_PAGES).toEqual(["/", "/como-funciona", "/economia"]);
    expect(OFFLINE_PAGES).not.toContain(OFFLINE_FALLBACK);
  });

  it("trata como páginas las navegaciones propias y solo cae a la de respaldo con documentos", () => {
    expect(isPage(info("/economia", "navigate", "document"))).toBe(true);
    expect(isPage(info("/", "navigate", "document", false))).toBe(false);
    expect(isPage(info("/_next/static/chunks/a.js", "no-cors", "script"))).toBe(false);
    expect(isDocument(info("/x", "navigate", "document"))).toBe(true);
    expect(isDocument(info("/x.png", "no-cors", "image"))).toBe(false);
  });

  it("versiona la página sin conexión con el commit", () => {
    expect(buildRevision({ VERCEL_GIT_COMMIT_SHA: "abc123" })).toBe("abc123");
    expect(buildRevision({})).toMatch(/^[0-9a-f-]{36,40}$/);
  });
});
