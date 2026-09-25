import { CheckCheck, Inbox, PartyPopper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DocumentStatusBadge, DocumentTypeBadge } from "@/components/documents/badges";
import { AcknowledgeButton } from "@/components/documents/document-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { formatCalendarDate, formatDateTime } from "@/lib/dates";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getInbox, type InboxFilter } from "@/server/queries/documents";

export const metadata: Metadata = { title: "Mis documentos" };

const FILTERS: { value: InboxFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "pendientes", label: "Por confirmar" },
  { value: "leidos", label: "Leídos" },
];

export default async function InboxPage({ searchParams }: PageProps<"/mis-documentos">) {
  const user = await requirePermission("document:inbox");
  const { estado } = await searchParams;
  const filter: InboxFilter = FILTERS.some((f) => f.value === estado) ? (estado as InboxFilter) : "todos";
  const { items, total, pending } = await getInbox(user, filter);

  return (
    <>
      <PageHeader
        title="Mis documentos"
        description={
          user.role === "APODERADO"
            ? "Citaciones y comunicados dirigidos a ti o a los cursos de tus pupilos."
            : "Documentos dirigidos a ti."
        }
      />

      {pending > 0 && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-warning-foreground/20 bg-warning p-4 text-warning-foreground">
          <Inbox className="size-5 shrink-0" />
          <p>
            Tienes <span className="font-bold">{pending}</span> documento{pending === 1 ? "" : "s"} pendiente
            {pending === 1 ? "" : "s"} de confirmar lectura.
          </p>
        </div>
      )}

      <nav aria-label="Filtrar documentos" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            asChild
            size="sm"
            variant={filter === f.value ? "default" : "outline"}
            className="rounded-full"
          >
            <Link href={f.value === "todos" ? "/mis-documentos" : `/mis-documentos?estado=${f.value}`}>
              {f.label}
              {f.value === "todos" && <span className="tabular-nums opacity-70">({total})</span>}
              {f.value === "pendientes" && <span className="tabular-nums opacity-70">({pending})</span>}
            </Link>
          </Button>
        ))}
      </nav>

      {items.length === 0 ? (
        filter === "pendientes" ? (
          <EmptyState
            icon={PartyPopper}
            title="¡Estás al día!"
            description="No tienes lecturas pendientes."
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title="No hay documentos por aquí"
            description="Cuando el establecimiento te envíe una citación o comunicado, aparecerá en esta sección."
          />
        )
      ) : (
        <ul className="space-y-3">
          {items.map(({ document: doc, acknowledgedAt }) => {
            const isPending = !acknowledgedAt;
            return (
              <li
                key={doc.id}
                className={cn(
                  "flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between",
                  isPending &&
                    doc.requiresAcknowledgement &&
                    "border-warning-foreground/30 ring-2 ring-warning",
                )}
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <DocumentTypeBadge name={doc.documentType.name} color={doc.documentType.color} />
                    {doc.status === "ARCHIVADO" && <DocumentStatusBadge status={doc.status} />}
                    {isPending && doc.requiresAcknowledgement && (
                      <span className="rounded-full bg-warning px-2.5 py-0.5 text-xs font-semibold text-warning-foreground">
                        Pendiente de confirmar lectura
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/documentos/${doc.id}`}
                    className="block text-lg font-semibold underline-offset-4 hover:underline"
                  >
                    {doc.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {formatCalendarDate(doc.documentDate)} · Folio {doc.folioNumber}/{doc.folioYear} ·{" "}
                    {doc.author.fullName}
                    {doc.courses.length > 0 && ` · Curso ${doc.courses.map((c) => c.course.name).join(", ")}`}
                  </p>
                </div>
                <div className="shrink-0">
                  {isPending ? (
                    <AcknowledgeButton documentId={doc.id} />
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success px-3 py-1 text-sm font-semibold text-success-foreground">
                      <CheckCheck className="size-4" /> Leído el {formatDateTime(acknowledgedAt)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
