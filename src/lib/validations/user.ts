import { z } from "zod";

import { ROLES } from "@/lib/roles";
import { isValidRut } from "@/lib/rut";

export const passwordSchema = z
  .string()
  .min(8, { error: "Mínimo 8 caracteres" })
  .max(100, { error: "Máximo 100 caracteres" })
  .regex(/[a-zA-Z]/, { error: "Debe incluir al menos una letra" })
  .regex(/\d/, { error: "Debe incluir al menos un número" });

const userFieldsSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, { error: "Ingresa el nombre completo" })
    .max(120, { error: "Máximo 120 caracteres" }),
  rut: z.string().trim().refine(isValidRut, { error: "RUT inválido (revisa el dígito verificador)" }),
  email: z
    .string()
    .trim()
    .pipe(z.email({ error: "Ingresa un correo válido" })),
  role: z.enum(ROLES, { error: "Selecciona un rol" }),
  phone: z
    .string()
    .trim()
    .max(20, { error: "Máximo 20 caracteres" })
    .regex(/^[+\d\s()-]*$/, { error: "Solo números, espacios y +" }),
  /** Cursos en los que hace clases (solo docentes; opcional). */
  courseIds: z.array(z.string().min(1)).max(30, { error: "Máximo 30 cursos" }),
});

/** Valor del selector de estudiante que indica "matricular a un estudiante nuevo". */
export const NEW_STUDENT = "__nuevo__";

/**
 * Pupilo que se vincula al crear un apoderado: un estudiante ya matriculado del curso
 * elegido, o uno nuevo (nombre y RUT) que se matricula en ese curso en la misma operación.
 */
export const pupilSchema = z
  .object({
    courseId: z.string().min(1, { error: "Elige un curso" }),
    studentId: z.string(),
    fullName: z.string().trim().max(120, { error: "Máximo 120 caracteres" }),
    rut: z.string().trim(),
  })
  .superRefine((pupil, ctx) => {
    if (pupil.studentId !== NEW_STUDENT) {
      if (!pupil.studentId)
        ctx.addIssue({ code: "custom", message: "Elige un estudiante", path: ["studentId"] });
      return;
    }
    if (pupil.fullName.length < 3) {
      ctx.addIssue({ code: "custom", message: "Ingresa el nombre del estudiante", path: ["fullName"] });
    }
    if (!isValidRut(pupil.rut)) {
      ctx.addIssue({ code: "custom", message: "RUT inválido (revisa el dígito verificador)", path: ["rut"] });
    }
  });
export type PupilInput = z.infer<typeof pupilSchema>;

export const createUserSchema = userFieldsSchema
  .extend({ password: passwordSchema, pupils: z.array(pupilSchema).max(10, { error: "Máximo 10 pupilos" }) })
  // Un apoderado sin pupilos no recibe nada de sus cursos: se vincula al crearlo.
  .refine((d) => d.role !== "APODERADO" || d.pupils.length > 0, {
    error: "Vincula al menos un pupilo al apoderado",
    path: ["pupils"],
  });
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Al editar, la contraseña es opcional: vacía = no se cambia. */
export const updateUserSchema = userFieldsSchema.extend({
  password: z.union([z.literal(""), passwordSchema]),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "Ingresa tu contraseña actual" }).max(100),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    error: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    error: "La nueva contraseña debe ser distinta de la actual",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const profileSchema = userFieldsSchema.pick({ phone: true });
export type ProfileInput = z.infer<typeof profileSchema>;
