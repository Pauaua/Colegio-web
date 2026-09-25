import { Search, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { NativeSelect } from "@/components/shared/native-select";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UsersTable } from "@/components/users/users-table";
import { ROLE_LABELS, ROLES } from "@/lib/roles";
import { requirePermission } from "@/lib/session";
import { listUsers, USERS_PAGE_SIZE, userFiltersSchema, userFiltersToSearch } from "@/server/queries/users";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsersPage({ searchParams }: PageProps<"/usuarios">) {
  const user = await requirePermission("user:manage");
  const filters = userFiltersSchema.parse(await searchParams);
  const { rows, total, pageCount } = await listUsers(filters);

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Cuentas de acceso y roles de la comunidad escolar."
        actions={
          <Button asChild>
            <Link href="/usuarios/nuevo">
              <UserPlus /> Nuevo usuario
            </Link>
          </Button>
        }
      />

      <form
        action="/usuarios"
        className="mb-6 grid gap-4 rounded-2xl border bg-card p-4 shadow-soft sm:grid-cols-[1fr_200px_180px_auto] sm:items-end sm:p-5"
      >
        <div className="space-y-2">
          <Label htmlFor="q">Buscar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="q"
              name="q"
              type="search"
              defaultValue={filters.q}
              placeholder="Nombre, correo o RUT"
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rol">Rol</Label>
          <NativeSelect id="rol" name="rol" defaultValue={filters.rol ?? ""}>
            <option value="">Todos los roles</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="estado">Estado</Label>
          <NativeSelect id="estado" name="estado" defaultValue={filters.estado ?? ""}>
            <option value="">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No encontramos usuarios"
          description="Prueba con otra búsqueda o quita los filtros."
        />
      ) : (
        <>
          <UsersTable rows={rows} currentUserId={user.id} />
          <Pagination
            page={filters.page}
            pageCount={pageCount}
            total={total}
            pageSize={USERS_PAGE_SIZE}
            hrefForPage={(page) => `/usuarios${userFiltersToSearch({ ...filters, page })}`}
          />
        </>
      )}
    </>
  );
}
