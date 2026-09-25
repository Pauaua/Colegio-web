/** Utilidades para el RUT chileno (Rol Único Tributario). */

export function cleanRut(rut: string): string {
  return rut.replace(/[^0-9kK]/g, '').toUpperCase();
}

/** Calcula el dígito verificador con el algoritmo de módulo 11. */
export function computeDv(body: string | number): string {
  const digits = String(body).split('').reverse();
  let sum = 0;
  let factor = 2;
  for (const d of digits) {
    sum += Number(d) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  if (rest === 11) return '0';
  if (rest === 10) return 'K';
  return String(rest);
}

export function isValidRut(rut: string): boolean {
  const clean = cleanRut(rut);
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return false;
  return computeDv(clean.slice(0, -1)) === clean.slice(-1);
}

/** Normaliza al formato `12345678-9` (sin puntos), que es como se guarda. */
export function normalizeRut(rut: string): string {
  const clean = cleanRut(rut);
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

export function buildRut(body: number): string {
  return `${body}-${computeDv(body)}`;
}
