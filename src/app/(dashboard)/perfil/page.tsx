import { GraduationCap } from "lucide-react";
import type { Metadata } from "next";

import { SectionCard } from "@/components/dashboard/widgets";
import { ChangePasswordForm, ProfileForm } from "@/components/profile/profile-forms";
import { PageHeader } from "@/components/shared/page-header";
import { RoleBadge } from "@/components/users/badges";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { formatRut } from "@/lib/rut";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Mi perfil" };

export default async function ProfilePage() {
  const current = await requireUser();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: current.id },
    select: {
      fullName: true,
      email: true,
      rut: true,
      role: true,
      phone: true,
      createdAt: true,
      students: { select: { student: { select: { fullName: true, course: { select: { name: true } } } } } },
    },
  });

  return (
    <>
      <PageHeader title="Mi perfil" description="Tus datos de acceso y contacto." />
      <div className="grid max-w-4xl gap-6">
        <SectionCard
          title="Mis datos"
          description="Si necesitas corregir tu nombre, RUT o correo, pídeselo a la dirección."
        >
          <dl className="mb-6 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Nombre</dt>
              <dd className="font-medium">{user.fullName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Rol</dt>
              <dd className="mt-0.5">
                <RoleBadge role={user.role} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Correo</dt>
              <dd className="font-medium break-all">{user.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">RUT</dt>
              <dd className="font-medium tabular-nums">{formatRut(user.rut)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cuenta creada</dt>
              <dd className="font-medium">{formatDateTime(user.createdAt)}</dd>
            </div>
            {user.students.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Pupilos</dt>
                <dd className="mt-1 flex flex-wrap gap-2">
                  {user.students.map(({ student }) => (
                    <span
                      key={student.fullName}
                      className="flex items-center gap-1.5 rounded-xl bg-secondary-soft px-3 py-1"
                    >
                      <GraduationCap className="size-4" /> {student.fullName} · {student.course.name}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
          <ProfileForm phone={user.phone ?? ""} />
        </SectionCard>

        <SectionCard title="Cambiar contraseña">
          <ChangePasswordForm />
        </SectionCard>
      </div>
    </>
  );
}
