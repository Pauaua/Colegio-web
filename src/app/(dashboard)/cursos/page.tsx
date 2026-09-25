import type { Metadata } from "next";

import { ComingSoon } from "@/components/shared/coming-soon";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Cursos" };

export default async function Page() {
  await requirePermission("course:manage");
  return <ComingSoon title="Cursos" phase={4} />;
}
