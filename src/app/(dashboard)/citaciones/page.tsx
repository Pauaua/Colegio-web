import { CalendarClock, MailPlus, MessageSquareText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CitationResponseBadge, CitationWhenWhere } from "@/components/citations/citation-badges";
import { DocumentStatusBadge } from "@/components/documents/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { isManagement } from "@/lib/permissions";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listSentCitations, type CitationTab } from "@/server/queries/citations";

export const metadata: Metadata = { title: "Citaciones" };

export default async function CitationsPage({ searchParams }: PageProps<"/citaciones">) {
  const user = await requirePermission("citation:viewSent");
  const { tab: rawTab } = await searchParams;
  const tab: CitationTab = rawTab === "pasadas" ? "pasadas" : "proximas";
  const { citations, counts } = await listSentCitations(user, tab);
  const showAuthor = isManagement(user.role);

  return (
    <>
      <PageHeader
        title="Citaciones"
        description={
          showAuthor
            ? "Todas las citaciones enviadas a apoderados y sus respuestas."
            : "Las citaciones que enviaste y lo que respondió cada apoderado."
        }
        actions={
          <Button asChild>
            <Link href="/citaciones/nueva">
              <MailPlus /> Nueva citación
            </Link>
          </Button>
        }
      />

      <nav aria-label="Filtrar citaciones" className="mb-6 inline-flex rounded-xl bg-muted p-1">
        {(
          [
            ["proximas", "Próximas"],
            ["pasadas", "Pasadas"],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            href={value === "proximas" ? "/citaciones" : "/citaciones?tab=pasadas"}
            aria-current={tab === value ? "page" : undefined}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              tab === value ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label} <span className="tabular-nums opacity-70">({counts[value]})</span>
          </Link>
        ))}
      </nav>

      {citations.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={tab === "proximas" ? "No hay citaciones próximas" : "No hay citaciones pasadas"}
          description="Cuando envíes una citación, aquí verás las respuestas de los apoderados."
          action={
            <Button asChild>
              <Link href="/citaciones/nueva">
                <MailPlus /> Nueva citación
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-4">
          {citations.map((c) => (
            <li key={c.id} className="rounded-2xl border bg-card p-5 shadow-soft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      Folio {c.folioNumber}/{c.folioYear}
                    </span>
                    {showAuthor && <span>· {c.author.fullName}</span>}
                    {c.courses.length > 0 && <span>· {c.courses.map((x) => x.course.name).join(", ")}</span>}
                    {c.status === "ARCHIVADO" && <DocumentStatusBadge status={c.status} />}
                  </div>
                  <Link
                    href={`/documentos/${c.id}`}
                    className="block text-lg font-semibold underline-offset-4 hover:underline"
                  >
                    {c.title}
                  </Link>
                  <CitationWhenWhere at={c.citationAt} place={c.citationPlace} />
                </div>
                <dl className="grid shrink-0 grid-cols-4 gap-2 text-center text-xs sm:w-72">
                  {(
                    [
                      ["Asistirán", c.summary.accepted],
                      ["No asistirán", c.summary.rejected],
                      ["Otro horario", c.summary.reschedule],
                      ["Sin respuesta", c.summary.pending],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-muted/60 px-1 py-2">
                      <dd className="text-lg font-bold tabular-nums">{value}</dd>
                      <dt className="leading-tight text-muted-foreground">{label}</dt>
                    </div>
                  ))}
                </dl>
              </div>
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Ver respuestas de {c.summary.total} apoderado{c.summary.total === 1 ? "" : "s"}
                </summary>
                <ul className="mt-3 divide-y">
                  {c.recipients.map((r) => (
                    <li
                      key={r.user.id}
                      className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="font-medium">{r.user.fullName}</span>
                      <span className="flex min-w-0 items-center gap-2">
                        {r.responseComment && (
                          <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
                            <MessageSquareText className="size-3.5 shrink-0" />
                            <span className="truncate">“{r.responseComment}”</span>
                          </span>
                        )}
                        <CitationResponseBadge response={r.response} />
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
