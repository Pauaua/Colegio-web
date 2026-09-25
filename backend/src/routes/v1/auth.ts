import { Router } from 'express';
import { z } from 'zod';
import { unauthorized } from '../../lib/http-error';
import { prisma } from '../../lib/prisma';
import { currentUser, requireAuth } from '../../middleware/auth';
import { loginLimiter } from '../../middleware/rate-limit';
import { login, revokeRefreshToken, rotateRefreshToken, toPublicUser } from '../../services/auth.service';

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

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: currentUser(req).id } });
  res.json(toPublicUser(user));
});
