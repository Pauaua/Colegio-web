import "server-only";

import { prisma } from "@/lib/prisma";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;

const emailKey = (email: string) => `email:${email}`;
const ipKey = (ip: string) => `ip:${ip}`;

async function countRecentFailures(key: string, limit: number) {
  const windowStart = new Date(Date.now() - WINDOW_MS);
  // Un login exitoso "resetea" el contador para esa clave.
  const lastSuccess = await prisma.loginAttempt.findFirst({
    where: { key, success: true, createdAt: { gte: windowStart } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const since = lastSuccess?.createdAt ?? windowStart;
  const failures = await prisma.loginAttempt.count({
    where: { key, success: false, createdAt: { gt: since } },
  });
  return failures >= limit;
}

/**
 * Rate limiting persistente (en PostgreSQL) para que funcione entre
 * instancias serverless de Vercel: 5 fallos por correo o 20 por IP en 15 minutos.
 */
export async function isLoginRateLimited(email: string, ip: string | null) {
  const [byEmail, byIp] = await Promise.all([
    countRecentFailures(emailKey(email), MAX_FAILURES_PER_EMAIL),
    ip ? countRecentFailures(ipKey(ip), MAX_FAILURES_PER_IP) : false,
  ]);
  return byEmail || byIp;
}

export async function recordLoginAttempt(email: string, ip: string | null, success: boolean) {
  const keys = [emailKey(email), ...(ip ? [ipKey(ip)] : [])];
  await prisma.loginAttempt.createMany({
    data: keys.map((key) => ({ key, success })),
  });
  if (success) {
    // Limpieza oportunista de intentos antiguos.
    await prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
  }
}

export function getClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return headers.get("x-real-ip");
}
