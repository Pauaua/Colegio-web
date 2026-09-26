import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { UserForm } from "@/components/users/user-form";
import { ROLES } from "@/lib/roles";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Nuevo usuario" };

export default async function NewUserPage({ searchParams }: PageProps<"/usuarios/nuevo">) {
  await requirePermission("user:manage");
  const { rol } = await searchParams;
  const defaultRole = ROLES.find((role) => role === rol);
  return (
    <>
      <PageHeader title="Nuevo usuario" description="Crea una cuenta y asígnale un rol." />
      <UserForm mode="create" defaultRole={defaultRole} />
    </>
  );
}
