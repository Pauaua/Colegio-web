import { z } from "zod";

import { extensionMatchesMime, isAllowedMimeType, MAX_FILE_SIZE } from "@/lib/files";

const id = z.string().min(1).max(64);

/** Roles a los que se puede dar visibilidad (los directivos siempre ven todo). */
export const VISIBILITY_ROLES = ["DOCENTE", "APODERADO"] as const;

export const fileMetaSchema = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    mimeType: z
      .string()
      .refine(isAllowedMimeType, { error: "Solo se aceptan archivos PDF, DOCX, JPG o PNG" }),
    fileSize: z
      .number()
      .int()
      .positive({ error: "El archivo está vacío" })
      .max(MAX_FILE_SIZE, { error: "El archivo supera el máximo de 10 MB" }),
  })
  .refine((f) => extensionMatchesMime(f.fileName, f.mimeType), {
    error: "La extensión del archivo no corresponde a su tipo",
    path: ["fileName"],
  });

export type FileMeta = z.infer<typeof fileMetaSchema>;

const documentFieldsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, { error: "El título debe tener al menos 3 caracteres" })
    .max(200, { error: "Máximo 200 caracteres" }),
  documentTypeId: z.string().min(1, { error: "Selecciona el tipo de documento" }).max(64),
  documentDate: z.iso.date({ error: "Ingresa una fecha válida" }),
  folioNumber: z
    .number({ error: "Ingresa un número de folio" })
    .int({ error: "El folio debe ser un número entero" })
    .min(1, { error: "El folio debe ser mayor que 0" })
    .max(999_999, { error: "Folio demasiado grande" }),
  description: z.string().trim().max(2000, { error: "Máximo 2000 caracteres" }),
  visibility: z.array(z.enum(VISIBILITY_ROLES)).max(2),
  recipientIds: z.array(id).max(200),
  courseIds: z.array(id).max(50),
  requiresAcknowledgement: z.boolean(),
});

const acknowledgementNeedsRecipients = {
  check: (d: { requiresAcknowledgement: boolean; recipientIds: string[]; courseIds: string[] }) =>
    !d.requiresAcknowledgement || d.recipientIds.length > 0 || d.courseIds.length > 0,
  params: {
    error: "Para pedir acuse de recibo, agrega destinatarios o un curso",
    path: ["requiresAcknowledgement"],
  },
};

/** Campos del formulario de subida (y de edición de metadatos). */
export const documentFormSchema = documentFieldsSchema.refine(
  acknowledgementNeedsRecipients.check,
  acknowledgementNeedsRecipients.params,
);

export type DocumentFormValues = z.infer<typeof documentFormSchema>;

export const createDocumentSchema = documentFieldsSchema
  .extend({ fileKey: z.string().min(1).max(300) })
  .and(fileMetaSchema)
  .refine(acknowledgementNeedsRecipients.check, acknowledgementNeedsRecipients.params);

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const uploadUrlRequestSchema = fileMetaSchema;

export const folioSuggestionSchema = z.object({
  documentTypeId: id,
  year: z.number().int().min(2000).max(2100),
});
