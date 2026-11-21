# Registro de cambios

Todos los cambios relevantes del simulador se anotan aquí. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[versionado semántico](https://semver.org/lang/es/). Cada versión tiene su etiqueta (`vX.Y.Z`) en el
repositorio.

## [Sin publicar]

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

[Sin publicar]: https://github.com/Pablo-Caballero-Maria/simulador-iot-icc/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Pablo-Caballero-Maria/simulador-iot-icc/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/Pablo-Caballero-Maria/simulador-iot-icc/releases/tag/v0.1.0
