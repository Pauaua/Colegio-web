/**
 * Generador mínimo de PDFs de una página (sin dependencias) para los archivos de muestra.
 * Usa Helvetica con WinAnsiEncoding, suficiente para el español.
 */

// Caracteres fuera de Latin-1 que WinAnsiEncoding sí incluye.
const WIN_ANSI_EXTRAS: Record<string, number> = {
  "—": 151,
  "–": 150,
  "“": 147,
  "”": 148,
  "‘": 145,
  "’": 146,
  "…": 133,
  "•": 149,
  "€": 128,
};

function escapePdfText(text: string): string {
  let out = "";
  for (const char of text) {
    const code = WIN_ANSI_EXTRAS[char] ?? char.charCodeAt(0);
    if (char === "(" || char === ")" || char === "\\") out += `\\${char}`;
    else if (code < 128) out += char;
    else if (code < 256) out += `\\${code.toString(8).padStart(3, "0")}`;
    else out += "?";
  }
  return out;
}

function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if ((current + " " + word).trim().length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function buildSamplePdf(opts: {
  heading: string;
  title: string;
  meta: string[];
  body: string;
}): Buffer {
  const ops: string[] = ["BT", "/F2 11 Tf", "72 770 Td", `(${escapePdfText(opts.heading)}) Tj`, "ET"];
  let y = 730;
  for (const line of wrap(opts.title, 60)) {
    ops.push("BT", "/F2 16 Tf", `72 ${y} Td`, `(${escapePdfText(line)}) Tj`, "ET");
    y -= 22;
  }
  y -= 8;
  for (const line of opts.meta) {
    ops.push("BT", "/F1 10 Tf", `72 ${y} Td`, `(${escapePdfText(line)}) Tj`, "ET");
    y -= 15;
  }
  y -= 15;
  for (const line of wrap(opts.body, 90)) {
    ops.push("BT", "/F1 11 Tf", `72 ${y} Td`, `(${escapePdfText(line)}) Tj`, "ET");
    y -= 16;
  }
  const content = Buffer.from(ops.join("\n"), "latin1");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  const offsets: number[] = [];
  let length = chunks[0].length;
  const push = (buf: Buffer) => {
    chunks.push(buf);
    length += buf.length;
  };

  objects.forEach((obj, i) => {
    offsets.push(length);
    push(Buffer.from(`${i + 1} 0 obj\n${obj}\nendobj\n`, "latin1"));
  });
  offsets.push(length);
  push(Buffer.from(`6 0 obj\n<< /Length ${content.length} >>\nstream\n`, "latin1"));
  push(content);
  push(Buffer.from("\nendstream\nendobj\n", "latin1"));

  const xrefStart = length;
  const xref = [
    "xref",
    `0 ${offsets.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${offsets.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefStart),
    "%%EOF",
  ].join("\n");
  push(Buffer.from(xref, "latin1"));

  return Buffer.concat(chunks);
}
