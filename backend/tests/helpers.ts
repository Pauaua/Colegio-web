import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

export const app = createApp();
export const PASSWORD = 'Colegio2026!';

export type SeedUser = 'directora' | 'sostenedor' | 'equipo' | 'docente' | 'apoderado1' | 'apoderado2';

const tokenCache = new Map<string, string>();

export async function tokenFor(user: SeedUser | string, password = PASSWORD): Promise<string> {
  const username = user.includes('.') ? user : `${user}.chorombo`;
  const cached = tokenCache.get(username);
  if (cached) return cached;
  const res = await request(app).post('/api/v1/auth/login').send({ username, password });
  if (res.status !== 200 || !res.body.accessToken) throw new Error(`Login fallido para ${username}: ${res.status}`);
  tokenCache.set(username, res.body.accessToken as string);
  return res.body.accessToken as string;
}

export async function api(user: SeedUser | string) {
  const token = await tokenFor(user);
  const auth = { Authorization: `Bearer ${token}` };
  return {
    get: (url: string) => request(app).get(url).set(auth),
    post: (url: string, body?: object) => request(app).post(url).set(auth).send(body ?? {}),
    patch: (url: string, body: object) => request(app).patch(url).set(auth).send(body),
    delete: (url: string) => request(app).delete(url).set(auth),
  };
}

export async function userId(key: SeedUser): Promise<number> {
  const u = await prisma.user.findUniqueOrThrow({ where: { username: `${key}.chorombo` }, select: { id: true } });
  return u.id;
}

export async function documentIdByTitle(title: string): Promise<number> {
  const d = await prisma.document.findFirstOrThrow({ where: { title }, select: { id: true } });
  return d.id;
}

export async function courseId(name: string): Promise<number> {
  const c = await prisma.course.findFirstOrThrow({ where: { name }, select: { id: true } });
  return c.id;
}

/** Elimina definitivamente los documentos creados por una prueba. */
export async function purgeDocuments(ids: number[]): Promise<void> {
  if (ids.length) await prisma.document.deleteMany({ where: { id: { in: ids } } });
}
