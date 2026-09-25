import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { auditRouter } from './audit';
import { authRouter } from './auth';
import { dashboardRouter } from './dashboard';
import { documentsRouter } from './documents';
import { coursesRouter, guardiansRouter, studentsRouter } from './school';
import { usersRouter } from './users';

export const v1Router = Router();

v1Router.use('/auth', authRouter);
v1Router.use('/documents', documentsRouter);
v1Router.use('/dashboard', dashboardRouter);
v1Router.use('/users', usersRouter);
v1Router.use('/courses', coursesRouter);
v1Router.use('/students', studentsRouter);
v1Router.use('/guardians', guardiansRouter);
v1Router.use('/audit-logs', auditRouter);

v1Router.get('/document-types', requireAuth, async (_req, res) => {
  res.json(await prisma.documentType.findMany({ orderBy: { id: 'asc' } }));
});
