/**
 * Utilidades para el RUT chileno.
 * Formato canónico almacenado: cuerpo sin puntos + guion + DV en mayúscula ("12345678-K").
 */

export function cleanRut(value: string): string {
  return value.replace(/[^0-9kK]/g, "").toUpperCase();
}

export function computeRutVerifier(body: string): string {
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return "0";
  if (remainder === 10) return "K";
  return String(remainder);
}

export function isValidRut(value: string): boolean {
  const clean = cleanRut(value);
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const verifier = clean.slice(-1);
  if (!/^\d{1,8}$/.test(body)) return false;
  return computeRutVerifier(body) === verifier;
}

/** "12.345.678-5" → "12345678-5" */
export function normalizeRut(value: string): string {
  const clean = cleanRut(value);
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

/** "12345678-5" → "12.345.678-5" */
export function formatRut(value: string): string {
  const clean = cleanRut(value);
  const body = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${body}-${clean.slice(-1)}`;
}
