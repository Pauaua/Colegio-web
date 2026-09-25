import { z } from "zod";

import { isValidRut } from "@/lib/rut";

export const courseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Ingresa el nombre del curso" })
    .max(60, { error: "Máximo 60 caracteres" }),
  year: z
    .number({ error: "Ingresa el año" })
    .int()
    .min(2000, { error: "Año inválido" })
    .max(2100, { error: "Año inválido" }),
});
export type CourseInput = z.infer<typeof courseSchema>;

export const studentSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, { error: "Ingresa el nombre completo" })
    .max(120, { error: "Máximo 120 caracteres" }),
  rut: z.string().trim().refine(isValidRut, { error: "RUT inválido (revisa el dígito verificador)" }),
});
export type StudentInput = z.infer<typeof studentSchema>;
