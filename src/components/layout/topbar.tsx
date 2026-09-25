import { Logo } from "@/components/shared/logo";
import type { CurrentUser } from "@/lib/session";

import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function Topbar({ user }: { user: CurrentUser }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur sm:px-6 lg:px-8">
      <MobileNav role={user.role} />
      <Logo compact className="lg:hidden" />
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <UserMenu fullName={user.fullName} email={user.email} role={user.role} />
      </div>
    </header>
  );
}
