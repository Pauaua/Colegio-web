import { CalendarClock, CheckCircle2, Clock, MapPin, XCircle } from "lucide-react";

import { CITATION_RESPONSE_LABELS, type CitationResponse } from "@/lib/citations";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Estado de respuesta de un citado: siempre con ícono + texto, nunca solo color. */
export function CitationResponseBadge({ response }: { response: CitationResponse | null }) {
  const config = !response
    ? { icon: Clock, label: "Sin respuesta", className: "bg-muted text-muted-foreground" }
    : response === "ACEPTADA"
      ? {
          icon: CheckCircle2,
          label: CITATION_RESPONSE_LABELS.ACEPTADA.status,
          className: "bg-success text-success-foreground",
        }
      : response === "RECHAZADA"
        ? {
            icon: XCircle,
            label: CITATION_RESPONSE_LABELS.RECHAZADA.status,
            className: "bg-destructive-soft text-foreground",
          }
        : {
            icon: CalendarClock,
            label: CITATION_RESPONSE_LABELS.REPROGRAMAR.status,
            className: "bg-warning text-warning-foreground",
          };
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        config.className,
      )}
    >
      <Icon className="size-3" /> {config.label}
    </span>
  );
}

export function CitationWhenWhere({ at, place }: { at: Date | null; place: string | null }) {
  if (!at && !place) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {at && (
        <span className="flex items-center gap-1.5">
          <CalendarClock className="size-4 text-muted-foreground" /> {formatDateTime(at)}
        </span>
      )}
      {place && (
        <span className="flex items-center gap-1.5">
          <MapPin className="size-4 text-muted-foreground" /> {place}
        </span>
      )}
    </span>
  );
}
