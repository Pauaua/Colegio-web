import { FileText, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/shared/logo";
import { getCurrentUser } from "@/lib/session";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

const HIGHLIGHTS = [
  { icon: FileText, text: "Memos, oficios, citaciones, acuerdos, actas y permisos en un solo lugar." },
  { icon: Users, text: "Cada persona ve solo lo que le corresponde según su rol." },
  { icon: ShieldCheck, text: "Descargas registradas y acuse de recibo para las citaciones." },
];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");

  const { callbackUrl } = await searchParams;

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-brand-gradient p-12 lg:flex">
        <Logo />
        <div className="max-w-md space-y-8">
          <h1 className="text-4xl leading-tight font-bold">
            La documentación de tu colegio, ordenada y a mano.
          </h1>
          <ul className="space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card/70 shadow-soft">
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <span className="pt-2 text-foreground/85">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-foreground/70">Gestor Documental Escolar</p>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">¡Hola de nuevo!</h2>
            <p className="text-muted-foreground">Ingresa con tu correo institucional.</p>
          </div>
          <LoginForm callbackUrl={typeof callbackUrl === "string" ? callbackUrl : undefined} />
        </div>
      </section>
    </main>
  );
}
