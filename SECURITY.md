# Política de seguridad

## Versiones con soporte

| Versión                   | Soporte |
| ------------------------- | :-----: |
| 1.0.x (la última, `main`) |   ✅    |
| < 1.0.0                   |   ❌    |

Solo la última versión de `main` recibe correcciones.

## Cómo informar de una vulnerabilidad

> [!IMPORTANT]
> **No abras un _issue_ público** para un problema de seguridad.

Infórmame en privado a través de GitHub: **[Report a vulnerability](https://github.com/Pablo-Caballero-Maria/simulador-iot-icc/security/advisories/new)** (pestaña _Security_ →
_Advisories_ → _Report a vulnerability_). Incluye:

1. qué está afectado (fichero, ruta de la API, función…) y la versión o el _commit_;
2. cómo reproducirlo, paso a paso;
3. el impacto que esperas (qué podría leer, cambiar o romper alguien);
4. una corrección o mitigación, si se te ocurre.

Confirmaré que lo he recibido en un plazo de **7 días**, te mantendré al tanto mientras lo corrijo y te
mencionaré en el aviso y en el [registro de cambios](CHANGELOG.md), salvo que prefieras el anonimato.

## Alcance

- La firma de las órdenes de diurético (ECDSA P-256) y su verificación en el dispensador simulado.
- Cualquier forma de ejecutar código en el navegador de quien visita la web (XSS) o de alterar la
  aplicación desplegada.
- Dependencias con vulnerabilidades conocidas.

> [!IMPORTANT]
> El simulador **no es un producto sanitario** y todos los datos fisiológicos son sintéticos: no
> trata datos de pacientes.

Fuera de alcance: Resultados del modelo que no coinciden con la memoria (usa la plantilla «Una cifra no coincide con la memoria»).

## Qué hace ya el repositorio

- **Escaneo de secretos** con protección al hacer _push_: se bloquea un _commit_ que contenga un token
  conocido.
- **Dependabot**: alertas y actualizaciones de seguridad de las dependencias y de las GitHub Actions,
  y actualizaciones semanales de versión.
- **CodeQL**: análisis del código y de los _workflows_ en cada _push_, _pull request_ y cada semana.
