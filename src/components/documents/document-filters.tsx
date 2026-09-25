"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { documentFiltersToSearch, hasActiveFilters, type DocumentFilters } from "@/lib/document-filters";

const ALL = "__all__";

type Option = { id: string; name: string };

export function DocumentFiltersBar({
  filters,
  documentTypes,
  authors,
}: {
  filters: DocumentFilters;
  documentTypes: Option[];
  authors: Option[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.q ?? "");
  const lastPushedQuery = useRef(filters.q ?? "");

  function apply(changes: Partial<DocumentFilters>) {
    // Cualquier cambio de filtro vuelve a la primera página.
    const search = documentFiltersToSearch({ ...filters, ...changes, page: 1 });
    startTransition(() => router.replace(`/documentos${search}`, { scroll: false }));
  }

  // Búsqueda con debounce: no navega en cada tecla.
  useEffect(() => {
    const q = query.trim();
    if (q === lastPushedQuery.current) return;
    const timeout = setTimeout(() => {
      lastPushedQuery.current = q;
      apply({ q: q || undefined });
    }, 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply depende de filters, que cambia con cada navegación
  }, [query]);

  return (
    <div className="mb-6 space-y-4 rounded-2xl border bg-card p-4 shadow-soft sm:p-5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por título o folio (p. ej. 12/2026)…"
          aria-label="Buscar documentos"
          className="h-11 pl-9"
        />
        {isPending && <Spinner className="absolute top-1/2 right-3 -translate-y-1/2" />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <FilterSelect
          id="filter-type"
          label="Tipo"
          value={filters.type}
          options={documentTypes}
          allLabel="Todos los tipos"
          onChange={(type) => apply({ type })}
        />
        <FilterSelect
          id="filter-author"
          label="Autor"
          value={filters.author}
          options={authors}
          allLabel="Todos los autores"
          onChange={(author) => apply({ author })}
        />
        <FilterSelect
          id="filter-status"
          label="Estado"
          value={filters.status}
          options={[
            { id: "VIGENTE", name: "Vigente" },
            { id: "ARCHIVADO", name: "Archivado" },
          ]}
          allLabel="Todos los estados"
          onChange={(status) => apply({ status: status as DocumentFilters["status"] })}
        />
        <div className="space-y-2">
          <Label htmlFor="filter-from">Desde</Label>
          <Input
            id="filter-from"
            type="date"
            value={filters.from ?? ""}
            max={filters.to}
            onChange={(event) => apply({ from: event.target.value || undefined })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-to">Hasta</Label>
          <Input
            id="filter-to"
            type="date"
            value={filters.to ?? ""}
            min={filters.from}
            onChange={(event) => apply({ to: event.target.value || undefined })}
          />
        </div>
      </div>

      {hasActiveFilters(filters) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery("");
            lastPushedQuery.current = "";
            startTransition(() =>
              router.replace(
                `/documentos${documentFiltersToSearch({ sort: filters.sort, dir: filters.dir })}`,
                {
                  scroll: false,
                },
              ),
            );
          }}
        >
          <X />
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  options,
  allLabel,
  onChange,
}: {
  id: string;
  label: string;
  value: string | undefined;
  options: Option[];
  allLabel: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? undefined : next)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
