import "server-only";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/roles";

export const USERS_PAGE_SIZE = 10;

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

export const userFiltersSchema = z.object({
  q: z.preprocess(first, z.string().trim().max(100).optional().catch(undefined)),
  rol: z.preprocess(first, z.enum(ROLES).optional().catch(undefined)),
  estado: z.preprocess(first, z.enum(["activos", "inactivos"]).optional().catch(undefined)),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(10_000).catch(1)),
});
export type UserFilters = z.infer<typeof userFiltersSchema>;

export function userFiltersToSearch(filters: Partial<UserFilters>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || (key === "page" && value === 1)) continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

export type UserListRow = {
  id: string;
  fullName: string;
  email: string;
  rut: string;
  role: (typeof ROLES)[number];
  phone: string | null;
  isActive: boolean;
};

/** Lista paginada. Con `roles`, se limita a esos roles (el filtro `rol` solo acota dentro de ellos). */
export async function listUsers(filters: UserFilters, roles?: readonly Role[]) {
  const rol = filters.rol && (!roles || roles.includes(filters.rol)) ? filters.rol : undefined;
  const where: Prisma.UserWhereInput = {
    ...(rol ? { role: rol } : roles ? { role: { in: [...roles] } } : {}),
    ...(filters.estado ? { isActive: filters.estado === "activos" } : {}),
    ...(filters.q
      ? {
          OR: [
            { fullName: { contains: filters.q, mode: "insensitive" } },
            { email: { contains: filters.q, mode: "insensitive" } },
            { rut: { contains: filters.q.replace(/\./g, ""), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
      skip: (filters.page - 1) * USERS_PAGE_SIZE,
      take: USERS_PAGE_SIZE,
      select: { id: true, fullName: true, email: true, rut: true, role: true, phone: true, isActive: true },
    }),
  ]);

  return { rows: users as UserListRow[], total, pageCount: Math.max(1, Math.ceil(total / USERS_PAGE_SIZE)) };
}

/** Cantidad de usuarios por rol, total y activos. */
export async function countUsersByRole() {
  const groups = await prisma.user.groupBy({ by: ["role", "isActive"], _count: { _all: true } });
  const counts = Object.fromEntries(ROLES.map((role) => [role, { total: 0, active: 0 }])) as Record<
    Role,
    { total: number; active: number }
  >;
  for (const group of groups) {
    counts[group.role].total += group._count._all;
    if (group.isActive) counts[group.role].active += group._count._all;
  }
  return counts;
}

export async function getUserForEdit(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      rut: true,
      role: true,
      phone: true,
      isActive: true,
      createdAt: true,
      students: { select: { student: { select: { fullName: true, course: { select: { name: true } } } } } },
      _count: { select: { authoredDocuments: true, downloads: true } },
    },
  });
}
