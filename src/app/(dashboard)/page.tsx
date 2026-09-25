import { ArrowRight, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { getNavSectionsForRole } from "@/components/layout/nav-items";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatLongDate } from "@/lib/dates";
import { ROLE_LABELS } from "@/lib/roles";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Inicio" };

export default async function DashboardPage() {
  const user = await requireUser();
  const firstName = user.fullName.split(" ")[0];
  const shortcuts = getNavSectionsForRole(user.role)
    .flatMap((section) => section.items)
    .filter((item) => item.href !== "/");

  return (
    <>
      <PageHeader title={`¡Hola, ${firstName}!`} description={formatLongDate(new Date())} />

      <Card className="mb-8 rounded-2xl border-0 bg-brand-gradient shadow-soft">
        <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid size-12 place-items-center rounded-2xl bg-card/70">
              <Sparkles className="size-6" strokeWidth={1.5} />
            </span>
            <div>
              <p className="text-sm text-foreground/75">Ingresaste como</p>
              <p className="text-xl font-bold">{ROLE_LABELS[user.role]}</p>
            </div>
          </div>
          <Badge variant="secondary" className="w-fit bg-card/70 text-foreground">
            El resumen con estadísticas llega en la fase 4
          </Badge>
        </CardContent>
      </Card>

      <h2 className="mb-4 text-lg font-semibold">Accesos rápidos</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shortcuts.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Card className="h-full rounded-2xl shadow-soft transition-colors group-hover:bg-primary-soft/50">
              <CardContent className="flex items-center gap-4 p-5">
                <span className="grid size-11 place-items-center rounded-xl bg-secondary-soft">
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <span className="flex-1 font-semibold">{label}</span>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
