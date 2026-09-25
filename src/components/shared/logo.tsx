import { FolderHeart } from "lucide-react";

import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="grid size-10 place-items-center rounded-xl bg-card shadow-soft">
        <FolderHeart className="size-5 text-foreground" strokeWidth={1.75} />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-base font-bold">Gestor Documental</span>
          <span className="block text-xs text-muted-foreground">Escolar</span>
        </span>
      )}
    </div>
  );
}
