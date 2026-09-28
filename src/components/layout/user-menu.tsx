"use client";

import { ChevronDown, LogOut, UserRound } from "lucide-react";
import Link from "next/link";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { logoutAction } from "@/server/actions/auth";

type Props = { fullName: string; email: string; role: Role; avatarSrc: string | null };

export function UserMenu({ fullName, email, role, avatarSrc }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto gap-3 rounded-xl px-2 py-1.5">
          <UserAvatar fullName={fullName} src={avatarSrc} className="size-9" />
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-semibold">{fullName}</span>
            <span className="block text-xs text-muted-foreground">{ROLE_LABELS[role]}</span>
          </span>
          <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block font-semibold">{fullName}</span>
          <span className="block truncate text-xs text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/perfil">
            <UserRound />
            Mi perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void logoutAction()}>
          <LogOut />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
