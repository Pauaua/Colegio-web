/**
 * Pruebas de integración de la Fase 1. Requieren la base local levantada y con seed:
 *   docker compose up -d && npm run db:migrate && npm run db:seed
 */
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

const app = createApp();
const PASSWORD = 'Colegio2026!';

async function tokenFor(username: string): Promise<string> {
  const res = await request(app).post('/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /health', () => {
  it('responde 200 con el estado de la base', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
    expect(typeof res.body.instance).toBe('string');
    expect(typeof res.body.timestamp).toBe('string');
  });
});

describe('POST /login', () => {
  it.each([
    ['directora.chorombo', 'DIRECTOR'],
    ['sostenedor.chorombo', 'SOSTENEDOR'],
    ['equipo.chorombo', 'EQUIPO_DIRECTIVO'],
    ['docente.chorombo', 'DOCENTE'],
    ['apoderado1.chorombo', 'APODERADO'],
    ['apoderado2.chorombo', 'APODERADO'],
  ])('%s inicia sesión con rol %s', async (username, role) => {
    const res = await request(app).post('/login').send({ username, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ username, role });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('acepta el email en lugar del nombre de usuario', async () => {
    const res = await request(app).post('/login').send({ username: 'directora@colegiochorombo.cl', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('directora.chorombo');
  });

  it('rechaza una contraseña incorrecta con 401', async () => {
    const res = await request(app).post('/login').send({ username: 'directora.chorombo', password: 'incorrecta' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it('valida el cuerpo con 400', async () => {
    const res = await request(app).post('/login').send({ username: 'directora.chorombo' });
    expect(res.status).toBe(400);
  });
});

describe('/documentos', () => {
  it('exige token (401)', async () => {
    expect((await request(app).get('/documentos')).status).toBe(401);
  });

  it('la directora ve todos los documentos, incluido el acta de agosto', async () => {
    const token = await tokenFor('directora.chorombo');
    const res = await request(app).get('/documentos?pageSize=100').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const titles = (res.body.documentos as { titulo: string }[]).map((d) => d.titulo);
    expect(titles).toContain('Acta reunión apoderados 08-2026');
    expect(titles).toContain('Acta reunión equipo directivo 09-2026');
  });

  it('un apoderado no ve documentos exclusivos del equipo directivo ni de otros cursos', async () => {
    const token = await tokenFor('apoderado2.chorombo');
    const res = await request(app).get('/documentos?pageSize=100').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const titles = (res.body.documentos as { titulo: string }[]).map((d) => d.titulo);
    expect(titles).toContain('Acta reunión apoderados 08-2026');
    expect(titles).toContain('Citación a reunión de apoderados 7° Básico A');
    expect(titles).not.toContain('Acta reunión equipo directivo 09-2026');
    expect(titles).not.toContain('Citación a reunión de apoderados 3° Básico A');
    expect(titles).not.toContain('Citación a entrevista de apoderado — 3° Básico A');
  });

  it('la directora registra un documento con POST /documentos (201)', async () => {
    const token = await tokenFor('directora.chorombo');
    const res = await request(app)
      .post('/documentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ titulo: 'Acta de prueba automatizada', tipo: 'ACTA', fecha: '2026-08-28', visibilidad: ['DOCENTE'] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ titulo: 'Acta de prueba automatizada', tipo: 'ACTA', fecha: '2026-08-28' });
    expect(res.body.folio).toMatch(/^ACT-2026-\d{4}$/);
    await prisma.document.delete({ where: { id: res.body.id } });
  });

  it('un apoderado no puede registrar documentos (403)', async () => {
    const token = await tokenFor('apoderado1.chorombo');
    const res = await request(app)
      .post('/documentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ titulo: 'No permitido', tipo: 'ACTA', fecha: '2026-08-28' });
    expect(res.status).toBe(403);
  });
});

describe('/api/v1/auth', () => {
  it('rota el refresh token y rechaza su reutilización', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ username: 'docente.chorombo', password: PASSWORD });
    expect(login.status).toBe(200);
    const { refreshToken } = login.body as { refreshToken: string };

    const refreshed = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(refreshToken);

    const reused = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(reused.status).toBe(401);
  });

  it('GET /auth/me devuelve el usuario autenticado', async () => {
    const token = await tokenFor('equipo.chorombo');
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: 'equipo.chorombo', role: 'EQUIPO_DIRECTIVO' });
  });
});
