import "server-only";

import type { AuditAction } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type AuditEntry = {
  userId: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/** Registra una acción en AuditLog. Acepta un cliente de transacción opcional. */
export async function logAudit(entry: AuditEntry, db: Prisma.TransactionClient = prisma) {
  await db.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata,
    },
  });
}
