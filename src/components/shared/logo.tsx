import Image from "next/image";

import logo from "../../../public/images/logo.png";

import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Image
        src={logo}
        alt="Escuela F N° 732 Chorombo Alto"
        className="size-12 shrink-0 rounded-full shadow-soft"
        sizes="48px"
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
