import { buildRut, computeDv, isValidRut, normalizeRut } from '../src/lib/rut';

describe('RUT chileno', () => {
  it('calcula el dígito verificador (incluidos K y 0)', () => {
    expect(computeDv(11111111)).toBe('1');
    expect(computeDv(12345678)).toBe('5');
    expect(computeDv(10000013)).toBe('K');
    expect(computeDv(10000004)).toBe('0');
  });

  it('valida RUT con y sin formato', () => {
    expect(isValidRut('12.345.678-5')).toBe(true);
    expect(isValidRut('123456785')).toBe(true);
    expect(isValidRut('12345678-9')).toBe(false);
    expect(isValidRut('abc')).toBe(false);
  });

  it('normaliza y construye RUT', () => {
    expect(normalizeRut('12.345.678-5')).toBe('12345678-5');
    expect(normalizeRut('10.000.013-k')).toBe('10000013-K');
    expect(isValidRut(buildRut(15836247))).toBe(true);
  });
});
