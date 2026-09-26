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
  profileSchema,
  updateUserSchema,
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
          metadata: { fullName: data.fullName, email: data.email.toLowerCase(), role: data.role },
        },
        tx,
      );
      return created;
    });
    revalidateUsers();
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

  const current = await prisma.user.findUnique({ where: { id: String(userId) } });
  if (!current) return { ok: false, error: "El usuario no existe" };
  if (current.id === actor.id && data.role !== current.role) {
    return { ok: false, error: "No puedes cambiar tu propio rol. Pídeselo a otro director." };
  }
  const duplicate = await findDuplicate(normalizeRut(data.rut), data.email.toLowerCase(), current.id);
  if (duplicate) return { ok: false, error: duplicate };

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
          metadata: { fullName: data.fullName, passwordReset: Boolean(data.password) },
        },
        tx,
      );
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
