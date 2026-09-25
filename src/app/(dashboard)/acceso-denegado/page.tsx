import { Home, ShieldX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Acceso denegado" };

export default function AccessDeniedPage() {
  return (
    <EmptyState
      icon={ShieldX}
      title="No tienes acceso a esta sección"
      description="Tu perfil no tiene permiso para ver esta página. Si crees que es un error, habla con la dirección del establecimiento."
      action={
        <Button asChild>
          <Link href="/">
            <Home />
            Volver al inicio
          </Link>
        </Button>
      }
    />
  );
}
