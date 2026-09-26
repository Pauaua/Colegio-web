import {
  ChevronRight,
  GraduationCap,
  HeartHandshake,
  type LucideIcon,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/lib/session";
import { USER_GROUP_KEYS, USER_GROUPS, type UserGroup } from "@/lib/user-groups";
import { cn } from "@/lib/utils";
import { countUsersByRole } from "@/server/queries/users";

export const metadata: Metadata = { title: "Usuarios" };

const GROUP_STYLE: Record<UserGroup, { icon: LucideIcon; tone: string }> = {
  directivos: { icon: ShieldCheck, tone: "bg-primary-soft" },
  docentes: { icon: GraduationCap, tone: "bg-secondary-soft" },
  apoderados: { icon: HeartHandshake, tone: "bg-success text-success-foreground" },
};

export default async function UsersPage() {
  await requirePermission("user:manage");
  const counts = await countUsersByRole();

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Elige un grupo para ver sus cuentas de acceso."
        actions={
          <Button asChild>
            <Link href="/usuarios/nuevo">
              <UserPlus /> Nuevo usuario
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {USER_GROUP_KEYS.map((key) => {
          const { label, description, roles } = USER_GROUPS[key];
          const { icon: Icon, tone } = GROUP_STYLE[key];
          const total = roles.reduce((sum, role) => sum + counts[role].total, 0);
          const active = roles.reduce((sum, role) => sum + counts[role].active, 0);
          return (
            <Link
              key={key}
              href={`/usuarios/${key}`}
              className="group rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Card className="h-full rounded-2xl shadow-soft transition-colors group-hover:bg-primary-soft/40">
                <CardContent className="flex h-full flex-col gap-5 p-6">
                  <div className="flex items-start justify-between">
                    <span className={cn("grid size-14 place-items-center rounded-2xl", tone)}>
                      <Icon className="size-7" strokeWidth={1.75} />
                    </span>
                    <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold tracking-wide uppercase">{label}</h2>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                  <p className="mt-auto text-sm">
                    <span className="text-2xl font-bold">{total}</span> {total === 1 ? "usuario" : "usuarios"}
                    {active !== total && <span className="text-muted-foreground"> · {active} activos</span>}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
