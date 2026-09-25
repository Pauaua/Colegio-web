import type { CitationResponse } from "@/generated/prisma/enums";

/** Código del DocumentType de las citaciones. */
export const CITATION_TYPE_CODE = "CITACION";

export const CITATION_RESPONSES = ["ACEPTADA", "RECHAZADA", "REPROGRAMAR"] as const satisfies readonly CitationResponse[];

/** Etiquetas desde el punto de vista del apoderado (botones) y del emisor (estado). */
export const CITATION_RESPONSE_LABELS: Record<CitationResponse, { action: string; status: string }> = {
  ACEPTADA: { action: "Asistiré", status: "Asistirá" },
  RECHAZADA: { action: "No podré asistir", status: "No asistirá" },
  REPROGRAMAR: { action: "Pedir otro horario", status: "Pide otro horario" },
};

export type { CitationResponse };
