import { ArrowLeft, Search, UserPlus, Users } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { NativeSelect } from "@/components/shared/native-select";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UsersTable } from "@/components/users/users-table";
import { ROLE_LABELS } from "@/lib/roles";
import { requirePermission } from "@/lib/session";
import { USER_GROUP_KEYS, USER_GROUPS, type UserGroup } from "@/lib/user-groups";
import { cn } from "@/lib/utils";
import { listUsers, USERS_PAGE_SIZE, userFiltersSchema, userFiltersToSearch } from "@/server/queries/users";

/** Lista de usuarios de un grupo (directivos, docentes o apoderados), con búsqueda y paginación. */
export async function UserGroupList({
  group,
  searchParams,
}: {
  group: UserGroup;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("user:manage");
  const { label, description, roles, newLabel } = USER_GROUPS[group];
  const filters = userFiltersSchema.parse(await searchParams);
  const { rows, total, pageCount } = await listUsers(filters, roles);
  const basePath = `/usuarios/${group}`;
  const hasRoleFilter = roles.length > 1;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href="/usuarios">
          <ArrowLeft /> Volver a usuarios
        </Link>
      </Button>

      <PageHeader
        title={label}
        description={description}
        actions={
          <Button asChild>
            <Link href={`/usuarios/nuevo?rol=${roles[roles.length - 1]}`}>
              <UserPlus /> {newLabel}
            </Link>
          </Button>
        }
      />

      <nav aria-label="Grupos de usuarios" className="mb-6 flex flex-wrap gap-2">
        {USER_GROUP_KEYS.map((key) => (
          <Link
            key={key}
            href={`/usuarios/${key}`}
            aria-current={key === group ? "page" : undefined}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors",
              key === group
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-primary-soft/40",
            )}
          >
            {USER_GROUPS[key].label}
          </Link>
        ))}
      </nav>

      <form
        action={basePath}
        className={cn(
          "mb-6 grid gap-4 rounded-2xl border bg-card p-4 shadow-soft sm:items-end sm:p-5",
          hasRoleFilter ? "sm:grid-cols-[1fr_200px_180px_auto]" : "sm:grid-cols-[1fr_180px_auto]",
        )}
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
        {hasRoleFilter && (
          <div className="space-y-2">
            <Label htmlFor="rol">Cargo</Label>
            <NativeSelect id="rol" name="rol" defaultValue={filters.rol ?? ""}>
              <option value="">Todos</option>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
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
          title={`No encontramos ${label.toLowerCase()}`}
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
            hrefForPage={(page) => `${basePath}${userFiltersToSearch({ ...filters, page })}`}
          />
        </>
      )}
    </>
  );
}
