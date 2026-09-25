/** Límite de intentos fallidos de login: bloquea la fuerza bruta sin afectar a logins correctos simultáneos. */
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { resetLoginLimits } from '../src/middleware/rate-limit';
import { app, PASSWORD } from './helpers';

afterEach(() => resetLoginLimits());
afterAll(async () => {
  await prisma.$disconnect();
});

describe('Límite de intentos de login', () => {
  it('60 logins correctos simultáneos desde la misma IP responden 200 (sin 429)', async () => {
    const results = await Promise.all(
      Array.from({ length: 60 }, () => request(app).post('/login').send({ username: 'apoderado1.chorombo', password: PASSWORD })),
    );
    expect(results.map((r) => r.status).filter((s) => s !== 200)).toEqual([]);
  });

  it('tras 20 intentos fallidos para un usuario responde 429, sin afectar a otro usuario', async () => {
    for (let i = 0; i < 20; i++) {
      const r = await request(app).post('/login').send({ username: 'docente.chorombo', password: 'incorrecta' });
      expect(r.status).toBe(401);
    }
    const blocked = await request(app).post('/login').send({ username: 'docente.chorombo', password: PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();

    const other = await request(app).post('/login').send({ username: 'apoderado2.chorombo', password: PASSWORD });
    expect(other.status).toBe(200);
  });

  it('las solicitudes bloqueadas no alargan el bloqueo ni cuentan como fallos', async () => {
    for (let i = 0; i < 20; i++) await request(app).post('/api/v1/auth/login').send({ username: 'equipo.chorombo', password: 'x' });
    const statuses = await Promise.all(
      Array.from({ length: 10 }, () => request(app).post('/api/v1/auth/login').send({ username: 'equipo.chorombo', password: 'x' })),
    );
    expect(new Set(statuses.map((r) => r.status))).toEqual(new Set([429]));
  });
});
