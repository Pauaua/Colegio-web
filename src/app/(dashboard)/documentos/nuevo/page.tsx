import type { Metadata } from "next";

import { ComingSoon } from "@/components/shared/coming-soon";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Subir documento" };

export default async function Page() {
  await requirePermission("document:create");
  return <ComingSoon title="Subir documento" phase={3} />;
}
