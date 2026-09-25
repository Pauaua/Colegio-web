"use server";

import { revalidatePath } from "next/cache";

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeRut } from "@/lib/rut";
import { authorize } from "@/lib/session";
import { courseSchema, studentSchema } from "@/lib/validations/course";
import { authFailure, isUniqueViolation, type ActionResult } from "@/server/action-utils";

async function authorizeCourses() {
  return authorize("course:manage");
}

function revalidateCourses(courseId?: string) {
  revalidatePath("/cursos");
  if (courseId) revalidatePath(`/cursos/${courseId}`);
}

// ─── Cursos ─────────────────────────────────────────────────────────────

export async function createCourseAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  let actor;
  try {
    actor = await authorizeCourses();
  } catch (error) {
    return authFailure(error);
  }
  const parsed = courseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  try {
    const course = await prisma.$transaction(async (tx) => {
      const created = await tx.course.create({ data: parsed.data, select: { id: true } });
      await logAudit(
        {
          userId: actor.id,
          action: "CREATE_COURSE",
          entity: "Course",
          entityId: created.id,
          metadata: { name: `${parsed.data.name} ${parsed.data.year}` },
        },
        tx,
      );
      return created;
    });
    revalidateCourses();
    return { ok: true, data: { id: course.id } };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "Ya existe un curso con ese nombre en ese año" };
    throw error;
  }
}

export async function updateCourseAction(courseId: string, input: unknown): Promise<ActionResult> {
  let actor;
  try {
    actor = await authorizeCourses();
  } catch (error) {
    return authFailure(error);
  }
  const parsed = courseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const course = await prisma.course.findUnique({ where: { id: String(courseId) } });
  if (!course) return { ok: false, error: "El curso no existe" };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.course.update({ where: { id: course.id }, data: parsed.data });
      await logAudit(
        {
          userId: actor.id,
          action: "UPDATE_COURSE",
          entity: "Course",
          entityId: course.id,
          metadata: {
            name: `${parsed.data.name} ${parsed.data.year}`,
            from: `${course.name} ${course.year}`,
          },
        },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "Ya existe un curso con ese nombre en ese año" };
    throw error;
  }
  revalidateCourses(course.id);
  return { ok: true };
}

export async function deleteCourseAction(courseId: string): Promise<ActionResult> {
  let actor;
  try {
    actor = await authorizeCourses();
  } catch (error) {
    return authFailure(error);
  }
  const course = await prisma.course.findUnique({
    where: { id: String(courseId) },
    include: { _count: { select: { students: true } } },
  });
  if (!course) return { ok: false, error: "El curso no existe" };
  if (course._count.students > 0) {
    return { ok: false, error: "El curso tiene estudiantes. Elimínalos o muévelos antes de borrarlo." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.course.delete({ where: { id: course.id } });
    await logAudit(
      {
        userId: actor.id,
        action: "DELETE_COURSE",
        entity: "Course",
        entityId: course.id,
        metadata: { name: `${course.name} ${course.year}` },
      },
      tx,
    );
  });
  revalidateCourses();
  return { ok: true };
}

// ─── Estudiantes ────────────────────────────────────────────────────────

export async function createStudentAction(courseId: string, input: unknown): Promise<ActionResult> {
  let actor;
  try {
    actor = await authorizeCourses();
  } catch (error) {
    return authFailure(error);
  }
  const parsed = studentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const course = await prisma.course.findUnique({ where: { id: String(courseId) } });
  if (!course) return { ok: false, error: "El curso no existe" };

  const rut = normalizeRut(parsed.data.rut);
  if (await prisma.student.findUnique({ where: { rut } })) {
    return { ok: false, error: "Ya existe un estudiante con ese RUT" };
  }

  await prisma.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: { fullName: parsed.data.fullName, rut, courseId: course.id },
      select: { id: true },
    });
    await logAudit(
      {
        userId: actor.id,
        action: "CREATE_STUDENT",
        entity: "Student",
        entityId: student.id,
        metadata: { fullName: parsed.data.fullName, course: `${course.name} ${course.year}` },
      },
      tx,
    );
  });
  revalidateCourses(course.id);
  return { ok: true };
}

