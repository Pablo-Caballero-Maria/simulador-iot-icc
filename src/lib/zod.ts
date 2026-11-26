/**
 * zod para toda la app: impórtalo de aquí, no de "zod" (lo impone eslint.config.mjs).
 *
 * zod 4 compila sus validadores con `new Function` cuando puede, y para saberlo lo prueba; el CSP
 * (src/lib/security-headers.ts) prohíbe eval, así que esa prueba quedaría registrada como una
 * violación. En modo jitless no lo intenta nunca y valida igual.
 */
import { z } from "zod";

z.config({ jitless: true });

export { z };
