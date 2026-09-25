import { Construction } from "lucide-react";

import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";

/** Marcador temporal para secciones que se construyen en fases posteriores. */
export function ComingSoon({ title, phase }: { title: string; phase: number }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon={Construction}
        title="Estamos preparando esta sección"
        description={`Estará disponible en la fase ${phase} del proyecto.`}
      />
    </>
  );
}
