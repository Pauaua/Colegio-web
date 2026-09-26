/**
 * Seed de desarrollo. ⚠️ BORRA todos los datos antes de insertar.
 * Ejecutar con: npm run db:seed
 */
import "dotenv/config";

import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient, type Role } from "../src/generated/prisma/client";
import { slugify } from "../src/lib/files";
import { computeRutVerifier } from "../src/lib/rut";
import { deleteFile, getStorageDriverName, putFile } from "../src/lib/storage";

import { buildSimplePdf } from "../src/lib/pdf";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL! }),
});

export const SEED_PASSWORD = "Colegio2026!";
const YEAR = 2026;

const rut = (body: number) => `${body}-${computeRutVerifier(String(body))}`;

/** Fecha de calendario a medianoche UTC (columna @db.Date). */
const day = (month: number, date: number) => new Date(Date.UTC(YEAR, month - 1, date));
/** Momento de carga: ese día a las 10:30 hora de Chile (≈ 13:30 UTC). */
const uploadedAt = (month: number, date: number) => new Date(Date.UTC(YEAR, month - 1, date, 13, 30));

const DOCUMENT_TYPES = [
  { code: "MEMO", name: "Memo", color: "#B9C9E6" },
  { code: "OFICIO", name: "Oficio", color: "#D9CDEA" },
  { code: "CITACION", name: "Citación", color: "#F2C7D0" },
  { code: "ACUERDO", name: "Acuerdo", color: "#C4E3D2" },
  { code: "ACTA", name: "Acta", color: "#ECD9A6" },
  { code: "PERMISO", name: "Permiso administrativo", color: "#BFE0EC" },
] as const;

type TypeCode = (typeof DOCUMENT_TYPES)[number]["code"];

const USERS = [
  {
    key: "director",
    fullName: "Carolina Muñoz Soto",
    email: "director@colegio.cl",
    role: "DIRECTOR",
    rutBody: 12345678,
  },
  {
    key: "directivo",
    fullName: "Paula Contreras Díaz",
    email: "directivo@colegio.cl",
    role: "EQUIPO_DIRECTIVO",
    rutBody: 15234876,
  },
  {
    key: "docente",
    fullName: "Andrés Fuentes Pérez",
    email: "docente@colegio.cl",
    role: "DOCENTE",
    rutBody: 16789234,
  },
  {
    key: "apoderado",
    fullName: "María José Herrera",
    email: "apoderado@colegio.cl",
    role: "APODERADO",
    rutBody: 13567890,
  },
  {
    key: "apoderado2",
    fullName: "Pedro Sepúlveda Lagos",
    email: "apoderado2@colegio.cl",
    role: "APODERADO",
    rutBody: 14678901,
  },
] as const satisfies readonly { key: string; fullName: string; email: string; role: Role; rutBody: number }[];

type UserKey = (typeof USERS)[number]["key"];

type SeedDocument = {
  title: string;
  type: TypeCode;
  date: [month: number, day: number];
  author: UserKey;
  description: string;
  visibleTo?: Role[];
  recipients?: UserKey[];
  acknowledgedBy?: UserKey[];
  course?: "3B" | "1M";
  requiresAck?: boolean;
  archived?: boolean;
};

