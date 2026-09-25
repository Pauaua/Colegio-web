import { ArrowLeft, GraduationCap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AddStudentForm,
  CourseDialog,
  DeleteCourseButton,
  DeleteStudentButton,
  GuardianChip,
  LinkGuardianButton,
} from "@/components/courses/course-controls";
import { SectionCard } from "@/components/dashboard/widgets";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { formatRut } from "@/lib/rut";
import { requirePermission } from "@/lib/session";
import { getCourseDetail } from "@/server/queries/courses";

export const metadata: Metadata = { title: "Curso" };

export default async function CourseDetailPage({ params }: PageProps<"/cursos/[id]">) {
  await requirePermission("course:manage");
  const { id } = await params;
  const course = await getCourseDetail(id);
  if (!course) notFound();

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href="/cursos">
          <ArrowLeft /> Volver a cursos
        </Link>
      </Button>
      <PageHeader
        title={course.name}
        description={`Año ${course.year} · ${course.students.length} estudiante${course.students.length === 1 ? "" : "s"}`}
        actions={
          <>
            <DeleteCourseButton courseId={course.id} disabled={course.students.length > 0} />
            <CourseDialog course={course} defaultYear={course.year} />
          </>
        }
      />

      <div className="space-y-6">
        <SectionCard title="Agregar estudiante">
          <AddStudentForm courseId={course.id} />
        </SectionCard>

        <SectionCard
          title="Estudiantes y apoderados"
          description="Los apoderados vinculados reciben los documentos dirigidos a este curso."
        >
          {course.students.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="Sin estudiantes"
              description="Agrega el primer estudiante con el formulario de arriba."
            />
          ) : (
            <ul className="divide-y">
              {course.students.map((student) => (
                <li
                  key={student.id}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-2">
                    <p className="font-semibold">
                      {student.fullName}{" "}
                      <span className="font-normal text-muted-foreground tabular-nums">
                        {formatRut(student.rut)}
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {student.guardians.map(({ guardian }) => (
                        <GuardianChip key={guardian.id} studentId={student.id} guardian={guardian} />
                      ))}
                      <LinkGuardianButton
                        studentId={student.id}
                        linkedIds={student.guardians.map((g) => g.guardian.id)}
                      />
                    </div>
                  </div>
                  <DeleteStudentButton studentId={student.id} name={student.fullName} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
