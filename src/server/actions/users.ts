"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeRut } from "@/lib/rut";
import { authorize } from "@/lib/session";
import {
  changePasswordSchema,
  createUserSchema,
  NEW_STUDENT,
  profileSchema,
  updateUserSchema,
  type PupilInput,
} from "@/lib/validations/user";
import {
  authFailure,
  isUniqueViolation,
  uniqueViolationFields,
  type ActionResult,
} from "@/server/action-utils";

const BCRYPT_ROUNDS = 10;

function duplicateMessage(fields: string) {
  if (fields.includes("rut")) return "Ya existe un usuario con ese RUT";
  if (fields.includes("email")) return "Ya existe un usuario con ese correo";
  return "Ya existe un usuario con esos datos";
}

/** Mensaje si el RUT o el correo ya pertenecen a otro usuario. */
async function findDuplicate(rut: string, email: string, exceptId?: string): Promise<string | null> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ rut }, { email }], ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { rut: true },
  });
  if (!existing) return null;
  return existing.rut === rut ? "Ya existe un usuario con ese RUT" : "Ya existe un usuario con ese correo";
}

function revalidateUsers(userId?: string) {
  revalidatePath("/usuarios", "layout");
  if (userId) revalidatePath(`/usuarios/${userId}`);
}

// ─── Crear ──────────────────────────────────────────────────────────────

/** Cursos del docente: solo aplica al rol DOCENTE (para otros roles se ignoran). */
async function resolveTeacherCourses(role: string, courseIds: string[]) {
  if (role !== "DOCENTE") return { ok: true as const, courses: [] };
  const ids = [...new Set(courseIds)];
  const courses = await prisma.course.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, year: true },
  });
  if (courses.length !== ids.length) return { ok: false as const, error: "Uno de los cursos no existe" };
  return { ok: true as const, courses };
}

const courseLabel = (c: { name: string; year: number }) => `${c.name} ${c.year}`;

/** Valida los pupilos del formulario: estudiantes existentes y nuevos (con curso válido y RUT libre). */
async function resolvePupils(input: PupilInput[]) {
  const existingIds = [...new Set(input.filter((p) => p.studentId !== NEW_STUDENT).map((p) => p.studentId))];
  const newOnes = input
    .filter((p) => p.studentId === NEW_STUDENT)
    .map((p) => ({ ...p, rut: normalizeRut(p.rut) }));

  const newRuts = newOnes.map((p) => p.rut);
  if (new Set(newRuts).size !== newRuts.length) {
    return { ok: false as const, error: "Hay dos estudiantes nuevos con el mismo RUT" };
  }

  const [students, courses, takenRut] = await Promise.all([
    prisma.student.findMany({ where: { id: { in: existingIds } }, select: { id: true, fullName: true } }),
    prisma.course.findMany({
      where: { id: { in: [...new Set(newOnes.map((p) => p.courseId))] } },
      select: { id: true, name: true, year: true },
    }),
    newRuts.length > 0
      ? prisma.student.findFirst({ where: { rut: { in: newRuts } }, select: { fullName: true } })
      : null,
  ]);
  if (students.length !== existingIds.length)
    return { ok: false as const, error: "Uno de los estudiantes no existe" };
  if (takenRut) {
    return {
      ok: false as const,
      error: `Ya existe un estudiante con ese RUT (${takenRut.fullName}): elígelo en la lista de su curso`,
    };
  }
  const created = [];
  for (const pupil of newOnes) {
    const course = courses.find((c) => c.id === pupil.courseId);
    if (!course) return { ok: false as const, error: "Uno de los cursos no existe" };
    created.push({ fullName: pupil.fullName, rut: pupil.rut, course });
  }
  return { ok: true as const, existing: students, created };
}

