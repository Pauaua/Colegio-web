import { z } from "zod";

/** Filtros, orden y paginación del listado, leídos desde searchParams. */

export const DOCUMENT_SORT_FIELDS = ["title", "type", "folio", "date", "author", "status"] as const;
export type DocumentSortField = (typeof DOCUMENT_SORT_FIELDS)[number];

export const DOCUMENTS_PAGE_SIZE = 10;

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);
const optionalString = (max: number) =>
  z.preprocess((v) => {
    const value = firstValue(v);
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  }, z.string().max(max).optional());

const isoDate = z.preprocess((v) => {
  const value = firstValue(v);
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}, z.string().optional());

export const documentFiltersSchema = z.object({
  q: optionalString(100),
  type: optionalString(64),
  author: optionalString(64),
  status: z.preprocess(firstValue, z.enum(["VIGENTE", "ARCHIVADO"]).optional().catch(undefined)),
  from: isoDate,
  to: isoDate,
  sort: z.preprocess(firstValue, z.enum(DOCUMENT_SORT_FIELDS).catch("date")),
  dir: z.preprocess(firstValue, z.enum(["asc", "desc"]).catch("desc")),
  page: z.preprocess(firstValue, z.coerce.number().int().min(1).max(10_000).catch(1)),
});

export type DocumentFilters = z.infer<typeof documentFiltersSchema>;

export function parseDocumentFilters(searchParams: Record<string, string | string[] | undefined>) {
  return documentFiltersSchema.parse(searchParams);
}

/** Construye la query string, omitiendo los valores por defecto. */
export function documentFiltersToSearch(filters: Partial<DocumentFilters>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "sort" && value === "date") continue;
    if (key === "dir" && value === "desc") continue;
    if (key === "page" && value === 1) continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

export function hasActiveFilters(filters: DocumentFilters) {
  return Boolean(filters.q || filters.type || filters.author || filters.status || filters.from || filters.to);
}
