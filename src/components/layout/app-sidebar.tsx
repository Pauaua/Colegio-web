import { Logo } from "@/components/shared/logo";
import type { Role } from "@/lib/roles";

import { SidebarNav } from "./sidebar-nav";

export function AppSidebar({ role }: { role: Role }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-8 border-r border-sidebar-border bg-brand-gradient p-5 lg:flex">
      <Logo className="px-1" />
      <div className="flex-1 overflow-y-auto">
        <SidebarNav role={role} />
      </div>
    </aside>
  );
}
