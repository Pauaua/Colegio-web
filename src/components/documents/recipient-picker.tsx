"use client";

import { UserPlus, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { ROLE_LABELS } from "@/lib/roles";
import type { RecipientOption } from "@/server/actions/documents";

type SearchResult = { ok: true; data: RecipientOption[] } | { ok: false; error: string };

export function RecipientPicker({
  value,
  onChange,
  search,
  placeholder = "Buscar docente o apoderado por nombre, correo o RUT…",
}: {
  value: RecipientOption[];
  onChange: (recipients: RecipientOption[]) => void;
  /** Server Action de búsqueda: define a quién se puede elegir. */
  search: (query: string) => Promise<SearchResult>;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RecipientOption[]>([]);
  const [isSearching, startSearch] = useTransition();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timeout = setTimeout(() => {
      startSearch(async () => {
        const result = await search(q);
        setResults(result.ok ? result.data : []);
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, search]);

  const selectedIds = new Set(value.map((r) => r.id));
  const visibleResults = query.trim().length < 2 ? [] : results;

  return (
    <div className="space-y-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-start text-muted-foreground">
            <UserPlus />
            {placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Escribe al menos 2 letras…" value={query} onValueChange={setQuery} />
            <CommandList>
              {isSearching && (
                <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Spinner /> Buscando…
                </div>
              )}
              {!isSearching && (
                <CommandEmpty>
                  {query.trim().length < 2 ? "Escribe para buscar" : "No encontramos coincidencias"}
                </CommandEmpty>
              )}
              {visibleResults.length > 0 && (
                <CommandGroup>
                  {visibleResults.map((user) => (
                    <CommandItem
                      key={user.id}
                      value={user.id}
                      disabled={selectedIds.has(user.id)}
                      onSelect={() => {
                        onChange([...value, user]);
                        setQuery("");
                        setOpen(false);
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{user.fullName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {ROLE_LABELS[user.role]} · {user.email}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Destinatarios seleccionados">
          {value.map((user) => (
            <li key={user.id}>
              <Badge
                variant="secondary"
                className="h-8 gap-1.5 rounded-full bg-secondary-soft pr-1 pl-3 text-sm"
              >
                {user.fullName}
                <span className="text-xs text-muted-foreground">({ROLE_LABELS[user.role]})</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="rounded-full"
                  aria-label={`Quitar a ${user.fullName}`}
                  onClick={() => onChange(value.filter((r) => r.id !== user.id))}
                >
                  <X />
                </Button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
