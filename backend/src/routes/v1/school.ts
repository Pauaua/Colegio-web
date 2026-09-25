/** Cursos, estudiantes y vínculo apoderado–estudiante. Lectura: directivos. Cambios: director y sostenedor. */
import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { recordAudit } from '../../lib/audit';
import { badRequest, conflict } from '../../lib/http-error';
import { ADMIN_ROLES, DIRECTIVE_ROLES } from '../../lib/permissions';
import { prisma } from '../../lib/prisma';
import { idList, idParam, rutSchema } from '../../lib/validation';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth';

const requireDirective = requireRole(...DIRECTIVE_ROLES);
const requireAdmin = requireRole(...ADMIN_ROLES);

// --- Cursos -------------------------------------------------------------------------------------
export const coursesRouter = Router();
coursesRouter.use(requireAuth);

const courseSchema = z.object({
  name: z.string().trim().min(2).max(60),
  year: z.coerce.number().int().min(2000).max(2100),
});

coursesRouter.get('/', requireDirective, async (req, res) => {
  const year = z.coerce.number().int().optional().parse(req.query.year);
  const courses = await prisma.course.findMany({
    where: { year },
    orderBy: [{ year: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { students: true } } },
  });
  res.json(courses.map((c) => ({ id: c.id, name: c.name, year: c.year, studentCount: c._count.students })));
});

coursesRouter.get('/:id', requireDirective, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const course = await prisma.course.findUniqueOrThrow({
    where: { id },
    include: {
      students: {
        orderBy: { fullName: 'asc' },
        include: { guardians: { include: { guardian: { select: { id: true, fullName: true, email: true, phone: true } } } } },
      },
    },
  });
  res.json({
    id: course.id,
    name: course.name,
    year: course.year,
    students: course.students.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      rut: s.rut,
      guardians: s.guardians.map((g) => g.guardian),
    })),
  });
});

coursesRouter.post('/', requireAdmin, async (req, res) => {
  const course = await prisma.course.create({ data: courseSchema.parse(req.body ?? {}) });
  await recordAudit({ userId: currentUser(req).id, action: 'COURSE_CREATE', entity: 'Course', entityId: course.id });
  res.status(201).json(course);
});

coursesRouter.patch('/:id', requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const course = await prisma.course.update({ where: { id }, data: courseSchema.partial().parse(req.body ?? {}) });
  await recordAudit({ userId: currentUser(req).id, action: 'COURSE_UPDATE', entity: 'Course', entityId: id });
  res.json(course);
});

coursesRouter.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  if ((await prisma.student.count({ where: { courseId: id } })) > 0) {
    throw conflict('El curso tiene estudiantes; muévalos a otro curso antes de eliminarlo');
  }
  await prisma.course.delete({ where: { id } });
  await recordAudit({ userId: currentUser(req).id, action: 'COURSE_DELETE', entity: 'Course', entityId: id });
  res.status(204).end();
});

// --- Estudiantes --------------------------------------------------------------------------------
export const studentsRouter = Router();
studentsRouter.use(requireAuth);

const studentSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  rut: rutSchema,
  courseId: z.coerce.number().int().positive(),
});

studentsRouter.get('/', requireDirective, async (req, res) => {
  const query = z
    .object({ courseId: z.coerce.number().int().positive().optional(), q: z.string().trim().max(100).optional() })
    .parse(req.query);
  const where: Prisma.StudentWhereInput = {
    courseId: query.courseId,
    ...(query.q ? { OR: [{ fullName: { contains: query.q } }, { rut: { contains: query.q } }] } : {}),
  };
  const students = await prisma.student.findMany({
    where,
    orderBy: { fullName: 'asc' },
    include: { course: true, guardians: { include: { guardian: { select: { id: true, fullName: true } } } } },
  });
  res.json(
    students.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      rut: s.rut,
      course: { id: s.course.id, name: s.course.name, year: s.course.year },
      guardians: s.guardians.map((g) => g.guardian),
    })),
  );
});

studentsRouter.post('/', requireAdmin, async (req, res) => {
  const student = await prisma.student.create({ data: studentSchema.parse(req.body ?? {}) });
  await recordAudit({ userId: currentUser(req).id, action: 'STUDENT_CREATE', entity: 'Student', entityId: student.id });
  res.status(201).json(student);
});

studentsRouter.patch('/:id', requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const student = await prisma.student.update({ where: { id }, data: studentSchema.partial().parse(req.body ?? {}) });
  await recordAudit({ userId: currentUser(req).id, action: 'STUDENT_UPDATE', entity: 'Student', entityId: id });
  res.json(student);
});

studentsRouter.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  await prisma.student.delete({ where: { id } });
  await recordAudit({ userId: currentUser(req).id, action: 'STUDENT_DELETE', entity: 'Student', entityId: id });
  res.status(204).end();
});

// --- Apoderados ---------------------------------------------------------------------------------
export const guardiansRouter = Router();
guardiansRouter.use(requireAuth);

const linkSchema = z.object({
  studentIds: idList.min(1, 'Indique al menos un estudiante'),
  /** true: reemplaza los pupilos actuales; false (defecto): los agrega. */
  replace: z.boolean().default(false),
});

async function assertGuardian(id: number): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: { role: true } });
  if (user.role !== 'APODERADO') throw badRequest('El usuario indicado no tiene rol APODERADO');
}

async function pupilsOf(guardianId: number) {
  const links = await prisma.guardianStudent.findMany({
    where: { guardianId },
    include: { student: { include: { course: true } } },
    orderBy: { student: { fullName: 'asc' } },
  });
  return links.map((l) => ({ id: l.student.id, fullName: l.student.fullName, course: l.student.course.name }));
}

guardiansRouter.post('/:id/students', requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { studentIds, replace } = linkSchema.parse(req.body ?? {});
  await assertGuardian(id);
  const ids = [...new Set(studentIds)];
  if ((await prisma.student.count({ where: { id: { in: ids } } })) !== ids.length) throw badRequest('Algún estudiante no existe');

  await prisma.$transaction([
    ...(replace ? [prisma.guardianStudent.deleteMany({ where: { guardianId: id } })] : []),
    prisma.guardianStudent.createMany({ data: ids.map((studentId) => ({ guardianId: id, studentId })), skipDuplicates: true }),
  ]);
  await recordAudit({ userId: currentUser(req).id, action: 'GUARDIAN_LINK', entity: 'User', entityId: id, metadata: { studentIds: ids, replace } });
  res.json({ guardianId: id, pupils: await pupilsOf(id) });
});

guardiansRouter.delete('/:id/students/:studentId', requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const studentId = z.coerce.number().int().positive().parse(req.params.studentId);
  await prisma.guardianStudent.deleteMany({ where: { guardianId: id, studentId } });
  await recordAudit({ userId: currentUser(req).id, action: 'GUARDIAN_UNLINK', entity: 'User', entityId: id, metadata: { studentId } });
  res.json({ guardianId: id, pupils: await pupilsOf(id) });
});