export async function createUserAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  let actor;
  try {
    actor = await authorize("user:manage");
  } catch (error) {
    return authFailure(error);
  }
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const data = parsed.data;
  const duplicate = await findDuplicate(normalizeRut(data.rut), data.email.toLowerCase());
  if (duplicate) return { ok: false, error: duplicate };

  const pupils =
    data.role === "APODERADO"
      ? await resolvePupils(data.pupils)
      : { ok: true as const, existing: [], created: [] };
  if (!pupils.ok) return pupils;
  const teacherCourses = await resolveTeacherCourses(data.role, data.courseIds);
  if (!teacherCourses.ok) return teacherCourses;

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          fullName: data.fullName,
          rut: normalizeRut(data.rut),
          email: data.email.toLowerCase(),
          role: data.role,
          phone: data.phone || null,
          passwordHash: await bcrypt.hash(data.password, BCRYPT_ROUNDS),
        },
        select: { id: true },
      });
      await logAudit(
        {
          userId: actor.id,
          action: "CREATE_USER",
          entity: "User",
          entityId: created.id,
          metadata: {
            fullName: data.fullName,
            email: data.email.toLowerCase(),
            role: data.role,
            courses: teacherCourses.courses.length ? teacherCourses.courses.map(courseLabel) : undefined,
          },
        },
        tx,
      );
      await tx.teacherCourse.createMany({
        data: teacherCourses.courses.map((c) => ({ teacherId: created.id, courseId: c.id })),
      });

      // Todo en la misma transacción: si algo falla, no quedan apoderados ni estudiantes huérfanos.
      for (const student of pupils.created) {
        const newStudent = await tx.student.create({
          data: {
            fullName: student.fullName,
            rut: student.rut,
            courseId: student.course.id,
            guardians: { create: { guardianId: created.id } },
          },
          select: { id: true },
        });
        await logAudit(
          {
            userId: actor.id,
            action: "CREATE_STUDENT",
            entity: "Student",
            entityId: newStudent.id,
            metadata: { fullName: student.fullName, course: `${student.course.name} ${student.course.year}` },
          },
          tx,
        );
        await logAudit(
          {
            userId: actor.id,
            action: "LINK_GUARDIAN",
            entity: "Student",
            entityId: newStudent.id,
            metadata: { fullName: student.fullName, guardian: data.fullName },
          },
          tx,
        );
      }
      for (const student of pupils.existing) {
        await tx.guardianStudent.create({ data: { guardianId: created.id, studentId: student.id } });
        await logAudit(
          {
            userId: actor.id,
            action: "LINK_GUARDIAN",
            entity: "Student",
            entityId: student.id,
            metadata: { fullName: student.fullName, guardian: data.fullName },
          },
          tx,
        );
      }
      return created;
    });
    revalidateUsers();
    if (pupils.existing.length + pupils.created.length + teacherCourses.courses.length > 0) {
      revalidatePath("/cursos", "layout");
    }
    return { ok: true, data: { id: user.id } };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: duplicateMessage(uniqueViolationFields(error)) };
    throw error;
  }
}

// ─── Editar ─────────────────────────────────────────────────────────────

