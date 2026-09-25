import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed bg-card px-6 py-14 text-center",
        className,
      )}
    >
      <span className="grid size-14 place-items-center rounded-2xl bg-brand-gradient">
        <Icon className="size-7" strokeWidth={1.5} />
      </span>
      <div className="max-w-sm space-y-1">
        <p className="text-lg font-semibold">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
