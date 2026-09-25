import { describe, expect, it } from "vitest";

import { parseDocumentFilters } from "@/lib/document-filters";
import { buildFileKey, extensionMatchesMime, matchesMagicBytes, slugify } from "@/lib/files";
import { createDocumentSchema, fileMetaSchema } from "@/lib/validations/document";
import { changePasswordSchema, createUserSchema, updateUserSchema } from "@/lib/validations/user";
import { FILE_KEY_PATTERN } from "@/lib/storage";

describe("archivos", () => {
  it("genera claves documents/{year}/{uuid}-{slug}.{ext} válidas", () => {
    const key = buildFileKey(
      "Acta Consejo Escolar (marzo).PDF",
      "0f8fad5b-d9cb-469f-a165-70867728950e",
      2026,
    );
    expect(key).toBe("documents/2026/0f8fad5b-d9cb-469f-a165-70867728950e-acta-consejo-escolar-marzo.pdf");
    expect(FILE_KEY_PATTERN.test(key)).toBe(true);
  });

  it("la clave nunca permite path traversal", () => {
    const key = buildFileKey("../../etc/passwd.pdf", "0f8fad5b-d9cb-469f-a165-70867728950e", 2026);
    expect(key).not.toContain("..");
    expect(FILE_KEY_PATTERN.test("documents/2026/../../x.pdf")).toBe(false);
  });

  it("slugify quita tildes y símbolos", () => {
    expect(slugify("Citación N°3 — Reunión")).toBe("citacion-n-3-reunion");
  });

  it("extensión y tipo deben coincidir", () => {
    expect(extensionMatchesMime("a.pdf", "application/pdf")).toBe(true);
    expect(extensionMatchesMime("a.png", "application/pdf")).toBe(false);
    expect(extensionMatchesMime("foto.JPEG", "image/jpeg")).toBe(true);
  });

  it("reconoce la firma binaria real del archivo", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(matchesMagicBytes(pdf, "application/pdf")).toBe(true);
    expect(matchesMagicBytes(png, "application/pdf")).toBe(false);
    expect(matchesMagicBytes(png, "image/png")).toBe(true);
  });

  it("valida tipo y tamaño máximo de 10 MB", () => {
    const base = { fileName: "a.pdf", mimeType: "application/pdf" };
    expect(fileMetaSchema.safeParse({ ...base, fileSize: 10 * 1024 * 1024 }).success).toBe(true);
    expect(fileMetaSchema.safeParse({ ...base, fileSize: 10 * 1024 * 1024 + 1 }).success).toBe(false);
    expect(fileMetaSchema.safeParse({ ...base, fileSize: 0 }).success).toBe(false);
    expect(
      fileMetaSchema.safeParse({ fileName: "a.exe", mimeType: "application/x-msdownload", fileSize: 1 })
        .success,
    ).toBe(false);
  });
});

describe("esquema de documento", () => {
  const valid = {
    title: "Citación",
    documentTypeId: "t1",
    documentDate: "2026-09-24",
    folioNumber: 3,
    description: "",
    visibility: [],
    recipientIds: [],
    courseIds: [],
    requiresAcknowledgement: false,
    fileKey: "documents/2026/0f8fad5b-d9cb-469f-a165-70867728950e-a.pdf",
    fileName: "a.pdf",
    mimeType: "application/pdf",
    fileSize: 100,
  };

  it("acepta un documento válido", () => {
    expect(createDocumentSchema.safeParse(valid).success).toBe(true);
  });

  it("el acuse de recibo exige destinatarios o un curso", () => {
    expect(createDocumentSchema.safeParse({ ...valid, requiresAcknowledgement: true }).success).toBe(false);
    expect(
      createDocumentSchema.safeParse({ ...valid, requiresAcknowledgement: true, courseIds: ["c1"] }).success,
    ).toBe(true);
  });

  it("no permite dar visibilidad a roles directivos (ya ven todo) ni roles inventados", () => {
    expect(createDocumentSchema.safeParse({ ...valid, visibility: ["DIRECTOR"] }).success).toBe(false);
    expect(createDocumentSchema.safeParse({ ...valid, visibility: ["ADMIN"] }).success).toBe(false);
  });
});

describe("filtros del listado", () => {
  it("usa valores por defecto seguros ante parámetros inválidos", () => {
    const filters = parseDocumentFilters({
      sort: "DROP TABLE",
      dir: "sideways",
      page: "-4",
      status: "BORRADO",
    });
    expect(filters).toMatchObject({ sort: "date", dir: "desc", page: 1, status: undefined });
  });

  it("ignora fechas mal formadas", () => {
    expect(parseDocumentFilters({ from: "24/09/2026", to: "2026-09-30" })).toMatchObject({
      from: undefined,
      to: "2026-09-30",
    });
  });
});

describe("usuarios", () => {
  const user = {
    fullName: "Ana Pérez",
    rut: "12.345.678-5",
    email: "ana@colegio.cl",
    role: "DOCENTE",
    phone: "",
    password: "Clave2026",
  };

  it("valida RUT con dígito verificador", () => {
    expect(createUserSchema.safeParse(user).success).toBe(true);
    expect(createUserSchema.safeParse({ ...user, rut: "12.345.678-9" }).success).toBe(false);
  });

  it("exige contraseña con letras y números al crear", () => {
    expect(createUserSchema.safeParse({ ...user, password: "12345678" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...user, password: "corta1" }).success).toBe(false);
  });

  it("al editar, la contraseña vacía significa no cambiarla", () => {
    expect(updateUserSchema.safeParse({ ...user, password: "" }).success).toBe(true);
    expect(updateUserSchema.safeParse({ ...user, password: "abc" }).success).toBe(false);
  });

  it("el cambio de contraseña exige confirmación y una clave distinta", () => {
    const base = {
      currentPassword: "Colegio2026!",
      newPassword: "NuevaClave1",
      confirmPassword: "NuevaClave1",
    };
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...base, confirmPassword: "Otra1234" }).success).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        ...base,
        newPassword: "Colegio2026!",
        confirmPassword: "Colegio2026!",
      }).success,
    ).toBe(false);
  });
});
