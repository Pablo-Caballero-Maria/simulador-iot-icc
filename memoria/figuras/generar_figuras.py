#!/usr/bin/env python3
"""Genera las cuatro figuras del trabajo como SVG (después se pasan a PNG con rsvg-convert)."""
import os
from xml.sax.saxutils import escape

OUT = os.path.dirname(os.path.abspath(__file__))
FONT = "Liberation Sans, Arial, sans-serif"
INK, INK2, MUTED, LINE, SURF = '#0b0b0b', '#52514e', '#8a8984', '#c9c8c2', '#ffffff'
BLUE, ORANGE, AQUA = '#2a78d6', '#eb6834', '#1baf7a'


def text(x, y, s, size=15, anchor='start', weight='normal', fill=INK, lh=None, style='', halo=False):
    lines = s.split('\n')
    lh = lh or size * 1.22
    y0 = y - (len(lines) - 1) * lh / 2
    out = [f'<text x="{x}" y="{y0:.1f}" font-family="{FONT}" font-size="{size}" text-anchor="{anchor}" '
           f'font-weight="{weight}" fill="{fill}" dominant-baseline="central" {style}' + (' stroke="#ffffff" stroke-width="5" stroke-linejoin="round" paint-order="stroke"' if halo else '') + '>']
    for i, l in enumerate(lines):
        dy = 0 if i == 0 else lh
        out.append(f'<tspan x="{x}" dy="{dy:.1f}">{escape(l)}</tspan>')
    out.append('</text>')
    return ''.join(out)


def rect(x, y, w, h, fill, stroke=LINE, rx=6, sw=1.2, dash=''):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>'


def svg(w, h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'<rect width="{w}" height="{h}" fill="{SURF}"/>'
            '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{INK2}"/></marker>'
            '<marker id="ahb" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{BLUE}"/></marker>'
            '<marker id="aho" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{ORANGE}"/></marker></defs>'
            + ''.join(body) + '</svg>')


# ---------------------------------------------------------------- 1. arquitectura
def arquitectura():
    W, H = 1000, 640
    cols = ['Domicilio\n(Edge local y Fog)', 'Unidad móvil\n(ambulancia, HaD)', 'Plataforma en la nube\n(región UE)', 'Hospital\n(Cardiología y HaD)']
    tint = ['#e8f1fb', '#fdeee6', '#e6f6f0', '#f1eefb']
    head = ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6']
    levels = ['7 Procesos', '6 Aplicación', '5 Abstracción', '4 Acumulación', '3 Borde', '2 Conectividad', '1 Dispositivos']
    cells = [
        ['Paciente y cuidador:\ntomas, pesaje, avisos', 'Equipo de ambulancia\ny centro coordinador 112', 'Servicio y vigilancia\ndel fabricante', 'Enfermería, cardiólogo,\nHaD, primaria, farmacia'],
        ['Voz y pantalla;\npauta basal (A4)', 'Tableta: resumen\ny última tira', 'Motor de alertas y\nprotocolo (A2)', 'Consola web:\nfirma de órdenes (A3)'],
        ['SenML-CBOR\ncon seudónimo', 'SenML-CBOR', 'HL7 FHIR R4\ncon códigos LOINC', 'Historia clínica (FHIR)'],
        ['Búfer cifrado de 72 h\n(eMMC, SQLite)', 'Búfer del traslado', 'Series en TimescaleDB\ny copias cifradas', 'HCE: conservación\n≥ 5 años'],
        ['Wearable: QRS + red INT8\nEstación: confirmación,\ncongestión, MCU seguro', 'Pasarela RPi CM5\n(2.ª central BLE)', 'Broker Mosquitto,\ningesta idempotente', 'Nodo de integración\ncon la HCE (Fog)'],
        ['BLE 5 → LTE-M / NB-IoT\nAPN privado', 'Router 4G/5G + LTE-M', 'MQTT 5 + TLS 1.3 mutuo;\nLwM2M (Leshan)', 'Ethernet, Wi-Fi,\nWireGuard'],
        ['Wearable, báscula BLE,\nestación y dispensador', 'Pasarela móvil (12 V)', '—', 'Tabletas y\npuestos clínicos'],
    ]
    x0, lw, cw, gap, tw = 12, 112, 196, 8, 46
    y0, hh, rh, rg = 12, 50, 76, 6
    b = []
    for c in range(4):
        x = x0 + lw + gap + c * (cw + gap)
        b.append(rect(x, y0, cw, hh, head[c], stroke=head[c]))
        b.append(text(x + cw / 2, y0 + hh / 2, cols[c], 16, 'middle', 'bold', '#ffffff'))
    for r, lv in enumerate(levels):
        y = y0 + hh + gap + r * (rh + rg)
        b.append(rect(x0, y, lw, rh, '#f3f3f1', stroke=LINE))
        b.append(text(x0 + lw / 2, y + rh / 2, lv.replace(' ', '\n', 1), 15.5, 'middle', 'bold', INK))
        for c in range(4):
            x = x0 + lw + gap + c * (cw + gap)
            b.append(rect(x, y, cw, rh, tint[c], stroke=LINE))
            b.append(text(x + cw / 2, y + rh / 2, cells[r][c], 15 if cells[r][c].count('\n') >= 2 else 16, 'middle', fill=INK if cells[r][c] != '—' else MUTED))
    xt = x0 + lw + gap + 4 * (cw + gap)
    yt, ht = y0, hh + gap + 7 * (rh + rg) - rg
    b.append(rect(xt, yt, tw, ht, '#3b3a37', stroke='#3b3a37'))
    cx, cy = xt + tw / 2, yt + ht / 2
    b.append(f'<g transform="rotate(-90 {cx} {cy})">' + text(cx, cy, 'Seguridad y gestión (T1–T5): elemento seguro, X.509, OTA firmada, LwM2M', 14, 'middle', 'bold', '#ffffff') + '</g>')
    H = int(yt + ht + 12)
    W = int(xt + tw + 12)
    return svg(W, H, b)


