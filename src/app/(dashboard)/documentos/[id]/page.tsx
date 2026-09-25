import {
  ArrowLeft,
  BellRing,
  CalendarDays,
  CheckCheck,
  Download,
  FileText,
  Hash,
  Pencil,
  UserRound,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DocumentStatusBadge, DocumentTypeBadge } from "@/components/documents/badges";
import {
  AcknowledgeButton,
  ArchiveButton,
  DeleteDocumentButton,
} from "@/components/documents/document-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCalendarDate, formatDateTime } from "@/lib/dates";
import { formatFileSize, isPreviewable } from "@/lib/files";
import { can } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getDocumentDetail } from "@/server/queries/documents";

export const metadata: Metadata = { title: "Documento" };

export default async function DocumentDetailPage({ params }: PageProps<"/documentos/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const detail = await getDocumentDetail(id, user);
  if (!detail) notFound();

  const { document: doc, recipients, myRecipient, downloads, canSeeActivity, permission } = detail;
  const folio = `${doc.folioNumber}/${doc.folioYear}`;
  const canEdit = can(user, "document:update", permission);
  const canArchive = can(user, "document:archive", permission);
  const canDelete = can(user, "document:delete", permission);
  const canAcknowledge = can(user, "document:acknowledge", permission) && !myRecipient?.acknowledgedAt;
  const visibleTo = doc.visibility.map((v) => ROLE_LABELS[v.role]);
  const acknowledged = recipients.filter((r) => r.acknowledgedAt).length;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href="/documentos">
          <ArrowLeft /> Volver a documentos
        </Link>
      </Button>

      <div className="mb-6 flex flex-col gap-4 lg:mb-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <DocumentTypeBadge name={doc.documentType.name} color={doc.documentType.color} />
            <DocumentStatusBadge status={doc.status} />
          </div>
          <h1 className="text-2xl font-bold sm:text-3xl">{doc.title}</h1>
          {doc.description && <p className="max-w-3xl text-muted-foreground">{doc.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {canDelete && <DeleteDocumentButton documentId={doc.id} title={doc.title} />}
          {canArchive && <ArchiveButton documentId={doc.id} archived={doc.status === "ARCHIVADO"} />}
          {canEdit && (
            <Button asChild variant="outline">
              <Link href={`/documentos/${doc.id}/editar`}>
                <Pencil /> Editar
              </Link>
            </Button>
          )}
          <Button asChild>
            <a href={`/api/documents/${doc.id}/download`}>
              <Download /> Descargar
            </a>
          </Button>
        </div>
      </div>

      {canAcknowledge && (
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-warning-foreground/20 bg-warning p-4 text-warning-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <BellRing className="mt-0.5 size-5 shrink-0" />
            <p>
              <span className="font-semibold">Este documento está dirigido a ti.</span>{" "}
              {doc.requiresAcknowledgement
                ? "El establecimiento te pide confirmar que lo leíste."
                : "Puedes confirmar que lo leíste."}
            </p>
          </div>
          <AcknowledgeButton documentId={doc.id} className="shrink-0" />
        </div>
      )}
      {myRecipient?.acknowledgedAt && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl bg-success p-4 text-success-foreground">
          <CheckCheck className="size-5 shrink-0" />
          <p>
            Confirmaste la lectura el{" "}
            <span className="font-semibold">{formatDateTime(myRecipient.acknowledgedAt)}</span>.
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden rounded-2xl shadow-soft">
          <CardHeader>
            <CardTitle>Vista previa</CardTitle>
          </CardHeader>
          <CardContent>
            {isPreviewable(doc.mimeType) ? (
              doc.mimeType === "application/pdf" ? (
                <iframe
                  src={`/api/documents/${doc.id}/preview`}
                  title={`Vista previa de ${doc.title}`}
                  className="h-[70vh] min-h-[420px] w-full rounded-xl border bg-muted"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal, no optimizable por next/image
                <img
                  src={`/api/documents/${doc.id}/preview`}
                  alt={doc.title}
                  className="mx-auto max-h-[70vh] rounded-xl border object-contain"
                />
              )
            ) : (
              <EmptyState
                icon={FileText}
                title="Este formato no tiene vista previa"
                description="Descarga el archivo para abrirlo en tu computador."
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-2xl shadow-soft">
            <CardHeader>
              <CardTitle>Detalles</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-4 text-sm">
                <MetaRow icon={Hash} label="Folio" value={`N° ${folio}`} />
                <MetaRow
                  icon={CalendarDays}
                  label="Fecha del documento"
                  value={formatCalendarDate(doc.documentDate)}
                />
                <MetaRow icon={UserRound} label="Autor(a)" value={doc.author.fullName} />
                <MetaRow icon={CalendarDays} label="Subido el" value={formatDateTime(doc.createdAt)} />
                <MetaRow
                  icon={FileText}
                  label="Archivo"
                  value={`${doc.fileName} · ${formatFileSize(doc.fileSize)}`}
                />
                <MetaRow
                  icon={Users}
                  label="Visible para"
                  value={
                    visibleTo.length > 0
                      ? `Equipo directivo, ${visibleTo.join(" y ").toLowerCase()}`
                      : "Solo equipo directivo y destinatarios"
                  }
                />
                {doc.courses.length > 0 && (
                  <MetaRow
                    icon={Users}
                    label="Cursos"
                    value={doc.courses.map((c) => `${c.course.name} ${c.course.year}`).join(", ")}
                  />
                )}
                {doc.requiresAcknowledgement && (
                  <MetaRow icon={BellRing} label="Acuse de recibo" value="Requerido" />
                )}
              </dl>
            </CardContent>
          </Card>

          {canSeeActivity && (
            <Card className="rounded-2xl shadow-soft">
              <CardHeader>
                <CardTitle>Actividad</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="downloads">
                  <TabsList className="w-full">
                    <TabsTrigger value="downloads">Descargas ({downloads.length})</TabsTrigger>
                    <TabsTrigger value="reads">
                      Lectura ({acknowledged}/{recipients.length})
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="downloads" className="mt-4">
                    {downloads.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nadie ha descargado este documento todavía.
                      </p>
                    ) : (
                      <ul className="max-h-80 space-y-3 overflow-y-auto">
                        {downloads.map((d) => (
                          <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{d.user.fullName}</span>
                              <span className="text-xs text-muted-foreground">
                                {ROLE_LABELS[d.user.role]}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {formatDateTime(d.downloadedAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TabsContent>
                  <TabsContent value="reads" className="mt-4">
                    {recipients.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Este documento no tiene destinatarios específicos.
                      </p>
                    ) : (
                      <ul className="max-h-80 space-y-3 overflow-y-auto">
                        {recipients.map((r) => (
                          <li key={r.userId} className="flex items-center justify-between gap-3 text-sm">
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{r.user.fullName}</span>
                              <span className="text-xs text-muted-foreground">
                                {ROLE_LABELS[r.user.role]}
                              </span>
                            </span>
                            {r.acknowledgedAt ? (
                              <span className="shrink-0 rounded-full bg-success px-2 py-0.5 text-xs font-semibold text-success-foreground">
                                Leído {formatDateTime(r.acknowledgedAt)}
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full bg-warning px-2 py-0.5 text-xs font-semibold text-warning-foreground">
                                Pendiente
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="font-medium break-words">{value}</dd>
      </div>
    </div>
  );
}
