import type { Metadata } from "next";

import { ComingSoon } from "@/components/shared/coming-soon";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Mis documentos" };

export default async function Page() {
  await requirePermission("document:inbox");
  return <ComingSoon title="Mis documentos" phase={4} />;
}
