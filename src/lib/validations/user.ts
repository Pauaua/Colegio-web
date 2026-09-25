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
});

export const createUserSchema = userFieldsSchema.extend({ password: passwordSchema });
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
