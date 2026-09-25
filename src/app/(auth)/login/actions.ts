"use server";

import { AuthError, CredentialsSignin } from "next-auth";

import { signIn } from "@/lib/auth";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";

export type LoginResult = { error: string } | undefined;

/** Solo rutas internas: evita redirecciones abiertas a otros dominios. */
function safeCallbackUrl(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function loginAction(input: LoginInput, callbackUrl?: string): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa el correo y la contraseña." };
  }

  try {
    await signIn("credentials", {
      ...parsed.data,
      redirectTo: safeCallbackUrl(callbackUrl),
    });
  } catch (error) {
    if (error instanceof CredentialsSignin && error.code === "rate_limited") {
      return { error: "Demasiados intentos fallidos. Espera 15 minutos antes de volver a intentar." };
    }
    if (error instanceof AuthError) {
      return { error: "Correo o contraseña incorrectos." };
    }
    // La redirección de Next.js tras un login exitoso se propaga como excepción.
    throw error;
  }
}
