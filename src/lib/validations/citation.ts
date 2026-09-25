import { z } from "zod";

import { CITATION_RESPONSES } from "@/lib/citations";

const id = z.string().min(1).max(64);

export const createCitationSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, { error: "Indica el motivo de la citación" })
      .max(200, { error: "Máximo 200 caracteres" }),
    citationDate: z.iso.date({ error: "Ingresa la fecha de la reunión" }),
    citationTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Ingresa la hora (HH:MM)" }),
    citationPlace: z
      .string()
      .trim()
      .min(2, { error: "Indica el lugar" })
      .max(120, { error: "Máximo 120 caracteres" }),
    description: z.string().trim().max(2000, { error: "Máximo 2000 caracteres" }),
    recipientIds: z.array(id).max(200),
    courseIds: z.array(id).max(50),
  })
  .refine((d) => d.recipientIds.length > 0 || d.courseIds.length > 0, {
    error: "Elige al menos un apoderado o un curso",
    path: ["recipientIds"],
  });

export type CreateCitationInput = z.infer<typeof createCitationSchema>;

export const respondCitationSchema = z
  .object({
    response: z.enum(CITATION_RESPONSES, { error: "Elige una respuesta" }),
    comment: z.string().trim().max(500, { error: "Máximo 500 caracteres" }),
  })
  .refine((d) => d.response !== "REPROGRAMAR" || d.comment.length >= 3, {
    error: "Cuéntanos qué días u horarios te acomodan",
    path: ["comment"],
  });

export type RespondCitationInput = z.infer<typeof respondCitationSchema>;
