import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { authRouter } from './auth';

export const v1Router = Router();

v1Router.use('/auth', authRouter);

v1Router.get('/document-types', requireAuth, async (_req, res) => {
  res.json(await prisma.documentType.findMany({ orderBy: { id: 'asc' } }));
});
