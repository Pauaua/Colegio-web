import bcrypt from 'bcrypt';
import { Router } from 'express';
import { z } from 'zod';
import { recordAudit } from '../../lib/audit';
import { decrypt, encrypt } from '../../lib/crypto';
import { badRequest, forbidden, unauthorized } from '../../lib/http-error';
import { verifyMfaToken } from '../../lib/jwt';
import { buildOtpauthUri, buildQrDataUrl, generateMfaSecret, verifyTotp } from '../../lib/mfa';
import { can } from '../../lib/permissions';
import { prisma } from '../../lib/prisma';
import { passwordSchema } from '../../lib/validation';
import { currentUser, requireAuth } from '../../middleware/auth';
import { loginLimiter } from '../../middleware/rate-limit';
import { hashPassword, issueSession, login, revokeRefreshToken, rotateRefreshToken, toPublicUser } from '../../services/auth.service';

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Ingrese su usuario o email'),
  password: z.string().min(1, 'Ingrese su contraseña'),
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = loginSchema.parse(req.body ?? {});
  const result = await login(username, password, { ip: req.ip, userAgent: req.get('user-agent') });
  if (result.kind === 'invalid') throw unauthorized('Usuario o contraseña incorrectos');
  if (result.kind === 'mfa_required') {
    res.json({ mfaRequired: true, mfaToken: result.mfaToken });
    return;
  }
  res.json({ mfaRequired: false, ...result.session, user: result.user });
});

// --- Segundo paso del login con MFA ------------------------------------------------------------
const mfaVerifySchema = z.object({ mfaToken: z.string().min(1), code: z.string().trim() });

authRouter.post('/mfa/verify', loginLimiter, async (req, res) => {
  const { mfaToken, code } = mfaVerifySchema.parse(req.body ?? {});
  const payload = verifyMfaToken(mfaToken);
  if (!payload) throw unauthorized('La sesión de verificación expiró; vuelva a iniciar sesión');

  const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
  if (!user || !user.isActive || !user.mfaEnabled || !user.mfaSecret) throw unauthorized('MFA no disponible');
  if (!verifyTotp(decrypt(user.mfaSecret), code)) {
    await recordAudit({ userId: user.id, action: 'MFA_FAILED', entity: 'User', entityId: user.id });
    throw unauthorized('Código incorrecto');
  }
  const session = await issueSession(user);
  await recordAudit({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id, metadata: { mfa: true, ip: req.ip ?? null } });
  res.json({ ...session, user: toPublicUser(user) });
});

// --- Refresh y logout ----------------------------------------------------------------------------
const refreshSchema = z.object({ refreshToken: z.string().min(1) });

authRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body ?? {});
  const result = await rotateRefreshToken(refreshToken);
  if (!result) throw unauthorized('Refresh token inválido, expirado o revocado');
  res.json({ ...result.session, user: result.user });
});

authRouter.post('/logout', async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body ?? {});
  await revokeRefreshToken(refreshToken);
  res.status(204).end();
});

// --- Perfil -------------------------------------------------------------------------------------
authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: currentUser(req).id },
    include: { guardianOf: { include: { student: { include: { course: true } } } } },
  });
  res.json({
    ...toPublicUser(user),
    mfaAvailable: can(currentUser(req), 'mfa:use'),
    pupils: user.guardianOf.map((g) => ({
      id: g.student.id,
      fullName: g.student.fullName,
      course: { id: g.student.course.id, name: g.student.course.name },
    })),
  });
});

const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body ?? {});
  const user = await prisma.user.findUniqueOrThrow({ where: { id: currentUser(req).id } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw badRequest('La contraseña actual no es correcta');

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  // Se cierran las demás sesiones abiertas.
  await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await recordAudit({ userId: user.id, action: 'PASSWORD_CHANGE', entity: 'User', entityId: user.id });
  res.json({ ...(await issueSession(user)), user: toPublicUser(user) });
});

// --- Activación de MFA (solo directivos) -------------------------------------------------------
authRouter.post('/mfa/setup', requireAuth, async (req, res) => {
  const authUser = currentUser(req);
  if (!can(authUser, 'mfa:use')) throw forbidden('MFA está disponible solo para el equipo directivo');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: authUser.id } });
  if (user.mfaEnabled) throw badRequest('MFA ya está activo');

  // El secreto queda guardado (cifrado) pero inactivo hasta confirmar un código en /mfa/enable.
  const secret = generateMfaSecret();
  await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: encrypt(secret) } });
  const otpauthUrl = buildOtpauthUri(user.email, secret);
  res.json({ secret, otpauthUrl, qrDataUrl: await buildQrDataUrl(otpauthUrl) });
});

const codeSchema = z.object({ code: z.string().trim() });

authRouter.post('/mfa/enable', requireAuth, async (req, res) => {
  const { code } = codeSchema.parse(req.body ?? {});
  const user = await prisma.user.findUniqueOrThrow({ where: { id: currentUser(req).id } });
  if (!can(currentUser(req), 'mfa:use')) throw forbidden('MFA está disponible solo para el equipo directivo');
  if (!user.mfaSecret) throw badRequest('Primero genere el código QR con /auth/mfa/setup');
  if (user.mfaEnabled) throw badRequest('MFA ya está activo');
  if (!verifyTotp(decrypt(user.mfaSecret), code)) throw badRequest('Código incorrecto');

  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
  await recordAudit({ userId: user.id, action: 'MFA_ENABLE', entity: 'User', entityId: user.id });
  res.json({ mfaEnabled: true });
});

const disableSchema = z.object({ password: z.string().min(1), code: z.string().trim() });

authRouter.post('/mfa/disable', requireAuth, async (req, res) => {
  const { password, code } = disableSchema.parse(req.body ?? {});
  const user = await prisma.user.findUniqueOrThrow({ where: { id: currentUser(req).id } });
  if (!user.mfaEnabled || !user.mfaSecret) throw badRequest('MFA no está activo');
  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk || !verifyTotp(decrypt(user.mfaSecret), code)) throw badRequest('Contraseña o código incorrectos');

  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null } });
  await recordAudit({ userId: user.id, action: 'MFA_DISABLE', entity: 'User', entityId: user.id });
  res.json({ mfaEnabled: false });
});
