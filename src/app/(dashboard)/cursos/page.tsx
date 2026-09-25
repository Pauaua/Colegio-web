import { GraduationCap, School, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CourseDialog } from "@/components/courses/course-controls";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/lib/session";
import { listCourses } from "@/server/queries/courses";

export const metadata: Metadata = { title: "Cursos" };

export default async function CoursesPage() {
  await requirePermission("course:manage");
  const courses = await listCourses();
  const currentYear = new Date().getFullYear();

  return (
    <>
      <PageHeader
        title="Cursos"
        description="Cursos, estudiantes y sus apoderados. Se usan para dirigir documentos a un curso completo."
        actions={<CourseDialog defaultYear={currentYear} />}
      />
      {courses.length === 0 ? (
        <EmptyState
          icon={School}
          title="Todavía no hay cursos"
          description="Crea el primer curso para agregar estudiantes."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/cursos/${course.id}`}
              className="group rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Card className="h-full rounded-2xl shadow-soft transition-colors group-hover:bg-primary-soft/40">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-xl bg-brand-gradient">
                      <School className="size-5" strokeWidth={1.75} />
                    </span>
                    <div>
                      <p className="text-lg font-bold">{course.name}</p>
                      <p className="text-sm text-muted-foreground">Año {course.year}</p>
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <GraduationCap className="size-4" /> {course.studentCount} estudiante
                      {course.studentCount === 1 ? "" : "s"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="size-4" /> {course.guardianLinks} vínculo
                      {course.guardianLinks === 1 ? "" : "s"} de apoderado
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
