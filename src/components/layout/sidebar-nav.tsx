"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Role } from "@/lib/roles";
import { cn } from "@/lib/utils";

import { getActiveHref, getNavSectionsForRole } from "./nav-items";

export function SidebarNav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const sections = getNavSectionsForRole(role);
  const activeHref = getActiveHref(
    pathname,
    sections.flatMap((section) => section.items),
  );

  return (
    <nav aria-label="Navegación principal" className="space-y-6">
      {sections.map((section, index) => (
        <div key={section.title ?? index} className="space-y-1">
          {section.title && (
            <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-foreground/60 uppercase">
              {section.title}
            </p>
          )}
          {section.items.map(({ href, label, icon: Icon }) => {
            const isActive = href === activeHref;
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  "hover:bg-card/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  isActive && "bg-primary-soft font-semibold shadow-soft hover:bg-primary-soft",
                )}
              >
                <Icon className="size-[18px]" strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