const DOCUMENTS: SeedDocument[] = [
  {
    title: "Calendario de evaluaciones del primer semestre",
    type: "MEMO",
    date: [3, 9],
    author: "directivo",
    visibleTo: ["DOCENTE"],
    description: "Fechas de pruebas y entrega de notas por nivel.",
  },
  {
    title: "Acta de Consejo Escolar de marzo",
    type: "ACTA",
    date: [3, 27],
    author: "director",
    visibleTo: ["DOCENTE", "APODERADO"],
    description: "Primera sesión ordinaria del Consejo Escolar.",
  },
  {
    title: "Oficio a la Superintendencia de Educación",
    type: "OFICIO",
    date: [4, 3],
    author: "director",
    description: "Respuesta a solicitud de antecedentes de matrícula.",
  },
  {
    title: "Acuerdo del Consejo Escolar sobre uso del uniforme",
    type: "ACUERDO",
    date: [4, 10],
    author: "director",
    visibleTo: ["DOCENTE", "APODERADO"],
    description: "Flexibilización del uniforme en días de frío.",
  },
  {
    title: "Acta de consejo de profesores de abril",
    type: "ACTA",
    date: [4, 24],
    author: "directivo",
    visibleTo: ["DOCENTE"],
    description: "Análisis de resultados del diagnóstico.",
  },
  {
    title: "Turnos de patio y portería",
    type: "MEMO",
    date: [5, 4],
    author: "directivo",
    description: "Distribución de turnos del personal para el mes de mayo.",
  },
  {
    title: "Citación a reunión de apoderados de 3° Básico A",
    type: "CITACION",
    date: [5, 12],
    author: "directivo",
    course: "3B",
    requiresAck: true,
    acknowledgedBy: ["apoderado"],
    description: "Reunión de apoderados del curso, jueves a las 19:00 horas.",
  },
  {
    title: "Protocolo de salidas pedagógicas",
    type: "ACUERDO",
    date: [5, 20],
    author: "director",
    visibleTo: ["DOCENTE", "APODERADO"],
    description: "Autorizaciones, traslados y responsabilidades en salidas pedagógicas.",
  },
  {
    title: "Oficio al DAEM sobre mantención de infraestructura",
    type: "OFICIO",
    date: [6, 2],
    author: "director",
    description: "Solicitud de reparación de techumbre del gimnasio.",
  },
  {
    title: "Permiso administrativo de un día — Andrés Fuentes",
    type: "PERMISO",
    date: [6, 9],
    author: "director",
    recipients: ["docente"],
    description: "Permiso con goce de remuneraciones por trámite personal.",
  },
  {
    title: "Acta de reunión del equipo directivo",
    type: "ACTA",
    date: [6, 16],
    author: "directivo",
    archived: true,
    description: "Seguimiento del plan de mejoramiento educativo.",
  },
  {
    title: "Solicitud de recursos para el Programa de Integración",
    type: "OFICIO",
    date: [6, 30],
    author: "director",
    visibleTo: ["DOCENTE"],
    description: "Requerimientos de material para el PIE.",
  },
  {
    title: "Comunicado: suspensión de clases por jornada de reflexión",
    type: "MEMO",
    date: [7, 7],
    author: "director",
    visibleTo: ["DOCENTE", "APODERADO"],
    description: "No habrá clases el viernes por jornada de reflexión docente.",
  },
  {
    title: "Citación a entrevista con profesora jefe",
    type: "CITACION",
    date: [7, 21],
    author: "directivo",
    recipients: ["apoderado"],
    acknowledgedBy: ["apoderado"],
    requiresAck: true,
    description: "Entrevista para revisar el avance académico del estudiante.",
  },
  {
    title: "Acuerdo de convivencia con el Centro de Padres",
    type: "ACUERDO",
    date: [8, 4],
    author: "director",
    visibleTo: ["APODERADO"],
    description: "Compromisos de colaboración para actividades del año.",
  },
  {
    title: "Permiso administrativo de medio día — Inspectoría",
    type: "PERMISO",
    date: [8, 11],
    author: "directivo",
    description: "Permiso por la tarde para funcionaria de inspectoría.",
  },
  {
    title: "Resultados SIMCE del año anterior",
    type: "OFICIO",
    date: [8, 18],
    author: "director",
    visibleTo: ["DOCENTE"],
    archived: true,
    description: "Informe de resultados y líneas de acción.",
  },
  {
    title: "Citación a entrevista con Convivencia Escolar",
    type: "CITACION",
    date: [8, 25],
    author: "directivo",
    recipients: ["apoderado2"],
    requiresAck: true,
    description: "Entrevista con la encargada de convivencia escolar.",
  },
  {
    title: "Citación a consejo de profesores extraordinario",
    type: "CITACION",
    date: [9, 1],
    author: "director",
    recipients: ["docente"],
    requiresAck: true,
    description: "Consejo extraordinario para planificar la semana de Fiestas Patrias.",
  },
  {
    title: "Reglamento de evaluación 2026 (actualización)",
    type: "ACUERDO",
    date: [9, 8],
    author: "director",
    visibleTo: ["DOCENTE", "APODERADO"],
    description: "Cambios aprobados al reglamento de evaluación y promoción.",
  },
  {
    title: "Citación a reunión de apoderados de 1° Medio B",
    type: "CITACION",
    date: [9, 15],
    author: "directivo",
    course: "1M",
    requiresAck: true,
    description: "Reunión de apoderados para organizar la gira de estudios.",
  },
];

