import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { UserForm } from "@/components/users/user-form";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Nuevo usuario" };

export default async function NewUserPage() {
  await requirePermission("user:manage");
  return (
    <>
      <PageHeader title="Nuevo usuario" description="Crea una cuenta y asígnale un rol." />
      <UserForm mode="create" />
    </>
  );
}
