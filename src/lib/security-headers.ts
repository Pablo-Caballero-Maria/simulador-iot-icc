/**
 * Las cabeceras HTTP de seguridad de todas las respuestas (next.config.ts → headers()).
 *
 * La Content Security Policy solo deja cargar código, estilos, fuentes e imágenes de la propia web
 * y conectarse solo con ella: una etiqueta inyectada no puede traer un script de fuera ni enviar
 * datos a otro sitio; la página no se puede incrustar en otra (clickjacking) y los formularios
 * solo envían aquí.
 *
 * Los scripts siguen admitiendo 'unsafe-inline': las páginas se prerenderizan en el build y Next.js
 * pone los datos de React Server Components en etiquetas <script> en línea que solo un nonce por
 * petición podría autorizar, lo que obligaría a renderizar cada página en cada visita (sin CDN ni
 * copias sin conexión). La integridad de subrecursos (SRI) no lo resuelve: solo cubre los scripts
 * externos.
 *
 * next.config.ts añade blob: a scripts y workers para el texto 3D: troika-three-text monta su Web
 * Worker desde un blob con código que genera la propia página.
 */

export type Directive =
  | "default-src"
  | "script-src"
  | "style-src"
  | "img-src"
  | "font-src"
  | "connect-src"
  | "media-src"
  | "worker-src"
  | "manifest-src"
  | "frame-src"
  | "object-src"
  | "base-uri"
  | "form-action"
  | "frame-ancestors";

export type Policy = Partial<Record<Directive, readonly string[]>>;

export interface SecurityOptions {
  /** `next dev`: React necesita eval() para sus herramientas de depuración. */
  dev?: boolean;
  /** Un despliegue de vista previa de Vercel, que muestra su barra de herramientas (vercel.live). */
  preview?: boolean;
  /** Servida por HTTPS (en Vercel): los subrecursos http se cambian a https. */
  https?: boolean;
  /** Fuentes adicionales de algunas directivas, además de la política base. */
  extra?: Policy;
}

const BASE_POLICY: Policy = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'"],
  // Los atributos style={…} de React y las reglas @font-face en línea de next/font.
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'"],
  "connect-src": ["'self'"],
  "media-src": ["'self'"],
  "worker-src": ["'self'"],
  "manifest-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
};

/** Lo que carga la barra de Vercel (comentarios en las vistas previas), según su guía de CSP. */
export const VERCEL_TOOLBAR: Policy = {
  "script-src": ["https://vercel.live"],
  "style-src": ["https://vercel.live"],
  "img-src": ["https://vercel.live", "https://vercel.com"],
  "font-src": ["https://vercel.live", "https://assets.vercel.com"],
  "connect-src": ["https://vercel.live", "wss://ws-us3.pusher.com"],
  "frame-src": ["'self'", "https://vercel.live"],
};

/** Une políticas sin repetir fuentes en cada directiva, en orden. */
export function mergePolicies(...policies: Policy[]): Policy {
  const merged: Partial<Record<Directive, string[]>> = {};
  for (const policy of policies) {
    for (const [directive, sources] of Object.entries(policy) as [Directive, readonly string[]][]) {
      const list = (merged[directive] ??= []);
      for (const source of sources) if (!list.includes(source)) list.push(source);
    }
  }
  return merged;
}

/** El valor de la cabecera Content-Security-Policy. */
export function contentSecurityPolicy({
  dev = false,
  preview = false,
  https = false,
  extra = {},
}: SecurityOptions = {}): string {
  const policy = mergePolicies(
    BASE_POLICY,
    dev ? { "script-src": ["'unsafe-eval'"] } : {},
    preview ? VERCEL_TOOLBAR : {},
    extra,
  );
  const directives = Object.entries(policy).map(([directive, sources]) => `${directive} ${sources.join(" ")}`);
  if (https) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Funciones del navegador que ninguna página usa: nadie (ni una página incrustada) puede pedirlas. */
export const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "browsing-topics=()",
].join(", ");

/** Todas las cabeceras de seguridad, con la forma de next.config.ts → headers(). */
export function securityHeaders(options: SecurityOptions = {}): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    // Dos años solo por HTTPS, para este dominio y sus subdominios.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // frame-ancestors 'none', para los navegadores anteriores a esa directiva.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    // Las páginas abiertas desde aquí (o que abren esta) no reciben acceso a su ventana.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}

/** Dónde se construye, según el entorno que da Vercel (`dev` sale de la fase de Next). */
export function deploymentOptions(env: Partial<Record<string, string>> = process.env): SecurityOptions {
  return { preview: env.VERCEL_ENV === "preview", https: Boolean(env.VERCEL) };
}
