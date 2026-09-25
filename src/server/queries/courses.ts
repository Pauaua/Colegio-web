import "server-only";

import { prisma } from "@/lib/prisma";

export async function listCourses() {
  const courses = await prisma.course.findMany({
    orderBy: [{ year: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      year: true,
      students: { select: { _count: { select: { guardians: true } } } },
    },
  });
  return courses.map((c) => ({
    id: c.id,
    name: c.name,
    year: c.year,
    studentCount: c.students.length,
    guardianLinks: c.students.reduce((sum, s) => sum + s._count.guardians, 0),
  }));
}

export async function getCourseDetail(id: string) {
  return prisma.course.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      year: true,
      students: {
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          fullName: true,
          rut: true,
          guardians: {
            orderBy: { guardian: { fullName: "asc" } },
            select: { guardian: { select: { id: true, fullName: true, email: true, isActive: true } } },
          },
        },
      },
    },
  });
}
