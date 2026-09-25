import type { Metadata } from "next";

import { ComingSoon } from "@/components/shared/coming-soon";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Usuarios" };

export default async function Page() {
  await requirePermission("user:manage");
  return <ComingSoon title="Usuarios" phase={4} />;
}