async function resetDatabase() {
  // Archivos de un seed anterior: se borran del storage para no dejar huérfanos.
  const previousFiles = await prisma.document.findMany({ select: { fileKey: true } });
  await Promise.all(previousFiles.map((d) => deleteFile(d.fileKey).catch(() => undefined)));

  // Orden inverso a las dependencias.
  await prisma.downloadLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.documentRecipient.deleteMany();
  await prisma.documentVisibility.deleteMany();
  await prisma.documentCourse.deleteMany();
  await prisma.document.deleteMany();
  await prisma.documentType.deleteMany();
  await prisma.guardianStudent.deleteMany();
  await prisma.student.deleteMany();
  await prisma.course.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  console.log("🧹 Limpiando la base de datos…");
  await resetDatabase();

  console.log("🏷️  Tipos de documento…");
  const types = {} as Record<TypeCode, { id: string; name: string }>;
  for (const type of DOCUMENT_TYPES) {
    types[type.code] = await prisma.documentType.create({ data: type });
  }

  console.log("👤 Usuarios…");
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const users = {} as Record<UserKey, { id: string; fullName: string }>;
  for (const u of USERS) {
    users[u.key] = await prisma.user.create({
      data: {
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        rut: rut(u.rutBody),
        phone: "+56 9 " + String(u.rutBody).slice(0, 4) + " " + String(u.rutBody).slice(4, 8),
        passwordHash,
      },
    });
  }

  console.log("🏫 Cursos y estudiantes…");
  const course3B = await prisma.course.create({ data: { name: "3° Básico A", year: YEAR } });
  const course1M = await prisma.course.create({ data: { name: "1° Medio B", year: YEAR } });

  const students = [
    {
      fullName: "Tomás Herrera Castillo",
      rutBody: 24567123,
      courseId: course3B.id,
      guardian: "apoderado" as const,
    },
    {
      fullName: "Sofía Herrera Castillo",
      rutBody: 25123456,
      courseId: course3B.id,
      guardian: "apoderado" as const,
    },
    { fullName: "Martina Rojas Silva", rutBody: 24890321, courseId: course3B.id },
    {
      fullName: "Benjamín Sepúlveda Mora",
      rutBody: 22345678,
      courseId: course1M.id,
      guardian: "apoderado2" as const,
    },
    { fullName: "Isidora Tapia Núñez", rutBody: 22789012, courseId: course1M.id },
    { fullName: "Vicente Araya León", rutBody: 22901234, courseId: course1M.id },
  ];
  for (const s of students) {
    const student = await prisma.student.create({
      data: { fullName: s.fullName, rut: rut(s.rutBody), courseId: s.courseId },
    });
    if (s.guardian) {
      await prisma.guardianStudent.create({
        data: { guardianId: users[s.guardian].id, studentId: student.id },
      });
    }
  }
  const courseGuardians = { "3B": ["apoderado"], "1M": ["apoderado2"] } as const satisfies Record<
    string,
    UserKey[]
  >;
  const courseIds = { "3B": course3B.id, "1M": course1M.id };

  console.log(`📄 Documentos y archivos de muestra (storage: ${getStorageDriverName()})…`);
  const folioCounters = new Map<TypeCode, number>();
  const createdDocs: { id: string; recipients: UserKey[]; visibleTo: Role[] }[] = [];

  for (const doc of DOCUMENTS) {
    const folioNumber = (folioCounters.get(doc.type) ?? 0) + 1;
    folioCounters.set(doc.type, folioNumber);

    const [month, date] = doc.date;
    const slug = slugify(doc.title);
    const fileKey = `documents/${YEAR}/${randomUUID()}-${slug}.pdf`;
    const pdf = buildSimplePdf({
      heading: "Establecimiento Educacional — Documento de muestra",
      title: doc.title,
      meta: [
        `Tipo: ${types[doc.type].name}   ·   Folio: ${folioNumber}/${YEAR}`,
        `Fecha: ${String(date).padStart(2, "0")}-${String(month).padStart(2, "0")}-${YEAR}`,
        `Autor(a): ${users[doc.author].fullName}`,
      ],
      body: `${doc.description} Este archivo fue generado automáticamente por el seed de desarrollo del Gestor Documental Escolar.`,
    });
    await putFile(fileKey, pdf, "application/pdf");

    const recipients: UserKey[] = [
      ...(doc.recipients ?? []),
      ...(doc.course ? courseGuardians[doc.course] : []),
    ];
    const created = await prisma.document.create({
      data: {
        title: doc.title,
        description: doc.description,
        documentTypeId: types[doc.type].id,
        folioNumber,
        folioYear: YEAR,
        documentDate: day(month, date),
        authorId: users[doc.author].id,
        fileKey,
        fileName: `${slug}.pdf`,
        mimeType: "application/pdf",
        fileSize: pdf.length,
        status: doc.archived ? "ARCHIVADO" : "VIGENTE",
        requiresAcknowledgement: doc.requiresAck ?? false,
        createdAt: uploadedAt(month, date),
        visibility: { create: (doc.visibleTo ?? []).map((role) => ({ role })) },
        recipients: {
          create: recipients.map((key) => ({
            userId: users[key].id,
            acknowledgedAt: doc.acknowledgedBy?.includes(key) ? uploadedAt(month, date + 1) : null,
          })),
        },
        courses: doc.course ? { create: [{ courseId: courseIds[doc.course] }] } : undefined,
      },
    });
    createdDocs.push({ id: created.id, recipients, visibleTo: doc.visibleTo ?? [] });

    await prisma.auditLog.create({
      data: {
        userId: users[doc.author].id,
        action: "CREATE_DOCUMENT",
        entity: "Document",
        entityId: created.id,
        metadata: { title: doc.title, type: doc.type },
        createdAt: uploadedAt(month, date),
      },
    });
  }

  console.log("⬇️  Descargas de ejemplo…");
  const downloads: { docIndex: number; user: UserKey; month: number; date: number }[] = [
    { docIndex: 1, user: "docente", month: 3, date: 28 },
    { docIndex: 1, user: "apoderado", month: 3, date: 29 },
    { docIndex: 6, user: "apoderado", month: 5, date: 13 },
    { docIndex: 7, user: "apoderado2", month: 5, date: 22 },
    { docIndex: 12, user: "docente", month: 7, date: 8 },
    { docIndex: 12, user: "apoderado", month: 7, date: 8 },
    { docIndex: 13, user: "apoderado", month: 7, date: 22 },
    { docIndex: 19, user: "docente", month: 9, date: 9 },
    { docIndex: 19, user: "apoderado", month: 9, date: 10 },
    { docIndex: 19, user: "apoderado2", month: 9, date: 11 },
    { docIndex: 2, user: "director", month: 9, date: 12 },
  ];
  await prisma.downloadLog.createMany({
    data: downloads.map((d) => ({
      documentId: createdDocs[d.docIndex].id,
      userId: users[d.user].id,
      downloadedAt: uploadedAt(d.month, d.date),
      ipAddress: "127.0.0.1",
      userAgent: "seed",
    })),
  });

  console.log(
    `\n✅ Seed completo: ${USERS.length} usuarios, ${students.length} estudiantes, ${DOCUMENTS.length} documentos.`,
  );
  console.log(`   Contraseña de todos los usuarios de prueba: ${SEED_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
