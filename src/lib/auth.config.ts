import type { NextAuthConfig } from "next-auth";

/**
 * Configuración base de Auth.js, sin dependencias de base de datos ni bcrypt.
 * La importa proxy.ts; el provider de credenciales se agrega en lib/auth.ts.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // una jornada laboral
  },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.name = user.name ?? "";
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.name = token.name;
      return session;
    },
  },
} satisfies NextAuthConfig;
