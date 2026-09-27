import { ArrowLeft, School } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { RoleBadge, UserStatusBadge } from "@/components/users/badges";
import { GuardianStudents } from "@/components/users/guardian-students";
import { UserForm } from "@/components/users/user-form";
import { formatDateTime } from "@/lib/dates";
import { formatRut } from "@/lib/rut";
import { requirePermission } from "@/lib/session";
import { groupForRole, USER_GROUPS, userGroupHref } from "@/lib/user-groups";
import { listCoursesWithStudents } from "@/server/queries/courses";
import { getUserForEdit } from "@/server/queries/users";

export const metadata: Metadata = { title: "Editar usuario" };

export default async function EditUserPage({ params }: PageProps<"/usuarios/[id]">) {
  const actor = await requirePermission("user:manage");
  const { id } = await params;
  const [user, courses] = await Promise.all([getUserForEdit(id), listCoursesWithStudents()]);
  if (!user) notFound();

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href={userGroupHref(user.role)}>
          <ArrowLeft /> Volver a {USER_GROUPS[groupForRole(user.role)].label.toLowerCase()}
        </Link>
      </Button>
      <PageHeader title={user.fullName} description={`Cuenta creada el ${formatDateTime(user.createdAt)}`} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <RoleBadge role={user.role} />
        <UserStatusBadge active={user.isActive} />
        <span className="text-sm text-muted-foreground">
          {user._count.authoredDocuments} documentos subidos · {user._count.downloads} descargas
        </span>
      </div>
      {user.role === "APODERADO" ? (
        <GuardianStudents
          guardianId={user.id}
          guardianActive={user.isActive}
          students={user.students.map(({ student }) => student)}
          courses={courses}
        />
      ) : (
        user.role === "DOCENTE" && (
          <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Cursos:</span>
            {user.teachingCourses.length === 0 ? (
              <span className="text-muted-foreground">sin cursos asignados (puedes asignarlos abajo)</span>
            ) : (
              user.teachingCourses.map(({ course }) => (
                <Link
                  key={course.id}
                  href={`/cursos/${course.id}`}
                  className="flex items-center gap-1.5 rounded-xl bg-secondary-soft px-3 py-1.5 hover:underline"
                >
                  <School className="size-4" /> {course.name} {course.year}
                </Link>
              ))
            )}
          </div>
        )
      )}
      <UserForm
        mode="edit"
        userId={user.id}
        isSelf={user.id === actor.id}
        defaultValues={{
          fullName: user.fullName,
          rut: formatRut(user.rut),
          email: user.email,
          role: user.role,
          phone: user.phone ?? "",
          password: "",
          courseIds: user.teachingCourses.map(({ course }) => course.id),
        }}
        courses={courses}
      />
    </>
  );
}