# ---------------------------------------------------------------- secuencias
def secuencia(actors, steps, W=880, top=64, step_h=40, notes=None):
    n = len(actors)
    xs = [80 + i * (W - 160) / (n - 1) for i in range(n)]
    H = top + 18 + len(steps) * step_h + 16
    b = []
    for x, a in zip(xs, actors):
        b.append(rect(x - 74, 10, 148, 46, '#eef3fa', stroke='#9fbbe0'))
        b.append(text(x, 33, a, 15, 'middle', 'bold'))
        b.append(f'<line x1="{x}" y1="56" x2="{x}" y2="{H - 10}" stroke="{LINE}" stroke-width="1.5" stroke-dasharray="5 4"/>')
    y = top + 18
    for st in steps:
        kind = st[0]
        if kind == 'msg':
            _, a, c, label, color = st
            xa, xc = xs[a], xs[c]
            col = {'b': BLUE, 'o': ORANGE, 'g': INK2}[color]
            mk = {'b': 'ahb', 'o': 'aho', 'g': 'ah'}[color]
            sgn = 1 if xc > xa else -1
            b.append(f'<line x1="{xa + 4 * sgn}" y1="{y}" x2="{xc - 4 * sgn}" y2="{y}" stroke="{col}" stroke-width="2" marker-end="url(#{mk})"/>')
            est = len(label) * 7.6
            lo, hi = min(xa, xc), max(xa, xc)
            if (lo + hi) / 2 + est / 2 > W - 6:
                b.append(text(hi, y - 11, label, 14.5, 'end', fill=INK, halo=True))
            elif (lo + hi) / 2 - est / 2 < 6:
                b.append(text(lo, y - 11, label, 14.5, 'start', fill=INK, halo=True))
            else:
                b.append(text((xa + xc) / 2, y - 11, label, 14.5, 'middle', fill=INK, halo=True))
        elif kind == 'self':
            _, a, label, color = st
            col = {'b': BLUE, 'o': ORANGE, 'g': INK2}[color]
            x = xs[a]
            b.append(rect(x - 6, y - 14, 12, 28, col, stroke=col, rx=3))
            b.append(text(x + 14, y, label, 14.5, 'start', fill=INK, halo=True))
        elif kind == 'note':
            _, label = st
            b.append(text(W / 2, y, label, 14.5, 'middle', fill=INK2, style='font-style="italic"', halo=True))
        y += step_h
    return svg(W, H, b)


def alerta():
    actors = ['Wearable', 'Estación', 'Plataforma', 'Enfermería y\ncardiólogo', '112 y\nambulancia']
    steps = [
        ('self', 0, 'TV confirmada en 2 ventanas de 8 s; vibra en 50 ms', 'o'),
        ('msg', 0, 1, 'Alerta BLE de 24 B (≈ 0,5 s)', 'o'),
        ('self', 1, 'Publica enseguida; voz: «llame al 112»', 'g'),
        ('msg', 1, 2, 'MQTT QoS 1 por LTE-M (0,3–1 s); SMS si no confirma', 'o'),
        ('msg', 2, 3, 'Alerta de clase 1 en la consola (≈ 1,5 s)', 'o'),
        ('note', 'Simulación: de la confirmación a la consola, p95 de 4,0 s con LTE-M y 16,6 s con NB-IoT (requisito ≤ 30 s)'),
        ('msg', 0, 2, 'Tira de ECG de 30 s (15 392 B), después de la alerta', 'b'),
        ('msg', 3, 4, 'Activación con ubicación, resumen y tira (escalado a 2 y 5 min)', 'o'),
        ('msg', 2, 4, 'Datos de emparejamiento de un solo uso a la pasarela móvil', 'b'),
        ('msg', 4, 0, 'La pasarela asume la monitorización durante el traslado', 'b'),
    ]
    return secuencia(actors, steps, step_h=38)


