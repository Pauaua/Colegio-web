import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { logger } from './logger';

export interface AuditEntry {
  userId?: number | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  metadata?: Prisma.InputJsonValue;
}

/** Registra una acción en AuditLog. Un fallo de auditoría nunca interrumpe la operación principal. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId != null ? String(entry.entityId) : null,
        metadata: entry.metadata,
      },
    });
  } catch (err) {
    logger.error({ err, action: entry.action }, 'No se pudo registrar la auditoría');
  }
}
