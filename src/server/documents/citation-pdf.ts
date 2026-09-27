import "server-only";

import { randomUUID } from "node:crypto";

import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { APP_TIME_ZONE } from "@/lib/dates";
import { buildFileKey } from "@/lib/files";
import { buildSimplePdf } from "@/lib/pdf";

export type CitationPdfData = {
  folioNumber: number;
  folioYear: number;
  title: string;
  description: string | null;
  citationAt: Date;
  citationPlace: string;
  authorName: string;
};

/**
 * PDF de una citación generada por la plataforma. Se usa al crearla y cada vez que se
 * editan sus datos, para que la vista previa y la descarga reflejen siempre el texto vigente.
 * Cada versión va en una clave nueva: así ninguna caché sirve el PDF anterior.
 */
export function buildCitationPdf(data: CitationPdfData) {
  const when = format(
    new TZDate(data.citationAt, APP_TIME_ZONE),
    "EEEE d 'de' MMMM 'de' yyyy 'a las' HH:mm 'h'",
    {
      locale: es,
    },
  );
  const fileName = `citacion-${data.folioNumber}-${data.folioYear}.pdf`;
  const pdf = buildSimplePdf({
    heading: `Citación N° ${data.folioNumber}/${data.folioYear}`,
    title: data.title,
    meta: [
      `Fecha y hora: ${when.charAt(0).toUpperCase()}${when.slice(1)}`,
      `Lugar: ${data.citationPlace}`,
      `Cita: ${data.authorName}`,
    ],
    body: `Estimado(a) apoderado(a): por medio de la presente se le cita a una reunión en la fecha, hora y lugar indicados. ${data.description ?? ""} Le pedimos confirmar su asistencia en la plataforma del establecimiento.`,
  });
  return { fileName, fileKey: buildFileKey(fileName, randomUUID(), data.folioYear), pdf };
}
