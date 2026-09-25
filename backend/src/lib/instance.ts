import os from 'node:os';
import { env } from '../config/env';

let cached: string = env.INSTANCE_ID ?? os.hostname();

/** Identificador de la instancia para /health: instance-id de EC2 (IMDSv2) o, en local, el hostname. */
export function getInstanceId(): string {
  return cached;
}

export async function resolveInstanceId(): Promise<string> {
  if (env.INSTANCE_ID) return cached;
  const base = 'http://169.254.169.254/latest';
  try {
    const tokenRes = await fetch(`${base}/api/token`, {
      method: 'PUT',
      headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '60' },
      signal: AbortSignal.timeout(400),
    });
    if (!tokenRes.ok) return cached;
    const token = await tokenRes.text();
    const idRes = await fetch(`${base}/meta-data/instance-id`, {
      headers: { 'X-aws-ec2-metadata-token': token },
      signal: AbortSignal.timeout(400),
    });
    if (idRes.ok) cached = (await idRes.text()).trim();
  } catch {
    // Fuera de EC2 no hay servicio de metadatos: se mantiene el hostname.
  }
  return cached;
}
