import { authenticator } from 'otplib';
import QRCode from 'qrcode';

const ISSUER = 'Gestor Documental Chorombo Bajo';

// otplib 12 es CommonJS: funciona igual en Node 20 (EC2) y en Jest. `window: 1` tolera ±30 s de desfase de reloj.
const totp = authenticator.clone({ window: 1 });

export function generateMfaSecret(): string {
  return totp.generateSecret();
}

export function buildOtpauthUri(label: string, secret: string): string {
  return totp.keyuri(label, ISSUER, secret);
}

export function buildQrDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri, { margin: 1, width: 240, color: { dark: '#3E3B5C', light: '#FFFFFF' } });
}

export function verifyTotp(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    return totp.verify({ token: code, secret });
  } catch {
    return false;
  }
}

/** Solo para pruebas automatizadas. */
export function currentTotp(secret: string): string {
  return totp.generate(secret);
}
