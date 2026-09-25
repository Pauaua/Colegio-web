"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Eye, User } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDate } from "@/lib/dates";
import {
  documentFiltersToSearch,
  type DocumentFilters,
  type DocumentSortField,
} from "@/lib/document-filters";
import { cn } from "@/lib/utils";
import type { DocumentListRow } from "@/server/queries/documents";

import { DocumentStatusBadge, DocumentTypeBadge } from "./badges";

// Orden, filtros y paginación ocurren en el servidor: la tabla solo usa las features base.
const features = tableFeatures({});
const column = createColumnHelper<typeof features, DocumentListRow>();

const columns = column.columns([
  column.accessor("title", {
    header: "Título",
    meta: { sortField: "title" },
    cell: ({ row }) => (
      <Link
        href={`/documentos/${row.original.id}`}
        className="font-semibold underline-offset-4 hover:underline focus-visible:underline"
      >
        {row.original.title}
      </Link>
    ),
  }),
  column.accessor("typeName", {
    header: "Tipo",
    meta: { sortField: "type" },
    cell: ({ row }) => <DocumentTypeBadge name={row.original.typeName} color={row.original.typeColor} />,
  }),
  column.accessor("folio", {
    header: "Folio",
    meta: { sortField: "folio" },
    cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span>,
  }),
  column.accessor("documentDate", {
    header: "Fecha",
    meta: { sortField: "date" },
    cell: ({ getValue }) => (
      <span className="whitespace-nowrap tabular-nums">{formatCalendarDate(getValue())}</span>
    ),
  }),
  column.accessor("authorName", { header: "Autor", meta: { sortField: "author" } }),
  column.accessor("status", {
    header: "Estado",
    meta: { sortField: "status" },
    cell: ({ getValue }) => <DocumentStatusBadge status={getValue()} />,
  }),
  column.display({
    id: "actions",
    header: () => <span className="sr-only">Acciones</span>,
    cell: ({ row }) => <RowActions row={row.original} />,
  }),
]);

function RowActions({ row }: { row: DocumentListRow }) {
  return (
    <div className="flex justify-end gap-1">
      <Button asChild variant="ghost" size="icon" aria-label={`Ver ${row.title}`}>
        <Link href={`/documentos/${row.id}`}>
          <Eye />
        </Link>
      </Button>
      <Button asChild variant="ghost" size="icon" aria-label={`Descargar ${row.title}`}>
        {/* Enlace normal (no <Link>): la descarga es un Route Handler que redirige al archivo. */}
        <a href={`/api/documents/${row.id}/download`}>
          <Download />
        </a>
      </Button>
    </div>
  );
}

function SortHeader({
  label,
  field,
  filters,
}: {
  label: React.ReactNode;
  field: DocumentSortField;
  filters: DocumentFilters;
}) {
  const isActive = filters.sort === field;
  const nextDir = isActive && filters.dir === "asc" ? "desc" : "asc";
  const Icon = !isActive ? ArrowUpDown : filters.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Link
      href={`/documentos${documentFiltersToSearch({ ...filters, sort: field, dir: nextDir, page: 1 })}`}
      scroll={false}
      className={cn(
        "-mx-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-muted",
        isActive && "text-foreground",
      )}
      aria-label={`Ordenar por ${typeof label === "string" ? label.toLowerCase() : field}`}
    >
      {label}
      <Icon className={cn("size-3.5", !isActive && "opacity-40")} />
    </Link>
  );
}

export function DocumentsTable({ rows, filters }: { rows: DocumentListRow[]; filters: DocumentFilters }) {
  const table = useTable({ features, columns, data: rows, getRowId: (row) => row.id });

  return (
    <>
      {/* Escritorio: tabla */}
      <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-soft md:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-secondary-soft/50 hover:bg-secondary-soft/50">
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as { sortField?: DocumentSortField } | undefined;
                  const isSorted = meta?.sortField === filters.sort;
                  return (
                    <TableHead
                      key={header.id}
                      className="h-12 font-semibold first:pl-5 last:pr-5"
                      aria-sort={isSorted ? (filters.dir === "asc" ? "ascending" : "descending") : undefined}
                    >
                      {meta?.sortField ? (
                        <SortHeader
                          label={<table.FlexRender header={header} />}
                          field={meta.sortField}
                          filters={filters}
                        />
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
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

      {/* Móvil: tarjetas */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border bg-card p-4 shadow-soft">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <DocumentTypeBadge name={row.typeName} color={row.typeColor} />
              <DocumentStatusBadge status={row.status} />
            </div>
            <Link
              href={`/documentos/${row.id}`}
              className="block font-semibold underline-offset-4 hover:underline"
            >
              {row.title}
            </Link>
            <p className="mt-1 text-sm text-muted-foreground">
              Folio {row.folio} · {formatCalendarDate(row.documentDate)}
            </p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                <User className="size-3.5 shrink-0" />
                <span className="truncate">{row.authorName}</span>
              </span>
              <RowActions row={row} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
