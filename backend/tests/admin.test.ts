/** Usuarios, cursos, estudiantes, apoderados, auditoría y dashboard. */
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { buildRut } from '../src/lib/rut';
import { api, app, courseId, userId } from './helpers';

const TEST_USERNAME = 'apoderado.prueba';
const TEST_STUDENT_RUT = buildRut(26111222);
const TEST_COURSE = 'Curso de prueba';

async function cleanup(): Promise<void> {
  await prisma.user.deleteMany({ where: { username: TEST_USERNAME } });
  await prisma.student.deleteMany({ where: { rut: TEST_STUDENT_RUT } });
  await prisma.course.deleteMany({ where: { name: TEST_COURSE } });
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('Usuarios', () => {
  it('los directivos listan usuarios; docentes y apoderados no', async () => {
    const res = await (await api('equipo')).get('/api/v1/users?role=APODERADO');
    expect(res.status).toBe(200);
    expect(res.body.items.every((u: { role: string }) => u.role === 'APODERADO')).toBe(true);
    expect(res.body.items[0].passwordHash).toBeUndefined();
    expect((await (await api('docente')).get('/api/v1/users')).status).toBe(403);
    expect((await (await api('apoderado1')).get('/api/v1/users')).status).toBe(403);
  });

  const newUser = {
    username: TEST_USERNAME,
    fullName: 'Apoderado de Prueba',
    rut: buildRut(19222333),
    email: 'apoderado.prueba@colegiochorombo.cl',
    password: 'Prueba2026',
    role: 'APODERADO',
  };

  it('EQUIPO_DIRECTIVO no puede crear usuarios (403)', async () => {
    expect((await (await api('equipo')).post('/api/v1/users', newUser)).status).toBe(403);
  });

  it('valida el dígito verificador del RUT', async () => {
    const res = await (await api('directora')).post('/api/v1/users', { ...newUser, rut: '19222333-0' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.details)).toContain('RUT');
  });

  it('la directora crea, desactiva y reactiva un usuario', async () => {
    const directora = await api('directora');
    const created = await directora.post('/api/v1/users', newUser);
    expect(created.status).toBe(201);
    const id = created.body.id as number;

    expect((await directora.post('/api/v1/users', newUser)).status).toBe(409);

    expect((await directora.delete(`/api/v1/users/${id}`)).status).toBe(204);
    const login = await request(app).post('/login').send({ username: TEST_USERNAME, password: newUser.password });
    expect(login.status).toBe(401);

    const reactivated = await directora.patch(`/api/v1/users/${id}`, { isActive: true });
    expect(reactivated.body.isActive).toBe(true);
  });

  it('nadie puede desactivarse a sí mismo', async () => {
    const directora = await api('directora');
    expect((await directora.delete(`/api/v1/users/${await userId('directora')}`)).status).toBe(400);
  });
});

describe('Cursos, estudiantes y apoderados', () => {
  it('lista los cursos con su cantidad de estudiantes', async () => {
    const res = await (await api('equipo')).get('/api/v1/courses');
    expect(res.status).toBe(200);
    expect(res.body.find((c: { name: string }) => c.name === '3° Básico A').studentCount).toBe(3);
  });

  it('el sostenedor crea curso y estudiante y lo vincula a un apoderado', async () => {
    const sostenedor = await api('sostenedor');
    const course = await sostenedor.post('/api/v1/courses', { name: TEST_COURSE, year: 2026 });
    expect(course.status).toBe(201);

    const student = await sostenedor.post('/api/v1/students', { fullName: 'Estudiante de Prueba', rut: TEST_STUDENT_RUT, courseId: course.body.id });
    expect(student.status).toBe(201);

    const guardian = await prisma.user.findUniqueOrThrow({ where: { username: TEST_USERNAME } });
    const link = await sostenedor.post(`/api/v1/guardians/${guardian.id}/students`, { studentIds: [student.body.id] });
    expect(link.status).toBe(200);
    expect(link.body.pupils).toEqual([expect.objectContaining({ fullName: 'Estudiante de Prueba', course: TEST_COURSE })]);

    // Un curso con estudiantes no se puede eliminar.
    expect((await sostenedor.delete(`/api/v1/courses/${course.body.id}`)).status).toBe(409);
  });

  it('solo se vinculan estudiantes a usuarios con rol APODERADO', async () => {
    const res = await (await api('directora')).post(`/api/v1/guardians/${await userId('docente')}/students`, {
      studentIds: [1],
    });
    expect(res.status).toBe(400);
  });

  it('EQUIPO_DIRECTIVO no modifica cursos (403)', async () => {
    expect((await (await api('equipo')).post('/api/v1/courses', { name: 'X', year: 2026 })).status).toBe(403);
  });

  it('el detalle del curso muestra estudiantes y apoderados', async () => {
    const res = await (await api('directora')).get(`/api/v1/courses/${await courseId('7° Básico A')}`);
    expect(res.status).toBe(200);
    const isidora = res.body.students.find((s: { fullName: string }) => s.fullName.startsWith('Isidora'));
    expect(isidora.guardians[0].fullName).toBe('Marcela Alejandra Fuentes Carrasco');
  });
});

describe('Auditoría', () => {
  it('registra logins y creación de usuarios, visible solo para directivos', async () => {
    const res = await (await api('equipo')).get('/api/v1/audit-logs?action=LOGIN');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect((await (await api('apoderado1')).get('/api/v1/audit-logs')).status).toBe(403);

    const actions = await (await api('directora')).get('/api/v1/audit-logs/actions');
    expect(actions.body).toEqual(expect.arrayContaining(['LOGIN', 'USER_CREATE']));
  });

  it('lista las descargas con usuario y documento', async () => {
    const res = await (await api('directora')).get('/api/v1/audit-logs/downloads');
    expect(res.status).toBe(200);
    if (res.body.items.length) expect(res.body.items[0]).toHaveProperty('document.title');
  });
});

describe('Dashboard', () => {
  it('los directivos ven KPIs globales y gráficos', async () => {
    const res = await (await api('directora')).get('/api/v1/dashboard/summary');
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('global');
    expect(res.body.kpis).toEqual({
      totalDocuments: expect.any(Number),
      uploadedThisMonth: expect.any(Number),
      downloadsThisMonth: expect.any(Number),
      pendingAcknowledgements: expect.any(Number),
    });
    expect(res.body.byType).toHaveLength(6);
    expect(res.body.byMonth).toHaveLength(12);
    expect(res.body.latestDocuments.length).toBeLessThanOrEqual(5);
  });

  it('el apoderado ve solo su resumen: pupilos y acuses pendientes', async () => {
    const res = await (await api('apoderado2')).get('/api/v1/dashboard/summary');
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('personal');
    expect(res.body.kpis.totalDocuments).toBeUndefined();
    expect(res.body.pupils).toEqual([expect.objectContaining({ course: '7° Básico A' })]);
    const titles = res.body.pendingAcknowledgements.map((d: { title: string }) => d.title);
    expect(titles).toContain('Citación a reunión de apoderados 7° Básico A');
    expect(titles).not.toContain('Citación a reunión de apoderados 3° Básico A');
  });

  it('el docente ve lo dirigido a él', async () => {
    const res = await (await api('docente')).get('/api/v1/dashboard/summary');
    expect(res.body.scope).toBe('personal');
    const titles = res.body.directedToMe.map((d: { title: string }) => d.title);
    expect(titles).toContain('Permiso administrativo docente J. Contreras');
  });
});
