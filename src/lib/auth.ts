import "server-only";

import bcrypt from "bcryptjs";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { logAudit } from "@/lib/audit";
import { authConfig } from "@/lib/auth.config";
import { prisma } from "@/lib/prisma";
import { getClientIp, isLoginRateLimited, recordLoginAttempt } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validations/auth";

export class InvalidCredentialsError extends CredentialsSignin {
  code = "invalid_credentials";
}

export class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

// Hash de relleno: se compara aunque el usuario no exista, para que el tiempo
// de respuesta no revele qué correos están registrados.
const DUMMY_HASH = "$2b$10$PTzEP36pcaV1mZy1aPDyP.7Xpn8m93vUo0AsW.q/aiS0lUQWVd..2";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(rawCredentials, request) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) throw new InvalidCredentialsError();

        const { email, password } = parsed.data;
        const ip = getClientIp(request.headers);

        if (await isLoginRateLimited(email, ip)) throw new RateLimitedError();

        const user = await prisma.user.findUnique({ where: { email } });
        const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

        if (!user || !user.isActive || !passwordOk) {
          await recordLoginAttempt(email, ip, false);
          throw new InvalidCredentialsError();
        }

        await recordLoginAttempt(email, ip, true);
        await logAudit({
          userId: user.id,
          action: "LOGIN",
          entity: "User",
          entityId: user.id,
          metadata: { ip },
        });

        return { id: user.id, name: user.fullName, email: user.email, role: user.role };
      },
    }),
  ],
});
