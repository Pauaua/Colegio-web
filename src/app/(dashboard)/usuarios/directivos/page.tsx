import type { Metadata } from "next";

import { UserGroupList } from "@/components/users/user-group-list";

export const metadata: Metadata = { title: "Directivos" };

export default function DirectivosPage({ searchParams }: PageProps<"/usuarios/directivos">) {
  return <UserGroupList group="directivos" searchParams={searchParams} />;
}
