import { FilePlus2, FileSearch, Files } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DocumentFiltersBar } from "@/components/documents/document-filters";
import { DocumentsTable } from "@/components/documents/documents-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import {
  DOCUMENTS_PAGE_SIZE,
  documentFiltersToSearch,
  hasActiveFilters,
  parseDocumentFilters,
} from "@/lib/document-filters";
import { roleCan } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { getDocumentAuthors, getDocumentTypes, listDocuments } from "@/server/queries/documents";

export const metadata: Metadata = { title: "Documentos" };

export default async function DocumentsPage({ searchParams }: PageProps<"/documentos">) {
  const user = await requireUser();
  const filters = parseDocumentFilters(await searchParams);

  const [{ rows, total, pageCount }, documentTypes, authors] = await Promise.all([
    listDocuments(user, filters),
    getDocumentTypes(),
    getDocumentAuthors(),
  ]);
  if (total > 0 && filters.page > pageCount) {
    redirect(`/documentos${documentFiltersToSearch({ ...filters, page: pageCount })}`);
  }
  const canCreate = roleCan(user.role, "document:create");

  return (
    <>
      <PageHeader
        title="Documentos"
        description={
          roleCan(user.role, "document:viewAll")
            ? "Todos los documentos institucionales."
            : "Documentos disponibles para ti."
        }
        actions={
          canCreate && (
            <Button asChild>
              <Link href="/documentos/nuevo">
                <FilePlus2 />
                Subir documento
              </Link>
            </Button>
          )
        }
      />

      <DocumentFiltersBar
        filters={filters}
        documentTypes={documentTypes.map(({ id, name }) => ({ id, name }))}
        authors={authors.map(({ id, fullName }) => ({ id, name: fullName }))}
      />

      {rows.length > 0 ? (
        <>
          <DocumentsTable rows={rows} filters={filters} />
          <Pagination
            page={filters.page}
            pageCount={pageCount}
            total={total}
            pageSize={DOCUMENTS_PAGE_SIZE}
            hrefForPage={(page) => `/documentos${documentFiltersToSearch({ ...filters, page })}`}
          />
        </>
      ) : hasActiveFilters(filters) ? (
        <EmptyState
          icon={FileSearch}
          title="No hay documentos que coincidan"
          description="Prueba con otras palabras o quita algunos filtros."
        />
      ) : (
        <EmptyState
          icon={Files}
          title="Todavía no hay documentos"
          description={
            canCreate
              ? "Sube el primer documento institucional para empezar."
              : "Cuando el establecimiento comparta documentos contigo, aparecerán aquí."
          }
          action={
            canCreate && (
              <Button asChild>
                <Link href="/documentos/nuevo">
                  <FilePlus2 /> Subir documento
                </Link>
              </Button>
            )
          }
        />
      )}
    </>
  );
}
