import { describe, expect, it } from "vitest";
import { encodeCbor, cborDiagnostic } from "./cbor";
import { encodeSenmlCbor, senmlToJson, type SenmlRecord } from "./senml";
import { encodePublish, encodeVarInt, connectSize } from "./mqtt";
import { observation } from "./fhir";
import { TCP_IP_HEADER, TLS_RECORD_OVERHEAD, keepAliveCost, publishQos1Cost, tlsTcpBytes } from "../network/transport";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

describe("CBOR (RFC 8949, apéndice A)", () => {
  it.each([
    [0, "00"],
    [23, "17"],
    [24, "1818"],
    [100, "1864"],
    [1000, "1903e8"],
    [1000000, "1a000f4240"],
    [-1, "20"],
    [-1000, "3903e7"],
    [1.5, "f93e00"],
    [100000.0, "1a000186a0"],
    [3.4028234663852886e38, "fa7f7fffff"],
    [1.1, "fb3ff199999999999a"],
    [-4.1, "fbc010666666666666"],
    ["IETF", "6449455446"],
    ["", "60"],
    [true, "f5"],
    [null, "f6"],
  ] as const)("codifica %p como %s", (value, expected) => {
    expect(hex(encodeCbor(value))).toBe(expected);
  });

  it("codifica listas, mapas y cadenas de bytes", () => {
    expect(hex(encodeCbor([1, [2, 3], [4, 5]]))).toBe("8301820203820405");
    expect(hex(encodeCbor({ a: 1, b: [2, 3] }))).toBe("a26161016162820203");
    expect(hex(encodeCbor(new Uint8Array([1, 2, 3, 4])))).toBe("4401020304");
    expect(
      hex(
        encodeCbor(
          new Map([
            [1, 2],
            [3, 4],
          ]),
        ),
      ),
    ).toBe("a201020304");
  });

  it("produce notación de diagnóstico legible", () => {
    expect(cborDiagnostic([1, "a", { b: true }])).toBe('[1, "a", {"b": true}]');
  });
});

describe("SenML", () => {
  const pack: SenmlRecord[] = [
    { bn: "urn:dev:tf:est-0042:w:", bt: 1795496400, n: "hr", u: "beat/min", v: 72.5 },
    { n: "rr", u: "/min", v: 14 },
  ];

  it("usa las etiquetas enteras de SenML-CBOR (bn = −2, bt = −3, n = 0, u = 1, v = 2)", () => {
    const b = encodeSenmlCbor(pack);
    expect(b[0]).toBe(0x82); // lista de dos registros
    expect(b[1]).toBe(0xa5); // mapa de cinco pares
    expect(b[2]).toBe(0x21); // −2 (bn)
  });

  it("es bastante más compacto que SenML-JSON", () => {
    const cbor = encodeSenmlCbor(pack).length;
    const json = new TextEncoder().encode(senmlToJson(pack)).length;
    expect(cbor).toBeLessThan(json * 0.75);
  });
});

describe("MQTT 5", () => {
  it("codifica la longitud restante como entero variable", () => {
    expect(encodeVarInt(0)).toEqual([0]);
    expect(encodeVarInt(127)).toEqual([0x7f]);
    expect(encodeVarInt(128)).toEqual([0x80, 0x01]);
    expect(encodeVarInt(16384)).toEqual([0x80, 0x80, 0x01]);
  });

  it("construye un PUBLISH con QoS 1 de tamaño exacto", () => {
    const payload = new Uint8Array(10);
    const p = encodePublish({ topic: "tf/est-0042/obs/vector", payload, qos: 1, packetId: 7 });
    // 1 (tipo) + 1 (longitud) + 2 + 22 (tema) + 2 (id) + 1 (propiedades) + 10
    expect(p.bytes.length).toBe(39);
    expect(p.bytes[0]).toBe(0x32);
    expect(p.parts.reduce((a, x) => a + x.bytes, 0)).toBe(p.bytes.length);
  });

  it("el alias de tema ahorra el tema en los mensajes siguientes", () => {
    const payload = new Uint8Array(10);
    const first = encodePublish({ topic: "tf/est-0042/obs/vector", payload, qos: 1, topicAlias: 1 });
    const next = encodePublish({
      topic: "tf/est-0042/obs/vector",
      payload,
      qos: 1,
      topicAlias: 1,
      aliasEstablished: true,
    });
    expect(first.bytes.length - next.bytes.length).toBe(22);
  });

  it("el CONNECT incluye identificador y última voluntad", () => {
    expect(connectSize("est-0042", "tf/est-0042/estado", 9)).toBeGreaterThan(40);
  });
});

describe("transporte TLS 1.3 sobre TCP/IP", () => {
  it("añade 22 bytes por registro TLS y 52 por segmento TCP", () => {
    expect(tlsTcpBytes(100)).toEqual({ wire: 100 + TLS_RECORD_OVERHEAD + TCP_IP_HEADER, segments: 1 });
    expect(tlsTcpBytes(15500).segments).toBe(12);
  });

  it("un PUBLISH con QoS 1 cuesta el mensaje, el PUBACK y los ACK", () => {
    const c = publishQos1Cost(60);
    expect(c.up).toBe(60 + 22 + 52 + 52);
    expect(c.down).toBe(4 + 22 + 52);
    expect(keepAliveCost().up + keepAliveCost().down).toBe(2 * (2 + 22 + 52) + 52);
  });
});

describe("FHIR", () => {
  it("genera observaciones con código LOINC y unidad UCUM", () => {
    const o = observation("heartRate", 72.34, 0, "pac-1", "dev-1");
    expect(o.code.coding[0].code).toBe("8867-4");
    expect(o.valueQuantity?.value).toBe(72.3);
    expect(o.effectiveDateTime).toBe("2026-11-23T05:00:00Z");
  });
});
