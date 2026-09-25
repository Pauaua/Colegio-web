import {
  BellRing,
  CalendarPlus,
  CheckCheck,
  Download,
  FilePlus2,
  Files,
  GraduationCap,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { UploadsByMonthChart, DocumentsByTypeChart } from "@/components/dashboard/charts";
import { ChartDataTable, DocumentMiniList, SectionCard, StatTile } from "@/components/dashboard/widgets";
import { AcknowledgeButton } from "@/components/documents/document-actions";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { AUDIT_ACTION_LABELS, describeAuditTarget } from "@/lib/audit-labels";
import { formatLongDate, formatRelative } from "@/lib/dates";
import { roleCan } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";
import { requireUser, type CurrentUser } from "@/lib/session";
import { getCommunityDashboard, getManagementDashboard } from "@/server/queries/dashboard";

export const metadata: Metadata = { title: "Inicio" };

export default async function DashboardPage() {
  const user = await requireUser();
  const firstName = user.fullName.split(" ")[0];

  return (
    <>
      <PageHeader
        title={`¡Hola, ${firstName}!`}
        description={`${ROLE_LABELS[user.role]} · ${formatLongDate(new Date())}`}
      />
      {roleCan(user.role, "dashboard:viewStats") ? (
        <ManagementDashboard canCreate={roleCan(user.role, "document:create")} />
      ) : (
        <CommunityDashboard user={user} />
      )}
    </>
  );
}

// ─── Director y equipo directivo ────────────────────────────

async function ManagementDashboard({ canCreate }: { canCreate: boolean }) {
  const data = await getManagementDashboard();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Files}
          label="Documentos"
          value={data.kpis.totalDocuments}
          hint="Total vigentes y archivados"
          href="/documentos"
        />
        <StatTile
          icon={CalendarPlus}
          label="Subidos este mes"
          value={data.kpis.uploadedThisMonth}
          tone="secondary"
        />
        <StatTile
          icon={Download}
          label="Descargas del mes"
          value={data.kpis.downloadsThisMonth}
          tone="success"
          href="/auditoria"
        />
        <StatTile
          icon={BellRing}
          label="Citaciones sin acuse"
          value={data.kpis.pendingCitations}
          hint="Destinatarios que no han confirmado"
          tone="warning"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Documentos por tipo" description="Cantidad de documentos de cada tipo">
          <DocumentsByTypeChart data={data.byType} />
          <ChartDataTable header="Tipo" rows={data.byType.map((t) => ({ label: t.name, count: t.count }))} />
        </SectionCard>
        <SectionCard title="Documentos subidos por mes" description="Últimos 12 meses">
          <UploadsByMonthChart data={data.byMonth} />
          <ChartDataTable
            header="Mes"
            rows={data.byMonth.map((m) => ({ label: m.fullLabel, count: m.count }))}
          />
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SectionCard
          title="Últimos documentos subidos"
          action={
            canCreate && (
              <Button asChild size="sm">
                <Link href="/documentos/nuevo">
                  <FilePlus2 /> Subir
                </Link>
              </Button>
            )
          }
        >
          <DocumentMiniList documents={data.latestDocuments} empty="Todavía no hay documentos." />
        </SectionCard>
        <SectionCard
          title="Actividad reciente"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/auditoria?tab=acciones">Ver todo</Link>
            </Button>
          }
        >
          {data.recentActivity.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin actividad todavía.</p>
          ) : (
            <ol className="space-y-4">
              {data.recentActivity.map((entry) => {
                const target = describeAuditTarget(entry.metadata);
                return (
                  <li key={entry.id} className="flex gap-3 text-sm">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-chart-mark" aria-hidden />
                    <div className="min-w-0">
                      <p>
                        <span className="font-semibold">{entry.user?.fullName ?? "Sistema"}</span>{" "}
                        {AUDIT_ACTION_LABELS[entry.action].toLowerCase()}
                        {target && (
                          <>
                            :{" "}
                            {entry.entity === "Document" && entry.entityId ? (
                              <Link
                                href={`/documentos/${entry.entityId}`}
                                className="underline-offset-4 hover:underline"
                              >
                                {target}
                              </Link>
                            ) : (
                              target
                            )}
                          </>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatRelative(entry.createdAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ─── Docentes y apoderados ──────────────────────────────────────────────

async function CommunityDashboard({ user }: { user: CurrentUser }) {
  const data = await getCommunityDashboard(user);
  const isGuardian = user.role === "APODERADO";
  const pendingLabel = isGuardian ? "Citaciones y comunicados por confirmar" : "Documentos por confirmar";

  return (
    <div className="space-y-6">
      {data.pending.length > 0 && (
        <section
          aria-labelledby="pending-title"
          className="rounded-2xl border border-warning-foreground/20 bg-warning p-5 text-warning-foreground shadow-soft"
        >
          <div className="mb-4 flex items-center gap-3">
            <BellRing className="size-6 shrink-0" />
            <div>
              <h2 id="pending-title" className="text-lg font-bold">
                Tienes {data.pending.length}{" "}
                {data.pending.length === 1 ? "documento pendiente" : "documentos pendientes"} de confirmar
                lectura
              </h2>
              <p className="text-sm">Revísalos y confirma que los leíste.</p>
            </div>
          </div>
          <div className="rounded-xl bg-card p-4 text-card-foreground">
            <DocumentMiniList
              documents={data.pending}
              empty=""
              trailing={(doc) => <AcknowledgeButton documentId={doc.id} className="shrink-0" />}
            />
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          icon={Files}
          label="Documentos disponibles"
          value={data.kpis.visibleCount}
          href="/documentos"
        />
        <StatTile
          icon={Inbox}
          label="Dirigidos a mí"
          value={data.kpis.addressedCount}
          tone="secondary"
          href="/mis-documentos"
        />
        <StatTile
          icon={BellRing}
          label={pendingLabel}
          value={data.kpis.pendingCount}
          tone={data.kpis.pendingCount > 0 ? "warning" : "success"}
          href="/mis-documentos?estado=pendientes"
        />
      </div>

      {isGuardian && data.pupils.length > 0 && (
        <SectionCard title="Mis pupilos">
          <ul className="flex flex-wrap gap-3">
            {data.pupils.map((pupil) => (
              <li
                key={pupil.fullName}
                className="flex items-center gap-2 rounded-xl bg-secondary-soft px-3 py-2 text-sm"
              >
                <GraduationCap className="size-4" />
                <span className="font-semibold">{pupil.fullName}</span>
                <span className="text-muted-foreground">{pupil.course.name}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title={isGuardian ? "Dirigidos a mí o a mis pupilos" : "Dirigidos a mí"}
          action={<ViewAll href="/mis-documentos" />}
        >
          <DocumentMiniList
            documents={data.addressed}
            empty="No tienes documentos dirigidos a ti."
            trailing={(doc) => {
              const item = data.addressed.find((d) => d.id === doc.id);
              return item?.acknowledgedAt ? <ReadTag icon={CheckCheck} label="Leído" /> : null;
            }}
          />
        </SectionCard>
        <SectionCard
          title={isGuardian ? "Comunicados para apoderados" : "Recientes para docentes"}
          action={<ViewAll href="/documentos" />}
        >
          <DocumentMiniList documents={data.recentForRole} empty="No hay documentos recientes." />
        </SectionCard>
      </div>
    </div>
  );
}

function ViewAll({ href }: { href: string }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href={href}>Ver todo</Link>
    </Button>
  );
}

function ReadTag({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success px-2 py-0.5 text-xs font-semibold text-success-foreground">
      <Icon className="size-3" /> {label}
    </span>
  );
}
