import { Archive, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

/** Etiqueta pastel del tipo de documento; el color viene de DocumentType.color. */
export function DocumentTypeBadge({
  name,
  color,
  className,
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-tag-foreground",
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {name}
    </span>
  );
}

export function DocumentStatusBadge({ status }: { status: "VIGENTE" | "ARCHIVADO" }) {
  return status === "VIGENTE" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-0.5 text-xs font-semibold text-success-foreground">
      <CheckCircle2 className="size-3" /> Vigente
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
      <Archive className="size-3" /> Archivado
    </span>
  );
}
