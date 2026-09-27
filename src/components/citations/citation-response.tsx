"use client";

import { CalendarClock, CheckCircle2, MessageSquareText, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { CITATION_RESPONSE_LABELS, CITATION_RESPONSES, type CitationResponse } from "@/lib/citations";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { respondCitationAction } from "@/server/actions/citations";

const ICONS = { ACEPTADA: CheckCircle2, RECHAZADA: XCircle, REPROGRAMAR: CalendarClock } as const;

/**
 * El apoderado citado responde: asistirá, no asistirá o pide otro horario.
 * Responder también confirma la lectura. Puede cambiar su respuesta mientras la citación esté vigente.
 */
export function CitationResponsePanel({
  documentId,
  current,
}: {
  documentId: string;
  current: { response: CitationResponse | null; comment: string | null; respondedAt: Date | null };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(!current.response);
  const [choice, setChoice] = useState<CitationResponse | null>(current.response);
  const [comment, setComment] = useState(current.comment ?? "");

  const submit = () => {
    if (!choice) {
      toast.error("Elige una respuesta");
      return;
    }
    startTransition(async () => {
      const result = await respondCitationAction(documentId, { response: choice, comment });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Respuesta enviada: ${CITATION_RESPONSE_LABELS[choice].action}`);
      setEditing(false);
      router.refresh();
    });
  };

  if (!editing && current.response) {
    const Icon = ICONS[current.response];
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-2xl bg-success p-4 text-success-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 size-5 shrink-0" />
          <div>
            <p>
              Respondiste{" "}
              <span className="font-semibold">“{CITATION_RESPONSE_LABELS[current.response].action}”</span>
              {current.respondedAt && <> el {formatDateTime(current.respondedAt)}</>}.
            </p>
            {current.comment && (
              <p className="mt-1 flex items-start gap-1.5 text-sm">
                <MessageSquareText className="mt-0.5 size-3.5 shrink-0" /> “{current.comment}”
              </p>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 bg-card" onClick={() => setEditing(true)}>
          Cambiar respuesta
        </Button>
      </div>
    );
  }

  const needsComment = choice === "REPROGRAMAR";
  return (
    <section
      aria-labelledby="citation-response-title"
      className="mb-6 space-y-4 rounded-2xl border border-warning-foreground/20 bg-warning p-4 text-warning-foreground sm:p-5"
    >
      <div>
        <h2 id="citation-response-title" className="font-semibold">
          ¿Podrás asistir a esta citación?
        </h2>
        <p className="text-sm">Tu respuesta le llega a quien te citó y confirma que la leíste.</p>
      </div>
      <div role="radiogroup" aria-label="Tu respuesta" className="grid gap-2 sm:grid-cols-3">
        {CITATION_RESPONSES.map((response) => {
          const Icon = ICONS[response];
          const selected = choice === response;
          return (
            <button
              key={response}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChoice(response)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border-2 bg-card px-3 py-2.5 text-sm font-semibold text-foreground transition-colors",
                selected ? "border-foreground" : "border-transparent hover:border-foreground/30",
              )}
            >
              <Icon className="size-4" /> {CITATION_RESPONSE_LABELS[response].action}
            </button>
          );
        })}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="citation-comment" className="text-sm font-medium">
          {needsComment ? "¿Qué días u horarios te acomodan?" : "Comentario (opcional)"}
        </label>
        <Textarea
          id="citation-comment"
          value={comment}
          maxLength={500}
          onChange={(event) => setComment(event.target.value)}
          placeholder={needsComment ? "Ej.: martes o jueves después de las 17:00" : ""}
          className="bg-card text-foreground"
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {current.response && (
          <Button
            variant="outline"
            className="bg-card"
            onClick={() => setEditing(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
        )}
        <Button onClick={submit} disabled={isPending || !choice}>
          {isPending && <Spinner />} Enviar respuesta
        </Button>
      </div>
    </section>
  );
}
