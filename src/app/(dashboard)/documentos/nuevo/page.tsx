import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import type { Metadata } from "next";

import { DocumentForm } from "@/components/documents/document-form";
import { PageHeader } from "@/components/shared/page-header";
import { APP_TIME_ZONE } from "@/lib/dates";
import { requirePermission } from "@/lib/session";
import { getCourseOptions, getDocumentTypes } from "@/server/queries/documents";

export const metadata: Metadata = { title: "Subir documento" };

export default async function NewDocumentPage() {
  await requirePermission("document:create");
  const [documentTypes, courses] = await Promise.all([getDocumentTypes(), getCourseOptions()]);

  return (
    <>
      <PageHeader
        title="Subir documento"
        description="Carga el archivo, clasifícalo y define quién puede verlo."
      />
      <DocumentForm
        mode={{ type: "create", today: format(TZDate.tz(APP_TIME_ZONE), "yyyy-MM-dd") }}
        documentTypes={documentTypes.map(({ id, name, color }) => ({ id, name, color }))}
        courses={courses}
      />
    </>
  );
}
