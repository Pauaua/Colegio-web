"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Pencil, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRut } from "@/lib/rut";
import { setUserActiveAction } from "@/server/actions/users";
import type { UserListRow } from "@/server/queries/users";

import { RoleBadge, UserStatusBadge } from "./badges";

const features = tableFeatures({});
const column = createColumnHelper<typeof features, UserListRow>();

function ToggleActiveButton({ user, disabled }: { user: UserListRow; disabled: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const label = user.isActive ? `Desactivar a ${user.fullName}` : `Reactivar a ${user.fullName}`;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={disabled ? "No puedes desactivar tu propia cuenta" : label}
      disabled={disabled || isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await setUserActiveAction(user.id, !user.isActive);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(user.isActive ? "Usuario desactivado" : "Usuario reactivado");
          router.refresh();
        })
      }
    >
      {isPending ? <Spinner /> : user.isActive ? <UserX /> : <UserCheck />}
    </Button>
  );
}

export function UsersTable({ rows, currentUserId }: { rows: UserListRow[]; currentUserId: string }) {
  const columns = column.columns([
    column.accessor("fullName", {
      header: "Nombre",
      cell: ({ row }) => (
        <div className="min-w-0">
          <Link
            href={`/usuarios/${row.original.id}`}
            className="font-semibold underline-offset-4 hover:underline"
          >
            {row.original.fullName}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      ),
    }),
    column.accessor("rut", {
      header: "RUT",
      cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatRut(getValue())}</span>,
    }),
    column.accessor("role", { header: "Rol", cell: ({ getValue }) => <RoleBadge role={getValue()} /> }),
    column.accessor("phone", {
      header: "Teléfono",
      cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue() ?? "—"}</span>,
    }),
    column.accessor("isActive", {
      header: "Estado",
      cell: ({ getValue }) => <UserStatusBadge active={getValue()} />,
    }),
    column.display({
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button asChild variant="ghost" size="icon" aria-label={`Editar a ${row.original.fullName}`}>
            <Link href={`/usuarios/${row.original.id}`}>
              <Pencil />
            </Link>
          </Button>
          <ToggleActiveButton user={row.original} disabled={row.original.id === currentUserId} />
        </div>
      ),
    }),
  ]);

  const table = useTable({ features, columns, data: rows, getRowId: (row) => row.id });

  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-soft md:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="bg-secondary-soft/50 hover:bg-secondary-soft/50">
                {group.headers.map((header) => (
                  <TableHead key={header.id} className="h-12 font-semibold first:pl-5 last:pr-5">
                    <table.FlexRender header={header} />
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className={row.original.isActive ? undefined : "opacity-70"}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className="py-3 first:pl-5 last:pr-5">
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-3 md:hidden">
        {rows.map((user) => (
          <li key={user.id} className="rounded-2xl border bg-card p-4 shadow-soft">
            <div className="mb-2 flex flex-wrap gap-2">
              <RoleBadge role={user.role} />
              <UserStatusBadge active={user.isActive} />
            </div>
            <Link href={`/usuarios/${user.id}`} className="font-semibold underline-offset-4 hover:underline">
              {user.fullName}
            </Link>
            <p className="text-sm text-muted-foreground">
              {user.email} · {formatRut(user.rut)}
            </p>
            <div className="mt-2 flex justify-end">
              <ToggleActiveButton user={user} disabled={user.id === currentUserId} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