def emparejamiento():
    actors = ['Fábrica y\nautoridad (PKI)', 'Puesto de\npreparación', 'Wearable', 'Estación', 'Plataforma\n(LwM2M, broker)']
    steps = [
        ('note', 'En fábrica'),
        ('self', 2, 'El ATECC608B genera el par de claves (P-256)', 'g'),
        ('msg', 2, 0, 'Petición de certificado (CSR) y registro del UDI', 'g'),
        ('msg', 0, 3, 'Certificados X.509 de dispositivo (también para la estación)', 'b'),
        ('note', 'En el hospital, al preparar el kit'),
        ('msg', 1, 4, 'Asignación del kit al seudónimo del paciente', 'g'),
        ('msg', 1, 2, 'Datos fuera de banda (OOB) para el emparejamiento', 'b'),
        ('msg', 2, 3, 'LE Secure Connections con OOB: ECDH P-256, enlace AES-CCM', 'b'),
        ('note', 'En el domicilio: el paciente solo enchufa la estación'),
        ('msg', 3, 4, 'TLS 1.3 mutuo por el APN privado', 'b'),
        ('msg', 4, 3, 'Arranque LwM2M: configuración del paciente y temas MQTT', 'b'),
        ('msg', 4, 3, 'Renovación cada 2 años; revocación si hay compromiso', 'g'),
    ]
    return secuencia(actors, steps, step_h=36)


# ---------------------------------------------------------------- 4. flujo de caja
def flujo():
    W, H = 840, 360
    capex = 461.5
    series = [('Optimista', 150.881, AQUA), ('Base', 71.311, BLUE), ('Pesimista', -14.981, ORANGE)]
    L, R, T, B = 84, 168, 22, 58
    pw, ph = W - L - R, H - T - B
    ymin, ymax = -600, 100
    X = lambda m: L + m / 36 * pw
    Y = lambda v: T + (ymax - v) / (ymax - ymin) * ph
    b = []
    for v in range(-600, 101, 100):
        b.append(f'<line x1="{L}" y1="{Y(v):.1f}" x2="{L + pw}" y2="{Y(v):.1f}" stroke="#e6e5e0" stroke-width="1"/>')
        b.append(text(L - 10, Y(v), f'{v:,}'.replace(',', ' ').replace('-', '−'), 14, 'end', fill=INK2))
    b.append(f'<line x1="{L}" y1="{Y(0):.1f}" x2="{L + pw}" y2="{Y(0):.1f}" stroke="{INK2}" stroke-width="1.4"/>')
    for m in range(0, 37, 6):
        b.append(f'<line x1="{X(m):.1f}" y1="{T + ph}" x2="{X(m):.1f}" y2="{T + ph + 5}" stroke="{INK2}"/>')
        b.append(text(X(m), T + ph + 18, str(m), 14, 'middle', fill=INK2))
    b.append(text(L + pw / 2, H - 14, 'Meses desde la puesta en marcha', 14.5, 'middle', fill=INK2))
    b.append(f'<g transform="rotate(-90 22 {T + ph / 2})">' + text(22, T + ph / 2, 'Flujo de caja acumulado (miles de €)', 14.5, 'middle', fill=INK2) + '</g>')
    for name, net, col in series:
        y36 = -capex + net * 3
        b.append(f'<line x1="{X(0):.1f}" y1="{Y(-capex):.1f}" x2="{X(36):.1f}" y2="{Y(y36):.1f}" stroke="{col}" stroke-width="2.5" stroke-linecap="round"/>')
        b.append(text(X(36) + 10, Y(y36), f'{name}: {y36:+.0f} k€'.replace('-', '−'), 14.5, 'start', 'bold', INK))
        b.append(f'<circle cx="{X(36):.1f}" cy="{Y(y36):.1f}" r="4.5" fill="{col}" stroke="#fff" stroke-width="2"/>')
        if net * 3 >= capex:
            mpay = capex / net * 12
            b.append(f'<circle cx="{X(mpay):.1f}" cy="{Y(0):.1f}" r="5" fill="{col}" stroke="#fff" stroke-width="2"/>')
            b.append(text(X(mpay), Y(0) - 20, f'{mpay:.0f} meses', 14, 'middle', 'bold', INK))
    b.append(f'<circle cx="{X(0):.1f}" cy="{Y(-capex):.1f}" r="4.5" fill="{INK2}" stroke="#fff" stroke-width="2"/>')
    b.append(text(X(0) + 12, Y(-capex) + 17, 'CAPEX −461,5 k€', 14, 'start', fill=INK2))
    return svg(W, H, b)


for name, fn in [('arq', arquitectura), ('alerta', alerta), ('empar', emparejamiento), ('flujo', flujo)]:
    open(os.path.join(OUT, f'{name}.svg'), 'w', encoding='utf-8').write(fn())
    print(name)
