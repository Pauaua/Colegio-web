import { describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import {
  buildDocumentWhere,
  can,
  canAccessPath,
  canDownloadDocument,
  canViewDocument,
  getRequiredAction,
  type Action,
  type DocumentForPermission,
  type PermissionUser,
} from "@/lib/permissions";

// ─── Fixtures ───────────────────────────────────────────────────────────

const users = {
  director: { id: "u-director", role: "DIRECTOR" },
  directivo: { id: "u-directivo", role: "EQUIPO_DIRECTIVO" },
  docente: { id: "u-docente", role: "DOCENTE" },
  apoderado: { id: "u-apoderado", role: "APODERADO" },
} satisfies Record<string, PermissionUser>;

type UserKey = keyof typeof users;
const USER_KEYS = Object.keys(users) as UserKey[];

const doc = (overrides: Partial<DocumentForPermission> = {}): DocumentForPermission => ({
  authorId: users.director.id,
  isDeleted: false,
  isCitation: false,
  visibility: [],
  recipientIds: [],
  ...overrides,
});

/** Un documento por cada tipo de visibilidad. */
const documents = {
  soloDirectivos: doc(),
  visibleDocentes: doc({ visibility: ["DOCENTE"] }),
  visibleApoderados: doc({ visibility: ["APODERADO"] }),
  visibleComunidad: doc({ visibility: ["DOCENTE", "APODERADO"] }),
  dirigidoAlDocente: doc({ recipientIds: [users.docente.id] }),
  dirigidoAlApoderado: doc({ recipientIds: [users.apoderado.id] }),
  dirigidoAOtroApoderado: doc({ recipientIds: ["u-otro-apoderado"] }),
  creadoPorElDocente: doc({ authorId: users.docente.id }),
  eliminado: doc({
    isDeleted: true,
    visibility: ["DOCENTE", "APODERADO"],
    recipientIds: [users.docente.id, users.apoderado.id],
  }),
} satisfies Record<string, DocumentForPermission>;

type DocKey = keyof typeof documents;
const DOC_KEYS = Object.keys(documents) as DocKey[];

/** Matriz esperada de visibilidad: rol × tipo de documento. */
const EXPECTED_VISIBILITY: Record<UserKey, Record<DocKey, boolean>> = {
  director: {
    soloDirectivos: true,
    visibleDocentes: true,
    visibleApoderados: true,
    visibleComunidad: true,
    dirigidoAlDocente: true,
    dirigidoAlApoderado: true,
    dirigidoAOtroApoderado: true,
    creadoPorElDocente: true,
    eliminado: false,
  },
  directivo: {
    soloDirectivos: true,
    visibleDocentes: true,
    visibleApoderados: true,
    visibleComunidad: true,
    dirigidoAlDocente: true,
    dirigidoAlApoderado: true,
    dirigidoAOtroApoderado: true,
    creadoPorElDocente: true,
    eliminado: false,
  },
  docente: {
    soloDirectivos: false,
    visibleDocentes: true,
    visibleApoderados: false,
    visibleComunidad: true,
    dirigidoAlDocente: true,
    dirigidoAlApoderado: false,
    dirigidoAOtroApoderado: false,
    creadoPorElDocente: true,
    eliminado: false,
  },
  apoderado: {
    soloDirectivos: false,
    visibleDocentes: false,
    visibleApoderados: true,
    visibleComunidad: true,
    dirigidoAlDocente: false,
    dirigidoAlApoderado: true,
    dirigidoAOtroApoderado: false,
    creadoPorElDocente: false,
    eliminado: false,
  },
};

/**
 * Evalúa en memoria el filtro que produce buildDocumentWhere, para comprobar
 * que la consulta de Prisma y canViewDocument aplican exactamente la misma regla.
 * Solo soporta las formas que buildDocumentWhere genera; cualquier otra falla el test.
 */
function matchesWhere(where: Prisma.DocumentWhereInput, d: DocumentForPermission): boolean {
  const known = new Set(["isDeleted", "OR"]);
  for (const key of Object.keys(where)) {
    if (!known.has(key)) throw new Error(`Filtro no soportado por el test: ${key}`);
  }
  if (where.isDeleted !== undefined && where.isDeleted !== d.isDeleted) return false;
  if (where.OR) {
    return where.OR.some((clause) => {
      const role = clause.visibility?.some?.role;
      if (role) return d.visibility.includes(role as Role);
      const userId = clause.recipients?.some?.userId;
      if (userId) return d.recipientIds.includes(userId as string);
      if (typeof clause.authorId === "string") return d.authorId === clause.authorId;
      throw new Error(`Cláusula OR no soportada: ${JSON.stringify(clause)}`);
    });
  }
  return true;
}

// ─── Visibilidad ────────────────────────────────────────────────────────

describe("canViewDocument: cada rol contra cada tipo de visibilidad", () => {
  for (const userKey of USER_KEYS) {
    describe(users[userKey].role, () => {
      for (const docKey of DOC_KEYS) {
        const expected = EXPECTED_VISIBILITY[userKey][docKey];
        it(`${expected ? "ve" : "NO ve"} un documento ${docKey}`, () => {
          expect(canViewDocument(users[userKey], documents[docKey])).toBe(expected);
        });
      }
    });
  }
});

describe("canDownloadDocument", () => {
  it("exige lo mismo que la visualización", () => {
    for (const userKey of USER_KEYS) {
      for (const docKey of DOC_KEYS) {
        expect(canDownloadDocument(users[userKey], documents[docKey])).toBe(
          EXPECTED_VISIBILITY[userKey][docKey],
        );
      }
    }
  });

  it("un apoderado no descarga la citación dirigida a otro apoderado", () => {
    expect(canDownloadDocument(users.apoderado, documents.dirigidoAOtroApoderado)).toBe(false);
  });
});

describe("buildDocumentWhere", () => {
  it("los directivos ven todos los documentos no eliminados", () => {
    for (const key of ["director", "directivo"] as const) {
      expect(buildDocumentWhere(users[key])).toEqual({ isDeleted: false });
    }
  });

  it("docente: visibles para su rol, dirigidos a él o creados por él, nunca eliminados", () => {
    expect(buildDocumentWhere(users.docente)).toEqual({
      isDeleted: false,
      OR: [
        { visibility: { some: { role: "DOCENTE" } } },
        { recipients: { some: { userId: "u-docente" } } },
        { authorId: "u-docente" },
      ],
    });
  });

  it("apoderado: filtra por su propio rol e id (no por los de otro usuario)", () => {
    const where = buildDocumentWhere(users.apoderado);
    expect(JSON.stringify(where)).toContain('"role":"APODERADO"');
    expect(JSON.stringify(where)).toContain('"userId":"u-apoderado"');
    expect(JSON.stringify(where)).not.toContain("DOCENTE");
  });

  describe("coincide con canViewDocument en toda la matriz", () => {
    for (const userKey of USER_KEYS) {
      it(users[userKey].role, () => {
        const where = buildDocumentWhere(users[userKey]);
        for (const docKey of DOC_KEYS) {
          expect(matchesWhere(where, documents[docKey]), docKey).toBe(EXPECTED_VISIBILITY[userKey][docKey]);
        }
      });
    }
  });
});

// ─── Acciones por rol (tabla de la especificación) ──────────────────────

const EXPECTED_ACTIONS: Record<Action, UserKey[]> = {
  "document:create": ["director", "directivo"],
  "document:update": ["director", "directivo"],
  "document:archive": ["director", "directivo"],
  "document:delete": ["director", "directivo"],
  "document:viewAll": ["director", "directivo"],
  "document:viewActivity": ["director", "directivo", "docente"],
  "document:inbox": ["docente", "apoderado"],
  "document:acknowledge": ["docente", "apoderado"],
  "citation:create": ["director", "directivo", "docente"],
  "citation:viewSent": ["director", "directivo", "docente"],
  "citation:respond": ["apoderado"],
  "user:manage": ["director", "directivo"],
  "course:manage": ["director", "directivo"],
  "audit:view": ["director", "directivo"],
  "dashboard:viewStats": ["director", "directivo"],
};

describe("can(): permisos de rol sin recurso", () => {
  for (const [action, allowed] of Object.entries(EXPECTED_ACTIONS) as [Action, UserKey[]][]) {
    for (const userKey of USER_KEYS) {
      const expected = allowed.includes(userKey);
      it(`${users[userKey].role} ${expected ? "puede" : "NO puede"} ${action}`, () => {
        expect(can(users[userKey], action)).toBe(expected);
      });
    }
  }
});

describe("can(): reglas sobre un documento concreto", () => {
  const ownDoc = doc({ authorId: users.directivo.id });
  const othersDoc = doc({ authorId: users.director.id });

  it("director y equipo directivo editan, archivan y eliminan documentos de cualquier autor", () => {
    for (const key of ["director", "directivo"] as const) {
      for (const action of ["document:update", "document:archive", "document:delete"] as const) {
        expect(can(users[key], action, ownDoc), `${key} ${action} propio`).toBe(true);
        expect(can(users[key], action, othersDoc), `${key} ${action} ajeno`).toBe(true);
      }
    }
  });

  it("el docente ve la actividad solo de las citaciones que él creó", () => {
    const ownCitation = doc({ authorId: users.docente.id, isCitation: true });
    const othersCitation = doc({ authorId: users.director.id, isCitation: true });
    expect(can(users.docente, "document:viewActivity", ownCitation)).toBe(true);
    expect(can(users.docente, "document:viewActivity", othersCitation)).toBe(false);
    expect(can(users.directivo, "document:viewActivity", othersCitation)).toBe(true);
  });

  it("solo el apoderado destinatario responde, y solo si es una citación", () => {
    const citation = doc({ isCitation: true, recipientIds: [users.apoderado.id] });
    expect(can(users.apoderado, "citation:respond", citation)).toBe(true);
    expect(can(users.apoderado, "citation:respond", documents.dirigidoAlApoderado)).toBe(false);
    expect(
      can(users.apoderado, "citation:respond", doc({ isCitation: true, recipientIds: ["u-otro-apoderado"] })),
    ).toBe(false);
    expect(
      can(users.docente, "citation:respond", doc({ isCitation: true, recipientIds: [users.docente.id] })),
    ).toBe(false);
  });

  it("nadie edita, archiva ni elimina un documento ya eliminado", () => {
    const deleted = doc({ isDeleted: true, authorId: users.directivo.id });
    for (const action of ["document:update", "document:archive", "document:delete"] as const) {
      for (const userKey of USER_KEYS) {
        expect(can(users[userKey], action, deleted), `${userKey} ${action}`).toBe(false);
      }
    }
  });

  it("docentes y apoderados no editan aunque el documento les sea visible", () => {
    expect(can(users.docente, "document:update", documents.visibleComunidad)).toBe(false);
    expect(can(users.apoderado, "document:update", documents.visibleComunidad)).toBe(false);
  });

  it("solo el destinatario confirma la lectura", () => {
    expect(can(users.docente, "document:acknowledge", documents.dirigidoAlDocente)).toBe(true);
    expect(can(users.apoderado, "document:acknowledge", documents.dirigidoAlApoderado)).toBe(true);
    expect(can(users.docente, "document:acknowledge", documents.visibleDocentes)).toBe(false);
    expect(can(users.apoderado, "document:acknowledge", documents.dirigidoAlDocente)).toBe(false);
    expect(can(users.apoderado, "document:acknowledge", documents.dirigidoAOtroApoderado)).toBe(false);
    expect(can(users.director, "document:acknowledge", documents.dirigidoAlDocente)).toBe(false);
  });
});

// ─── Rutas ──────────────────────────────────────────────────────────────

const ROUTES: Record<string, UserKey[]> = {
  "/": USER_KEYS,
  "/documentos": USER_KEYS,
  "/documentos/abc123": USER_KEYS,
  "/perfil": USER_KEYS,
  "/documentos/nuevo": ["director", "directivo"],
  "/documentos/abc123/editar": ["director", "directivo"],
  "/citaciones": ["director", "directivo", "docente"],
  "/citaciones/nueva": ["director", "directivo", "docente"],
  "/mis-documentos": ["docente", "apoderado"],
  "/usuarios": ["director", "directivo"],
  "/usuarios/xyz": ["director", "directivo"],
  "/cursos": ["director", "directivo"],
  "/auditoria": ["director", "directivo"],
};

describe("canAccessPath", () => {
  for (const [path, allowed] of Object.entries(ROUTES)) {
    for (const userKey of USER_KEYS) {
      const expected = allowed.includes(userKey);
      it(`${users[userKey].role} ${expected ? "entra a" : "NO entra a"} ${path}`, () => {
        expect(canAccessPath(users[userKey], path)).toBe(expected);
      });
    }
  }

  it("no confunde prefijos parecidos", () => {
    expect(getRequiredAction("/usuarios-exportados")).toBeNull();
    expect(getRequiredAction("/documentos/nuevo-formato")).toBeNull();
    expect(getRequiredAction("/documentos/nuevo/")).toBe("document:create");
  });
});
