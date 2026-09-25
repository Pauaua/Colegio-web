import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import type { Metadata } from "next";

import { CitationForm } from "@/components/citations/citation-form";
import { PageHeader } from "@/components/shared/page-header";
import { APP_TIME_ZONE } from "@/lib/dates";
import { requirePermission } from "@/lib/session";
import { getCourseOptions } from "@/server/queries/documents";

export const metadata: Metadata = { title: "Nueva citación" };

export default async function NewCitationPage() {
  await requirePermission("citation:create");
  const courses = await getCourseOptions();

  return (
    <>
      <PageHeader
        title="Nueva citación"
        description="Cita a uno o más apoderados. Recibirán la citación en la plataforma y podrán responder."
      />
      <CitationForm courses={courses} minDate={format(TZDate.tz(APP_TIME_ZONE), "yyyy-MM-dd")} />
    </>
  );
}
