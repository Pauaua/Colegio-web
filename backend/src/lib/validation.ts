import { Role } from '@prisma/client';
import { z } from 'zod';
import { isValidRut, normalizeRut } from './rut';

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

/** Fecha AAAA-MM-DD interpretada como fecha calendario (medianoche UTC, igual que la columna DATE). */
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD')
  .transform((v, ctx) => {
    const d = new Date(`${v}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
      ctx.addIssue({ code: 'custom', message: 'Fecha inválida' });
      return z.NEVER;
    }
    return d;
  });

export const rutSchema = z
  .string()
  .trim()
  .refine(isValidRut, 'RUT inválido (revise el dígito verificador)')
  .transform(normalizeRut);

export const roleSchema = z.enum(Role);

export const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'La contraseña no puede superar 72 caracteres')
  .regex(/[A-Za-z]/, 'La contraseña debe incluir letras')
  .regex(/\d/, 'La contraseña debe incluir números');

export const idList = z.array(z.coerce.number().int().positive()).max(500);
