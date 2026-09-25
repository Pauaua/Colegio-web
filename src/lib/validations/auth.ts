import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Ingresa un correo válido" })),
  password: z
    .string()
    .min(1, { error: "Ingresa tu contraseña" })
    .max(200, { error: "La contraseña es demasiado larga" }),
});

export type LoginInput = z.infer<typeof loginSchema>;
