import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { recordAudit } from '../../lib/audit';
import { badRequest } from '../../lib/http-error';
import { ADMIN_ROLES, DIRECTIVE_ROLES } from '../../lib/permissions';
import { prisma } from '../../lib/prisma';
import { idParam, pageQuery, passwordSchema, roleSchema, rutSchema } from '../../lib/validation';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth';
import { hashPassword, toPublicUser } from '../../services/auth.service';

/**
 * Usuarios. Lectura: directivos (p. ej. para elegir destinatarios al subir un documento).
 * Creación, edición y desactivación: solo director y sostenedor.
 */
export const usersRouter = Router();
usersRouter.use(requireAuth);

const requireAdmin = requireRole(...ADMIN_ROLES);

const listSchema = z.object({
  role: roleSchema.optional(),
  q: z.string().trim().max(100).optional(),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  ...pageQuery,
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

usersRouter.get('/', requireRole(...DIRECTIVE_ROLES), async (req, res) => {
  const query = listSchema.parse(req.query);
  const where: Prisma.UserWhereInput = {
    role: query.role,
    isActive: query.isActive,
    ...(query.q
      ? { OR: [{ fullName: { contains: query.q } }, { username: { contains: query.q } }, { email: { contains: query.q } }, { rut: { contains: query.q } }] }
      : {}),
  };
  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  res.json({ total, page: query.page, pageSize: query.pageSize, items: users.map(toPublicUser) });
});

usersRouter.get('/:id', requireRole(...DIRECTIVE_ROLES), async (req, res) => {
  const { id } = idParam.parse(req.params);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: { guardianOf: { include: { student: { include: { course: true } } } } },
  });
  res.json({
    ...toPublicUser(user),
    pupils: user.guardianOf.map((g) => ({ id: g.student.id, fullName: g.student.fullName, course: g.student.course.name })),
  });
});

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,60}$/, 'Use de 3 a 60 caracteres: letras, números, punto, guion o guion bajo'),
  fullName: z.string().trim().min(3).max(120),
  rut: rutSchema,
  email: z.email('Email inválido').trim().toLowerCase(),
  password: passwordSchema,
  role: roleSchema,
  phone: z.string().trim().max(20).nullish(),
});

usersRouter.post('/', requireAdmin, async (req, res) => {
  const body = createSchema.parse(req.body ?? {});
  const { password, ...data } = body;
  const user = await prisma.user.create({ data: { ...data, passwordHash: await hashPassword(password) } });
  await recordAudit({ userId: currentUser(req).id, action: 'USER_CREATE', entity: 'User', entityId: user.id, metadata: { role: user.role } });
  res.status(201).json(toPublicUser(user));
});

const updateSchema = createSchema.omit({ username: true, password: true }).partial().extend({
  isActive: z.boolean().optional(),
  password: passwordSchema.optional(),
});

usersRouter.patch('/:id', requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { password, ...data } = updateSchema.parse(req.body ?? {});
  const me = currentUser(req);
  if (id === me.id && (data.role !== undefined || data.isActive === false)) {
    throw badRequest('No puede cambiar su propio rol ni desactivar su propia cuenta');
  }
  const user = await prisma.user.update({
    where: { id },
    data: { ...data, ...(password ? { passwordHash: await hashPassword(password) } : {}) },
  });
  if (data.isActive === false || password) {
    await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await recordAudit({
    userId: me.id,
    action: 'USER_UPDATE',
    entity: 'User',
    entityId: id,
    metadata: { fields: [...Object.keys(data), ...(password ? ['password'] : [])] },
  });
  res.json(toPublicUser(user));
});

/** No se borran usuarios (su autoría y auditoría deben conservarse): se desactivan. */
usersRouter.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  if (id === currentUser(req).id) throw badRequest('No puede desactivar su propia cuenta');
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  await recordAudit({ userId: currentUser(req).id, action: 'USER_DEACTIVATE', entity: 'User', entityId: id });
  res.status(204).end();
});
