import { describe, expect, it } from "vitest";

import { computeRutVerifier, formatRut, isValidRut, normalizeRut } from "@/lib/rut";

describe("rut", () => {
  it("calcula el dígito verificador", () => {
    expect(computeRutVerifier("12345678")).toBe("5");
    expect(computeRutVerifier("11111111")).toBe("1");
    expect(computeRutVerifier("10000013")).toBe("K");
  });

  it("valida RUT con y sin formato", () => {
    expect(isValidRut("12.345.678-5")).toBe(true);
    expect(isValidRut("123456785")).toBe(true);
    expect(isValidRut("12.345.678-9")).toBe(false);
    expect(isValidRut("abc")).toBe(false);
    expect(isValidRut("")).toBe(false);
  });

  it("acepta K minúscula", () => {
    expect(isValidRut("10.000.013-k")).toBe(true);
  });

  it("normaliza y formatea", () => {
    expect(normalizeRut("12.345.678-5")).toBe("12345678-5");
    expect(formatRut("123456785")).toBe("12.345.678-5");
  });
});
