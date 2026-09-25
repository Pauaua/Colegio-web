import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DocumentForm } from "@/components/documents/document-form";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import type { RecipientOption } from "@/server/actions/documents";
import { getCourseOptions, getDocumentDetail, getDocumentTypes } from "@/server/queries/documents";

export const metadata: Metadata = { title: "Editar documento" };

export default async function EditDocumentPage({ params }: PageProps<"/documentos/[id]/editar">) {
  const user = await requirePermission("document:update");
  const { id } = await params;
  const detail = await getDocumentDetail(id, user);
  if (!detail) notFound();
  // El equipo directivo solo edita sus propios documentos.
  if (!can(user, "document:update", detail.permission)) redirect("/acceso-denegado");

  const { document: doc } = detail;
  const [documentTypes, courses, courseLinks, recipientUsers] = await Promise.all([
    getDocumentTypes(),
    getCourseOptions(),
    prisma.documentCourse.findMany({ where: { documentId: doc.id }, select: { courseId: true } }),
    prisma.user.findMany({
      where: { id: { in: doc.recipients.map((r) => r.userId) } },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  // Los apoderados agregados por curso no se listan como destinatarios individuales:
  // se recalculan desde el curso al guardar.
  const courseIds = courseLinks.map((c) => c.courseId);
  const courseGuardians = new Set(
    (
      await prisma.guardianStudent.findMany({
        where: { student: { courseId: { in: courseIds } } },
        select: { guardianId: true },
      })
    ).map((g) => g.guardianId),
  );
  const individualRecipients = recipientUsers.filter(
    (u) => !courseGuardians.has(u.id) && (u.role === "DOCENTE" || u.role === "APODERADO"),
  ) as RecipientOption[];

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href={`/documentos/${doc.id}`}>
          <ArrowLeft /> Volver al documento
        </Link>
      </Button>
      <PageHeader title="Editar documento" description={doc.title} />
      <DocumentForm
        mode={{
          type: "edit",
          documentId: doc.id,
          fileName: doc.fileName,
          initialRecipients: individualRecipients,
          defaultValues: {
            title: doc.title,
            documentTypeId: doc.documentTypeId,
            documentDate: doc.documentDate.toISOString().slice(0, 10),
            folioNumber: doc.folioNumber,
            description: doc.description ?? "",
            visibility: doc.visibility
              .map((v) => v.role)
              .filter((role): role is "DOCENTE" | "APODERADO" => role === "DOCENTE" || role === "APODERADO"),
            recipientIds: individualRecipients.map((r) => r.id),
            courseIds,
            requiresAcknowledgement: doc.requiresAcknowledgement,
          },
        }}
        documentTypes={documentTypes.map(({ id, name, color }) => ({ id, name, color }))}
        courses={courses}
      />
    </>
  );
}
