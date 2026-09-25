import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { CITATION_TYPE_CODE } from "@/lib/citations";
import { isManagement } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/session";

export type CitationTab = "proximas" | "pasadas";

/** Citaciones enviadas: todas para directivos, solo las propias para docentes. */
export async function listSentCitations(user: CurrentUser, tab: CitationTab) {
  const now = new Date();
  const base: Prisma.DocumentWhereInput = {
    isDeleted: false,
    documentType: { code: CITATION_TYPE_CODE },
    ...(isManagement(user.role) ? {} : { authorId: user.id }),
  };
  // Citaciones antiguas (sin fecha de reunión) cuentan como pasadas.
  const upcoming: Prisma.DocumentWhereInput = { ...base, citationAt: { gte: now } };
  const past: Prisma.DocumentWhereInput = {
    ...base,
    OR: [{ citationAt: { lt: now } }, { citationAt: null }],
  };

  const [citations, upcomingCount, pastCount] = await Promise.all([
    prisma.document.findMany({
      where: tab === "proximas" ? upcoming : past,
      orderBy:
        tab === "proximas"
          ? [{ citationAt: "asc" }]
          : [{ citationAt: { sort: "desc", nulls: "last" } }, { documentDate: "desc" }],
      take: 50,
      select: {
        id: true,
        title: true,
        folioNumber: true,
        folioYear: true,
        documentDate: true,
        citationAt: true,
        citationPlace: true,
        status: true,
        author: { select: { fullName: true } },
        courses: { select: { course: { select: { name: true } } } },
        recipients: {
          orderBy: { user: { fullName: "asc" } },
          select: {
            response: true,
            responseComment: true,
            respondedAt: true,
            acknowledgedAt: true,
            user: { select: { id: true, fullName: true } },
          },
        },
      },
    }),
    prisma.document.count({ where: upcoming }),
    prisma.document.count({ where: past }),
  ]);

  return {
    citations: citations.map((c) => ({
      ...c,
      summary: {
        total: c.recipients.length,
        accepted: c.recipients.filter((r) => r.response === "ACEPTADA").length,
        rejected: c.recipients.filter((r) => r.response === "RECHAZADA").length,
        reschedule: c.recipients.filter((r) => r.response === "REPROGRAMAR").length,
        pending: c.recipients.filter((r) => !r.response).length,
      },
    })),
    counts: { proximas: upcomingCount, pasadas: pastCount },
  };
}
