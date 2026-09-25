import type { Metadata } from "next";

import { ComingSoon } from "@/components/shared/coming-soon";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Auditoría" };

export default async function Page() {
  await requirePermission("audit:view");
  return <ComingSoon title="Auditoría" phase={4} />;
}
