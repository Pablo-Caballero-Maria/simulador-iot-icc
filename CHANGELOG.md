# Registro de cambios

Todos los cambios relevantes del simulador se anotan aquí. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[versionado semántico](https://semver.org/lang/es/). Cada versión tiene su etiqueta (`vX.Y.Z`) en el
repositorio.

## [Sin publicar]

## [1.2.0] - 2026-11-22

### Añadido

- **Tema oscuro**, con un botón en la barra superior y en las páginas de texto; el claro sigue siendo el de
  siempre y el predeterminado (no sigue al del sistema). Se recuerda en el navegador y un script en `<head>` lo
  aplica antes de pintar. El oscuro refleja la paleta de Tailwind que usa la interfaz (slate y los tonos de
  acento: 50 ↔ 950, 100 ↔ 900…) en `@layer theme`, así que los componentes no necesitan variantes `dark:`; el
  cielo de la escena 3D y el papel del ECG cambian con él.
- **Funciona sin conexión**: un _service worker_ (Serwist, `src/sw/`, servido en `/serwist/sw.js`) precachea el
  build (three.js y la red neuronal incluidas) y descarga las tres páginas al instalarse; las páginas van primero
  a la red. `experimental.useOffline`: sin conexión, una navegación espera a que vuelva en lugar de fallar.
  Página `/~offline` para lo que no esté guardado.
- **Esqueletos de carga**: la silueta de la escena 3D mientras se descarga three.js, y una página de texto
  mientras se carga al navegar (`loading.tsx`).
- Tests del tema, del botón, del esqueleto y del service worker (104 de Vitest) y, en Playwright, abrir páginas no
  visitadas sin conexión y el tema (13 en total).

### Cambiado

- `"type": "module"` en `package.json`: los `.ts`/`.js` de la raíz se cargan como módulos ES, como en
  las otras webs. Los scripts (`dev`, `build`, `check`, `results`, `train:classifier`, `test:e2e`) y las
  configuraciones siguen funcionando igual.
- La web ya no envía la cabecera `X-Powered-By: Next.js` (`poweredByHeader: false`).
- `lucide-react` 1.75.0 (antes 1.66.0), la misma versión que en las otras webs.

## [1.1.0] - 2026-11-21

### Añadido

- **Tests de extremo a extremo con Playwright** (`e2e/`, `npm run test:e2e`), 11 tests contra el build de
  producción con WebGL por software: el recorrido guiado, que la escena 3D se dibuje, el icono, la barra
  superior con los diez escenarios, la taquicardia ventricular (la red la detecta y la alerta llega a la
  consola), la fibrilación auricular (la red la clasifica y se avisa a enfermería), las órdenes falsas
  (rechazadas por firma y por repetidas), los paneles y las páginas «Cómo funciona» y «Economía». Cualquier
  error en la consola del navegador hace fallar el test.
- **Vercel Web Analytics** (visitas, sin cookies) y **Speed Insights** (Core Web Vitals de visitas reales),
  solo en el build que hace Vercel.

### Eliminado

- `scripts/smoke.mjs` y la dependencia `playwright-core`: la suite de Playwright los sustituye.

## [1.0.0] - 2026-11-21

### Añadido

- Icono propio de la web (`src/app/icon.svg` y `apple-icon.png`): el mismo corazón con pulso de la
  barra superior, en lugar del icono por defecto de Next.js.
- Integración continua dividida en trabajos (lint, tipos y formato; tests con cobertura, con resumen en
  cada ejecución, artefacto e insignia en el README; build y prueba de humo en Chrome), con Node.js 24.
- Seguridad: análisis con CodeQL, Dependabot (npm y GitHub Actions), escaneo de secretos con protección
  al hacer _push_ y [política de seguridad](SECURITY.md) con avisos privados.
- [Código de conducta](CODE_OF_CONDUCT.md), [CITATION.cff](CITATION.cff), plantillas de _issues_
  (error, mejora y cifra que no coincide con la memoria) y de _pull request_.
- [Wiki](https://github.com/Pablo-Caballero-Maria/simulador-iot-icc/wiki) con la red neuronal del
  wearable, la señal y los rasgos, el índice de congestión, las comunicaciones, los escenarios y el
  desarrollo.
- Figuras de la red neuronal en `docs/img/`: ventanas de ECG con los QRS detectados y la salida de la
  red, y la matriz de confusión del modelo INT8.

### Eliminado

- `src/app/favicon.ico` (el de la plantilla de Next.js).

### Cambiado

- README reorganizado, con insignias, índice, diagramas y capturas.

## [0.1.0] - 2026-11-20

### Añadido

- Simulador del sistema completo, desde el corazón del paciente hasta la consola del hospital: motor de
  eventos discretos en TypeScript, paciente con ritmo, congestión y rutina, wearable con ECG a 256 Hz,
  detector de Pan–Tompkins y red neuronal INT8 de 261 parámetros, BLE, LTE-M/NB-IoT, MQTT 5 sobre
  TLS 1.3, SenML-CBOR, HL7 FHIR, motor de alertas y órdenes de diurético firmadas con ECDSA P-256.
- Escena 3D con React Three Fiber, diez escenarios guiados, paneles bajo demanda y las páginas
  «Cómo funciona» y «Estudio económico».
- 95 tests con Vitest, prueba de humo en Chrome y CI con GitHub Actions.
- La memoria del trabajo final (`memoria/memoria.pdf`) y el enlace a la web desplegada.

[Sin publicar]: https://github.com/Pablo-Caballero-Maria/simulador-iot-icc/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/Pablo-Caballero-Maria/simulador-iot-icc/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Pablo-Caballero-Maria/simulador-iot-icc/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Pablo-Caballero-Maria/simulador-iot-icc/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/Pablo-Caballero-Maria/simulador-iot-icc/releases/tag/v0.1.0
