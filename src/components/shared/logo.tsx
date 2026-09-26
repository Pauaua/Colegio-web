import Image from "next/image";

import logo from "../../../public/images/logo.png";

import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Image
        src={logo}
        alt="Escuela F N° 732 Chorombo Alto"
        // La versión compacta va en la barra superior (h-16), que no admite el tamaño completo.
        className={cn("shrink-0 rounded-full shadow-soft", compact ? "size-12" : "size-18")}
        sizes={compact ? "48px" : "72px"}
        priority
      />
      {!compact && (
        <span className="leading-tight">
          <span className="block text-base font-bold">Gestor Documental</span>
          <span className="block text-xs text-muted-foreground">Escolar</span>
        </span>
      )}
    </div>
  );
}
