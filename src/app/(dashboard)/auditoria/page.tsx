import { ClipboardList, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { NativeSelect } from "@/components/shared/native-select";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AUDIT_ACTION_LABELS, describeAuditTarget } from "@/lib/audit-labels";
import { formatDateTime } from "@/lib/dates";
import { ROLE_LABELS } from "@/lib/roles";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  AUDIT_PAGE_SIZE,
  auditFiltersSchema,
  auditFiltersToSearch,
  getAuditLogs,
  getDownloadLogs,
  type AuditFilters,
} from "@/server/queries/audit";

export const metadata: Metadata = { title: "Auditoría" };

const TABS = [
  { value: "descargas", label: "Descargas", icon: Download },
  { value: "acciones", label: "Acciones", icon: ClipboardList },
] as const;

export default async function AuditPage({ searchParams }: PageProps<"/auditoria">) {
  await requirePermission("audit:view");
  const filters = auditFiltersSchema.parse(await searchParams);

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Registro de descargas y de acciones importantes en la plataforma."
      />

      <nav aria-label="Tipo de registro" className="mb-6 inline-flex rounded-xl bg-muted p-1">
        {TABS.map(({ value, label, icon: Icon }) => (
          <Link
            key={value}
            href={`/auditoria${auditFiltersToSearch({ tab: value })}`}
            aria-current={filters.tab === value ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              filters.tab === value ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" /> {label}
          </Link>
        ))}
      </nav>

      <FiltersForm filters={filters} />

      {filters.tab === "descargas" ? (
        <DownloadsTable filters={filters} />
      ) : (
        <ActionsTable filters={filters} />
      )}
    </>
  );
}

function FiltersForm({ filters }: { filters: AuditFilters }) {
  const isActions = filters.tab === "acciones";
  return (
    <form
      action="/auditoria"
      className={cn(
        "mb-6 grid gap-4 rounded-2xl border bg-card p-4 shadow-soft sm:items-end sm:p-5",
        isActions ? "lg:grid-cols-[1fr_220px_160px_160px_auto]" : "lg:grid-cols-[1fr_160px_160px_auto]",
      )}
    >
      <input type="hidden" name="tab" value={filters.tab} />
      <div className="space-y-2">
        <Label htmlFor="q">{isActions ? "Usuario" : "Usuario o documento"}</Label>
        <Input id="q" name="q" type="search" defaultValue={filters.q} placeholder="Buscar…" />
      </div>
      {isActions && (
        <div className="space-y-2">
          <Label htmlFor="accion">Acción</Label>
          <NativeSelect id="accion" name="accion" defaultValue={filters.accion ?? ""}>
            <option value="">Todas las acciones</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="desde">Desde</Label>
        <Input id="desde" name="desde" type="date" defaultValue={filters.desde} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="hasta">Hasta</Label>
        <Input id="hasta" name="hasta" type="date" defaultValue={filters.hasta} />
      </div>
      <Button type="submit" variant="secondary">
        Filtrar
      </Button>
    </form>
  );
}

function TableShell({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary-soft/50 hover:bg-secondary-soft/50">
            {headers.map((header) => (
              <TableHead key={header} className="h-12 font-semibold first:pl-5 last:pr-5">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

async function DownloadsTable({ filters }: { filters: AuditFilters }) {
  const { rows, total, pageCount } = await getDownloadLogs(filters);
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Download}
        title="Sin descargas registradas"
        description="Prueba con otro rango de fechas o búsqueda."
      />
    );
  }
  return (
    <>
      <TableShell headers={["Fecha", "Usuario", "Documento", "IP"]}>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="py-3 pl-5 whitespace-nowrap tabular-nums">
              {formatDateTime(row.downloadedAt)}
            </TableCell>
            <TableCell className="py-3">
              <span className="font-medium">{row.user.fullName}</span>
              <span className="block text-xs text-muted-foreground">{ROLE_LABELS[row.user.role]}</span>
            </TableCell>
            <TableCell className="py-3">
              {row.document.isDeleted ? (
                <span className="text-muted-foreground">{row.document.title} (eliminado)</span>
              ) : (
                <Link href={`/documentos/${row.document.id}`} className="underline-offset-4 hover:underline">
                  {row.document.title}
                </Link>
              )}
            </TableCell>
            <TableCell className="py-3 pr-5 text-muted-foreground tabular-nums">
              {row.ipAddress ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableShell>
      <Pagination
        page={filters.page}
        pageCount={pageCount}
        total={total}
        pageSize={AUDIT_PAGE_SIZE}
        hrefForPage={(page) => `/auditoria${auditFiltersToSearch({ ...filters, page })}`}
      />
    </>
  );
}

async function ActionsTable({ filters }: { filters: AuditFilters }) {
  const { rows, total, pageCount } = await getAuditLogs(filters);
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Sin acciones registradas"
        description="Prueba con otros filtros."
      />
    );
  }
  return (
    <>
      <TableShell headers={["Fecha", "Usuario", "Acción", "Detalle"]}>
        {rows.map((row) => {
          const target = describeAuditTarget(row.metadata);
          return (
            <TableRow key={row.id}>
              <TableCell className="py-3 pl-5 whitespace-nowrap tabular-nums">
                {formatDateTime(row.createdAt)}
              </TableCell>
              <TableCell className="py-3">
                <span className="font-medium">{row.user?.fullName ?? "Sistema"}</span>
                {row.user && (
                  <span className="block text-xs text-muted-foreground">{ROLE_LABELS[row.user.role]}</span>
                )}
              </TableCell>
              <TableCell className="py-3">{AUDIT_ACTION_LABELS[row.action]}</TableCell>
              <TableCell className="py-3 pr-5">
                {row.entity === "Document" && row.entityId && target ? (
                  <Link href={`/documentos/${row.entityId}`} className="underline-offset-4 hover:underline">
                    {target}
                  </Link>
                ) : row.entity === "User" && row.entityId && target ? (
                  <Link href={`/usuarios/${row.entityId}`} className="underline-offset-4 hover:underline">
                    {target}
                  </Link>
                ) : (
                  (target ?? <span className="text-muted-foreground">—</span>)
                )}
                <AuditExtra metadata={row.metadata} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableShell>
      <Pagination
        page={filters.page}
        pageCount={pageCount}
        total={total}
        pageSize={AUDIT_PAGE_SIZE}
        hrefForPage={(page) => `/auditoria${auditFiltersToSearch({ ...filters, page })}`}
      />
    </>
  );
}

/** Detalle secundario: cambio de rol, folio, apoderado vinculado… */
function AuditExtra({ metadata }: { metadata: unknown }) {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof m.from === "string" && typeof m.to === "string") {
    const label = (v: string) => ROLE_LABELS[v as keyof typeof ROLE_LABELS] ?? v;
    parts.push(`${label(m.from)} → ${label(m.to)}`);
  }
  if (typeof m.folio === "string") parts.push(`Folio ${m.folio}`);
  if (typeof m.guardian === "string") parts.push(`Apoderado: ${m.guardian}`);
  if (typeof m.ip === "string") parts.push(`IP ${m.ip}`);
  if (parts.length === 0) return null;
  return <span className="block text-xs text-muted-foreground">{parts.join(" · ")}</span>;
}
