import type { Metadata } from "next";

import { UserGroupList } from "@/components/users/user-group-list";

export const metadata: Metadata = { title: "Docentes" };

export default function DocentesPage({ searchParams }: PageProps<"/usuarios/docentes">) {
  return <UserGroupList group="docentes" searchParams={searchParams} />;
}