export async function deleteStudentAction(studentId: string): Promise<ActionResult> {
  let actor;
  try {
    actor = await authorizeCourses();
  } catch (error) {
    return authFailure(error);
  }
  const student = await prisma.student.findUnique({ where: { id: String(studentId) } });
  if (!student) return { ok: false, error: "El estudiante no existe" };

  await prisma.$transaction(async (tx) => {
    await tx.student.delete({ where: { id: student.id } });
    await logAudit(
      {
        userId: actor.id,
        action: "DELETE_STUDENT",
        entity: "Student",
        entityId: student.id,
        metadata: { fullName: student.fullName },
      },
      tx,
    );
  });
  revalidateCourses(student.courseId);
  return { ok: true };
}

// ─── Apoderados ─────────────────────────────────────────────────────────

export type GuardianOption = { id: string; fullName: string; email: string };

export async function searchGuardiansAction(query: string): Promise<ActionResult<GuardianOption[]>> {
  try {
    await authorizeCourses();
  } catch (error) {
    return authFailure(error);
  }
  const q = String(query ?? "")
    .trim()
    .slice(0, 100);
  if (q.length < 2) return { ok: true, data: [] };

  const guardians = await prisma.user.findMany({
    where: {
      role: "APODERADO",
      isActive: true,
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { rut: { contains: q.replace(/\./g, ""), mode: "insensitive" } },
      ],
    },
    select: { id: true, fullName: true, email: true },
    orderBy: { fullName: "asc" },
    take: 10,
  });
  return { ok: true, data: guardians };
}

export async function linkGuardianAction(studentId: string, guardianId: string): Promise<ActionResult> {
  let actor;
  try {
    actor = await authorizeCourses();
  } catch (error) {
    return authFailure(error);
  }
  const [student, guardian] = await Promise.all([
    prisma.student.findUnique({ where: { id: String(studentId) } }),
    prisma.user.findUnique({ where: { id: String(guardianId) } }),
  ]);
  if (!student) return { ok: false, error: "El estudiante no existe" };
  if (!guardian || guardian.role !== "APODERADO" || !guardian.isActive) {
    return { ok: false, error: "Solo se pueden vincular usuarios apoderados activos" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.guardianStudent.upsert({
      where: { guardianId_studentId: { guardianId: guardian.id, studentId: student.id } },
      create: { guardianId: guardian.id, studentId: student.id },
      update: {},
    });
    await logAudit(
      {
        userId: actor.id,
        action: "LINK_GUARDIAN",
        entity: "Student",
        entityId: student.id,
        metadata: { fullName: student.fullName, guardian: guardian.fullName },
      },
      tx,
    );
  });
  revalidateCourses(student.courseId);
  return { ok: true };
}

export async function unlinkGuardianAction(studentId: string, guardianId: string): Promise<ActionResult> {
  let actor;
  try {
    actor = await authorizeCourses();
  } catch (error) {
    return authFailure(error);
  }
  const link = await prisma.guardianStudent.findUnique({
    where: { guardianId_studentId: { guardianId: String(guardianId), studentId: String(studentId) } },
    include: { student: true, guardian: { select: { fullName: true } } },
  });
  if (!link) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.guardianStudent.delete({
      where: { guardianId_studentId: { guardianId: link.guardianId, studentId: link.studentId } },
    });
    await logAudit(
      {
        userId: actor.id,
        action: "UNLINK_GUARDIAN",
        entity: "Student",
        entityId: link.studentId,
        metadata: { fullName: link.student.fullName, guardian: link.guardian.fullName },
      },
      tx,
    );
  });
  revalidateCourses(link.student.courseId);
  return { ok: true };
}
