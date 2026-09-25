import type { Role } from '@prisma/client';
import { buildDocumentWhere, can, type AuthUser } from '../src/lib/permissions';

const user = (role: Role, id = 1): AuthUser => ({ id, role, username: 'u', fullName: 'U' });

describe('can()', () => {
  it.each<[Role, boolean]>([
    ['DIRECTOR', true],
    ['SOSTENEDOR', true],
    ['EQUIPO_DIRECTIVO', true],
    ['DOCENTE', false],
    ['APODERADO', false],
  ])('%s puede subir documentos: %s', (role, expected) => {
    expect(can(user(role), 'document:create')).toBe(expected);
    expect(can(user(role), 'audit:view')).toBe(expected);
    expect(can(user(role), 'mfa:use')).toBe(expected);
  });

  it('EQUIPO_DIRECTIVO edita y archiva solo sus propios documentos', () => {
    const equipo = user('EQUIPO_DIRECTIVO', 7);
    expect(can(equipo, 'document:update', { authorId: 7 })).toBe(true);
    expect(can(equipo, 'document:update', { authorId: 8 })).toBe(false);
    expect(can(equipo, 'document:archive', { authorId: 8 })).toBe(false);
    expect(can(equipo, 'document:update')).toBe(false);
  });

  it('director y sostenedor editan cualquier documento', () => {
    expect(can(user('DIRECTOR'), 'document:update', { authorId: 99 })).toBe(true);
    expect(can(user('SOSTENEDOR'), 'document:archive', { authorId: 99 })).toBe(true);
  });

  it('solo director y sostenedor eliminan y administran usuarios', () => {
    for (const role of ['DIRECTOR', 'SOSTENEDOR'] as Role[]) {
      expect(can(user(role), 'document:delete')).toBe(true);
      expect(can(user(role), 'users:manage')).toBe(true);
    }
    for (const role of ['EQUIPO_DIRECTIVO', 'DOCENTE', 'APODERADO'] as Role[]) {
      expect(can(user(role), 'document:delete')).toBe(false);
      expect(can(user(role), 'users:manage')).toBe(false);
    }
  });

  it('solo docentes y apoderados confirman lectura', () => {
    expect(can(user('DOCENTE'), 'document:acknowledge')).toBe(true);
    expect(can(user('APODERADO'), 'document:acknowledge')).toBe(true);
    expect(can(user('DIRECTOR'), 'document:acknowledge')).toBe(false);
  });
});

describe('buildDocumentWhere()', () => {
  it('los directivos ven todo lo no eliminado', () => {
    expect(buildDocumentWhere(user('EQUIPO_DIRECTIVO'))).toEqual({ isDeleted: false });
  });

  it('el docente ve por rol o como destinatario, sin cursos', () => {
    const where = buildDocumentWhere(user('DOCENTE', 5));
    expect(where.isDeleted).toBe(false);
    expect(where.OR).toEqual([
      { visibilities: { some: { role: 'DOCENTE' } } },
      { recipients: { some: { userId: 5 } } },
    ]);
  });

  it('el apoderado además ve lo dirigido a los cursos de sus pupilos', () => {
    const where = buildDocumentWhere(user('APODERADO', 9));
    expect(where.OR).toHaveLength(3);
    expect(JSON.stringify(where.OR?.[2])).toContain('"guardianId":9');
  });
});
