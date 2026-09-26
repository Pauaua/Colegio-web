import type { Metadata } from "next";

import { UserGroupList } from "@/components/users/user-group-list";

export const metadata: Metadata = { title: "Apoderados" };

export default function ApoderadosPage({ searchParams }: PageProps<"/usuarios/apoderados">) {
  return <UserGroupList group="apoderados" searchParams={searchParams} />;
}
