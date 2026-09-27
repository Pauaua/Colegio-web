import { describe, expect, it } from "vitest";

import { buildCitationPdf, type CitationPdfData } from "@/server/documents/citation-pdf";

const base: CitationPdfData = {
  folioNumber: 3,
  folioYear: 2026,
  title: "Entrevista con apoderados",
  description: "Revisaremos el avance del semestre.",
  // 14:30 en Chile (UTC-3 en octubre de 2026).
  citationAt: new Date("2026-10-15T17:30:00Z"),
  citationPlace: "Sala de profesores",
  authorName: "Paula Contreras Díaz",
};

const text = (pdf: Buffer) => pdf.toString("latin1");

describe("buildCitationPdf", () => {
  it("incluye folio, título, descripción, lugar y hora de Chile", () => {
    const { pdf, fileName } = buildCitationPdf(base);
    expect(fileName).toBe("citacion-3-2026.pdf");
    expect(text(pdf)).toContain("Citaci\\363n N\\260 3/2026");
    expect(text(pdf)).toContain("Entrevista con apoderados");
    expect(text(pdf)).toContain("Revisaremos el avance");
    expect(text(pdf)).toContain("Lugar: Sala de profesores");
    expect(text(pdf)).toContain("a las 14:30 h");
  });

  it("al editar, el PDF nuevo refleja el texto nuevo y no el anterior", () => {
    const edited = buildCitationPdf({
      ...base,
      title: "Reunion reprogramada",
      description: "Texto corregido.",
    });
    expect(text(edited.pdf)).toContain("Reunion reprogramada");
    expect(text(edited.pdf)).toContain("Texto corregido.");
    expect(text(edited.pdf)).not.toContain("Entrevista con apoderados");
    expect(text(edited.pdf)).not.toContain("Revisaremos el avance");
  });

  it("cada versión usa una clave de archivo distinta", () => {
    expect(buildCitationPdf(base).fileKey).not.toBe(buildCitationPdf(base).fileKey);
  });

  it("acepta una citación sin descripción", () => {
    expect(text(buildCitationPdf({ ...base, description: null }).pdf)).not.toContain("null");
  });
});