export async function updateUserAction(userId: string, input: unknown): Promise<ActionResult> {
  let actor;
  try {
    actor = await authorize("user:manage");
  } catch (error) {
    return authFailure(error);
  }
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const data = parsed.data;

  const current = await prisma.user.findUnique({
    where: { id: String(userId) },
    include: {
      teachingCourses: { select: { courseId: true } },
      students: { select: { student: { select: { id: true, fullName: true } } } },
    },
  });
  if (!current) return { ok: false, error: "El usuario no existe" };
  if (current.id === actor.id && data.role !== current.role) {
    return { ok: false, error: "No puedes cambiar tu propio rol. Pídeselo a otro director." };
  }
  const duplicate = await findDuplicate(normalizeRut(data.rut), data.email.toLowerCase(), current.id);
  if (duplicate) return { ok: false, error: duplicate };
  const teacherCourses = await resolveTeacherCourses(data.role, data.courseIds);
  if (!teacherCourses.ok) return teacherCourses;
  const previousCourseIds = current.teachingCourses.map((t) => t.courseId);
  const coursesChanged =
    previousCourseIds.length !== teacherCourses.courses.length ||
    teacherCourses.courses.some((c) => !previousCourseIds.includes(c.id));
  // Si deja de ser apoderado, sus vínculos con estudiantes ya no corresponden (seguiría
  // recibiendo los documentos de esos cursos).
  const droppedPupils = current.role === "APODERADO" && data.role !== "APODERADO" ? current.students : [];

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: current.id },
        data: {
          fullName: data.fullName,
          rut: normalizeRut(data.rut),
          email: data.email.toLowerCase(),
          role: data.role,
          phone: data.phone || null,
          ...(data.password ? { passwordHash: await bcrypt.hash(data.password, BCRYPT_ROUNDS) } : {}),
        },
      });
      await logAudit(
        {
          userId: actor.id,
          action: "UPDATE_USER",
          entity: "User",
          entityId: current.id,
          metadata: {
            fullName: data.fullName,
            passwordReset: Boolean(data.password),
            courses: coursesChanged ? teacherCourses.courses.map(courseLabel) : undefined,
          },
        },
        tx,
      );
      // Cursos del docente: se reemplaza el conjunto (vacío si ya no es docente).
      if (coursesChanged) {
        await tx.teacherCourse.deleteMany({ where: { teacherId: current.id } });
        await tx.teacherCourse.createMany({
          data: teacherCourses.courses.map((c) => ({ teacherId: current.id, courseId: c.id })),
        });
      }
      for (const { student } of droppedPupils) {
        await tx.guardianStudent.delete({
          where: { guardianId_studentId: { guardianId: current.id, studentId: student.id } },
        });
        await logAudit(
          {
            userId: actor.id,
            action: "UNLINK_GUARDIAN",
            entity: "Student",
            entityId: student.id,
            metadata: { fullName: student.fullName, guardian: data.fullName },
          },
          tx,
        );
      }
      if (data.role !== current.role) {
        await logAudit(
          {
            userId: actor.id,
            action: "CHANGE_ROLE",
            entity: "User",
            entityId: current.id,
            metadata: { fullName: data.fullName, from: current.role, to: data.role },
          },
          tx,
        );
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: duplicateMessage(uniqueViolationFields(error)) };
    throw error;
  }

  revalidateUsers(current.id);
  if (coursesChanged || droppedPupils.length > 0) revalidatePath("/cursos", "layout");
  return { ok: true };
}

// ─── Activar / desactivar ───────────────────────────────────────────────

export async function setUserActiveAction(userId: string, active: boolean): Promise<ActionResult> {
  let actor;
  try {
    actor = await authorize("user:manage");
  } catch (error) {
    return authFailure(error);
  }
  const target = await prisma.user.findUnique({ where: { id: String(userId) } });
  if (!target) return { ok: false, error: "El usuario no existe" };
  if (target.id === actor.id) return { ok: false, error: "No puedes desactivar tu propia cuenta" };
  if (target.isActive === active) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { isActive: active } });
    await logAudit(
      {
        userId: actor.id,
        action: active ? "ACTIVATE_USER" : "DEACTIVATE_USER",
        entity: "User",
        entityId: target.id,
        metadata: { fullName: target.fullName },
      },
      tx,
    );
  });

  revalidateUsers(target.id);
  return { ok: true };
}

// ─── Mi perfil ──────────────────────────────────────────────────────────

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  let actor;
  try {
    actor = await authorize();
  } catch (error) {
    return authFailure(error);
  }
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  await prisma.user.update({ where: { id: actor.id }, data: { phone: parsed.data.phone || null } });
  revalidatePath("/perfil");
  return { ok: true };
}

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  let actor;
  try {
    actor = await authorize();
  } catch (error) {
    return authFailure(error);
  }
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    return { ok: false, error: "La contraseña actual no es correcta" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actor.id },
      data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, BCRYPT_ROUNDS) },
    });
    await logAudit({ userId: actor.id, action: "CHANGE_PASSWORD", entity: "User", entityId: actor.id }, tx);
  });
  return { ok: true };
}
