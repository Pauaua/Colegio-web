import { ArrowLeft, GraduationCap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { RoleBadge, UserStatusBadge } from "@/components/users/badges";
import { UserForm } from "@/components/users/user-form";
import { formatDateTime } from "@/lib/dates";
import { formatRut } from "@/lib/rut";
import { requirePermission } from "@/lib/session";
import { getUserForEdit } from "@/server/queries/users";

export const metadata: Metadata = { title: "Editar usuario" };

export default async function EditUserPage({ params }: PageProps<"/usuarios/[id]">) {
  const actor = await requirePermission("user:manage");
  const { id } = await params;
  const user = await getUserForEdit(id);
  if (!user) notFound();

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href="/usuarios">
          <ArrowLeft /> Volver a usuarios
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
      {user.students.length > 0 && (
        <ul className="mb-6 flex flex-wrap gap-2">
          {user.students.map(({ student }) => (
            <li
              key={student.fullName}
              className="flex items-center gap-2 rounded-xl bg-secondary-soft px-3 py-1.5 text-sm"
            >
              <GraduationCap className="size-4" /> {student.fullName}
              <span className="text-muted-foreground">{student.course.name}</span>
            </li>
          ))}
        </ul>
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
        }}
      />
    </>
  );
}
