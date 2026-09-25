import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/** Paginación con enlaces (funciona sin JavaScript y conserva los demás parámetros). */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  hrefForPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  hrefForPage: (page: number) => string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Paginación"
      className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <p className="text-sm text-muted-foreground">
        Mostrando <span className="font-semibold text-foreground">{from}</span>–
        <span className="font-semibold text-foreground">{to}</span> de{" "}
        <span className="font-semibold text-foreground">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefForPage(page - 1)} scroll={false}>
              <ChevronLeft /> Anterior
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft /> Anterior
          </Button>
        )}
        <span className="px-2 text-sm tabular-nums">
          {page} / {pageCount}
        </span>
        {page < pageCount ? (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefForPage(page + 1)} scroll={false}>
              Siguiente <ChevronRight />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Siguiente <ChevronRight />
          </Button>
        )}
      </div>
    </nav>
  );
}
