/** MFA TOTP: activación desde el perfil y login en dos pasos. Usa un usuario creado solo para la prueba. */
import request from 'supertest';
import { currentTotp } from '../src/lib/mfa';
import { prisma } from '../src/lib/prisma';
import { buildRut } from '../src/lib/rut';
import { api, app } from './helpers';

const USERNAME = 'mfa.prueba';
const PASSWORD = 'MfaPrueba2026';
let secret: string;
let accessToken: string;

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { username: USERNAME } });
  const res = await (await api('directora')).post('/api/v1/users', {
    username: USERNAME,
    fullName: 'Usuaria de Prueba MFA',
    rut: buildRut(18765432),
    email: 'mfa.prueba@colegiochorombo.cl',
    password: PASSWORD,
    role: 'EQUIPO_DIRECTIVO',
  });
  expect(res.status).toBe(201);
  const login = await request(app).post('/api/v1/auth/login').send({ username: USERNAME, password: PASSWORD });
  accessToken = login.body.accessToken;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: USERNAME } });
  await prisma.$disconnect();
});

const auth = () => ({ Authorization: `Bearer ${accessToken}` });

describe('MFA TOTP', () => {
  it('no está disponible para docentes ni apoderados', async () => {
    expect((await (await api('docente')).post('/api/v1/auth/mfa/setup')).status).toBe(403);
    expect((await (await api('apoderado1')).post('/api/v1/auth/mfa/setup')).status).toBe(403);
  });

  it('genera el secreto y el QR, y guarda el secreto cifrado', async () => {
    const res = await request(app).post('/api/v1/auth/mfa/setup').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    secret = res.body.secret;

    const row = await prisma.user.findUniqueOrThrow({ where: { username: USERNAME } });
    expect(row.mfaEnabled).toBe(false);
    expect(row.mfaSecret).not.toContain(secret);
  });

  it('rechaza un código incorrecto y activa con el correcto', async () => {
    expect((await request(app).post('/api/v1/auth/mfa/enable').set(auth()).send({ code: '000000' })).status).toBe(400);
    const ok = await request(app).post('/api/v1/auth/mfa/enable').set(auth()).send({ code: currentTotp(secret) });
    expect(ok.status).toBe(200);
    expect(ok.body.mfaEnabled).toBe(true);
  });

  it('con MFA activo el login pide el código y luego entrega los tokens', async () => {
    const step1 = await request(app).post('/api/v1/auth/login').send({ username: USERNAME, password: PASSWORD });
    expect(step1.status).toBe(200);
    expect(step1.body).toMatchObject({ mfaRequired: true });
    expect(step1.body.accessToken).toBeUndefined();

    const bad = await request(app).post('/api/v1/auth/mfa/verify').send({ mfaToken: step1.body.mfaToken, code: '123456' });
    expect(bad.status).toBe(401);

    const step2 = await request(app).post('/api/v1/auth/mfa/verify').send({ mfaToken: step1.body.mfaToken, code: currentTotp(secret) });
    expect(step2.status).toBe(200);
    expect(step2.body.accessToken).toEqual(expect.any(String));
    expect(step2.body.user.mfaEnabled).toBe(true);
  });

  it('la ruta de compatibilidad /login no entrega token sin el segundo factor', async () => {
    const res = await request(app).post('/login').send({ username: USERNAME, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('MFA_REQUIRED');
    expect(res.body.token).toBeUndefined();
  });

  it('un access token no sirve como token MFA', async () => {
    const res = await request(app).post('/api/v1/auth/mfa/verify').send({ mfaToken: accessToken, code: currentTotp(secret) });
    expect(res.status).toBe(401);
  });

  it('se desactiva con contraseña y código', async () => {
    const res = await request(app)
      .post('/api/v1/auth/mfa/disable')
      .set(auth())
      .send({ password: PASSWORD, code: currentTotp(secret) });
    expect(res.status).toBe(200);
    const login = await request(app).post('/api/v1/auth/login').send({ username: USERNAME, password: PASSWORD });
    expect(login.body.mfaRequired).toBe(false);
  });
});
