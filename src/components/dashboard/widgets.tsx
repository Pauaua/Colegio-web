import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { DocumentStatusBadge, DocumentTypeBadge } from "@/components/documents/badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCalendarDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "primary",
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint?: string;
  tone?: "primary" | "secondary" | "success" | "warning";
  href?: string;
}) {
  const content = (
    <Card
      className={cn("h-full rounded-2xl shadow-soft", href && "transition-colors hover:bg-primary-soft/40")}
    >
      <CardContent className="flex items-start gap-4 p-5">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl",
            tone === "primary" && "bg-primary-soft",
            tone === "secondary" && "bg-secondary-soft",
            tone === "success" && "bg-success text-success-foreground",
            tone === "warning" && "bg-warning text-warning-foreground",
          )}
        >
          <Icon className="size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold tabular-nums">{value.toLocaleString("es-CL")}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link
      href={href}
      className="rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {content}
    </Link>
  ) : (
    content
  );
}

export type MiniDocument = {
  id: string;
  title: string;
  folioNumber: number;
  folioYear: number;
  documentDate: Date;
  status: "VIGENTE" | "ARCHIVADO";
  documentType: { name: string; color: string };
  author: { fullName: string };
};

export function DocumentMiniList({
  documents,
  empty,
  trailing,
}: {
  documents: MiniDocument[];
  empty: string;
  trailing?: (doc: MiniDocument) => React.ReactNode;
}) {
  if (documents.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="divide-y">
      {documents.map((doc) => (
        <li key={doc.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1 space-y-1">
            <Link
              href={`/documentos/${doc.id}`}
              className="block truncate font-semibold underline-offset-4 hover:underline"
            >
              {doc.title}
            </Link>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <DocumentTypeBadge name={doc.documentType.name} color={doc.documentType.color} />
              <span>{formatCalendarDate(doc.documentDate)}</span>
              <span>·</span>
              <span className="truncate">{doc.author.fullName}</span>
              {doc.status === "ARCHIVADO" && <DocumentStatusBadge status={doc.status} />}
            </div>
          </div>
          {trailing?.(doc)}
        </li>
      ))}
    </ul>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("rounded-2xl shadow-soft", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Tabla con los datos del gráfico: el mismo contenido sin depender del color ni del hover. */
export function ChartDataTable({
  rows,
  header,
}: {
  rows: { label: string; count: number }[];
  header: string;
}) {
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver como tabla</summary>
      <table className="mt-3 w-full">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1.5 font-medium">{header}</th>
            <th className="py-1.5 text-right font-medium">Documentos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b last:border-0">
              <td className="py-1.5 capitalize">{row.label}</td>
              <td className="py-1.5 text-right tabular-nums">{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
