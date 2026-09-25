/* eslint-disable no-console */
/**
 * Datos iniciales del Gestor Documental — Escuela Básica G-733 Chorombo Bajo.
 * Es idempotente: se puede ejecutar varias veces sin duplicar registros.
 *
 * Usuarios de prueba (contraseña común: Colegio2026!):
 *   directora.chorombo   · directora@colegiochorombo.cl   · DIRECTOR
 *   sostenedor.chorombo  · sostenedor@colegiochorombo.cl  · SOSTENEDOR
 *   equipo.chorombo      · equipo@colegiochorombo.cl      · EQUIPO_DIRECTIVO
 *   docente.chorombo     · docente@colegiochorombo.cl     · DOCENTE
 *   apoderado1.chorombo  · apoderado1@colegiochorombo.cl  · APODERADO
 *   apoderado2.chorombo  · apoderado2@colegiochorombo.cl  · APODERADO
 */
import { PrismaClient, type DocumentStatus, type Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import { buildSamplePdf } from '../src/lib/pdf';
import { buildRut } from '../src/lib/rut';
import { putObject } from '../src/lib/s3';

const prisma = new PrismaClient();

export const SEED_PASSWORD = 'Colegio2026!';
const YEAR = 2026;

const DOCUMENT_TYPES = [
  { code: 'MEMO', name: 'Memo', color: '#A8C8F0' },
  { code: 'OFICIO', name: 'Oficio', color: '#C3B1E8' },
  { code: 'CITACION', name: 'Citación', color: '#F2C1CC' },
  { code: 'ACUERDO', name: 'Acuerdo', color: '#B8E3D0' },
  { code: 'ACTA', name: 'Acta', color: '#B5B8F0' },
  { code: 'PERMISO_ADMINISTRATIVO', name: 'Permiso administrativo', color: '#F6E0B5' },
] as const;

type UserKey = 'directora' | 'sostenedor' | 'equipo' | 'docente' | 'apoderado1' | 'apoderado2';

const USERS: Record<UserKey, { fullName: string; role: Role; rutBody: number; phone: string }> = {
  directora: { fullName: 'Carolina Andrea Muñoz Soto', role: 'DIRECTOR', rutBody: 12457896, phone: '+56 9 8123 4567' },
  sostenedor: { fullName: 'Rodrigo Esteban Lagos Pino', role: 'SOSTENEDOR', rutBody: 10987654, phone: '+56 9 7234 5678' },
  equipo: { fullName: 'Patricia Elena Rojas Vera', role: 'EQUIPO_DIRECTIVO', rutBody: 13579246, phone: '+56 9 6345 6789' },
  docente: { fullName: 'Javier Ignacio Contreras Díaz', role: 'DOCENTE', rutBody: 16482039, phone: '+56 9 5456 7890' },
  apoderado1: { fullName: 'Marcela Alejandra Fuentes Carrasco', role: 'APODERADO', rutBody: 15836247, phone: '+56 9 4567 8901' },
  apoderado2: { fullName: 'Luis Alberto Espinoza Tapia', role: 'APODERADO', rutBody: 14290573, phone: '+56 9 3678 9012' },
};

type CourseKey = '3A' | '7A';
const COURSES: Record<CourseKey, string> = { '3A': '3° Básico A', '7A': '7° Básico A' };

const STUDENTS: { fullName: string; rutBody: number; course: CourseKey; guardian?: UserKey }[] = [
  { fullName: 'Tomás Ignacio Fuentes Carrasco', rutBody: 25123456, course: '3A', guardian: 'apoderado1' },
  { fullName: 'Isidora Belén Fuentes Carrasco', rutBody: 23876543, course: '7A', guardian: 'apoderado1' },
  { fullName: 'Martina Paz Espinoza Tapia', rutBody: 23954321, course: '7A', guardian: 'apoderado2' },
  { fullName: 'Benjamín Andrés Lillo Reyes', rutBody: 25234567, course: '3A' },
  { fullName: 'Florencia Antonia Soto Muñoz', rutBody: 25345678, course: '3A' },
  { fullName: 'Agustín Matías Pérez Olguín', rutBody: 23765432, course: '7A' },
];

interface SeedDocument {
  title: string;
  type: (typeof DOCUMENT_TYPES)[number]['code'];
  date: string;
  author: UserKey;
  description: string;
  /** Roles lectores con visibilidad (los directivos siempre ven todo) */
  visibility?: Role[];
  recipients?: UserKey[];
  courses?: CourseKey[];
  ack?: boolean;
  status?: DocumentStatus;
}

const DOCUMENTS: SeedDocument[] = [
  { title: 'Memo: calendario de evaluaciones segundo semestre', type: 'MEMO', date: '2026-07-28', author: 'equipo', description: 'Calendario de evaluaciones de agosto a diciembre para todos los cursos.', visibility: ['DOCENTE'] },
  { title: 'Memo: uso del laboratorio de computación', type: 'MEMO', date: '2026-04-06', author: 'equipo', description: 'Horarios y normas de uso del laboratorio.', visibility: ['DOCENTE'] },
  { title: 'Memo interno: revisión del presupuesto SEP', type: 'MEMO', date: '2026-05-12', author: 'directora', description: 'Revisión de la ejecución de la Subvención Escolar Preferencial (uso exclusivo del equipo directivo).' },
  { title: 'Comunicado: suspensión de clases por jornada de reflexión', type: 'MEMO', date: '2026-09-02', author: 'directora', description: 'Se suspenden las clases el viernes 11 de septiembre por jornada de reflexión docente.', visibility: ['DOCENTE', 'APODERADO'], ack: true },
  { title: 'Oficio N° 45 a DAEM María Pinto: solicitud de mantención', type: 'OFICIO', date: '2026-03-18', author: 'directora', description: 'Solicitud de mantención de techumbre y servicios higiénicos.' },
  { title: 'Oficio a Superintendencia: respuesta a fiscalización', type: 'OFICIO', date: '2026-06-09', author: 'directora', description: 'Respuesta formal al acta de fiscalización de la Superintendencia de Educación.' },
  { title: 'Oficio SEREMI: plan integral de seguridad escolar', type: 'OFICIO', date: '2026-04-22', author: 'sostenedor', description: 'Actualización del Plan Integral de Seguridad Escolar (PISE).', visibility: ['DOCENTE'] },
  { title: 'Oficio JUNAEB: programa de alimentación escolar 2025', type: 'OFICIO', date: '2026-03-04', author: 'sostenedor', description: 'Cierre del programa de alimentación del año anterior.', visibility: ['DOCENTE', 'APODERADO'], status: 'ARCHIVADO' },
  { title: 'Citación a entrevista de apoderado — 3° Básico A', type: 'CITACION', date: '2026-08-19', author: 'equipo', description: 'Se cita a la apoderada a entrevista con profesor jefe el 26 de agosto a las 15:30.', recipients: ['apoderado1'], ack: true },
  { title: 'Citación a reunión de apoderados 3° Básico A', type: 'CITACION', date: '2026-08-10', author: 'equipo', description: 'Reunión de apoderados del 3° Básico A, jueves 20 de agosto a las 18:00.', courses: ['3A'], ack: true },
  { title: 'Citación a reunión de apoderados 7° Básico A', type: 'CITACION', date: '2026-08-10', author: 'equipo', description: 'Reunión de apoderados del 7° Básico A, jueves 20 de agosto a las 19:00.', courses: ['7A'], ack: true },
  { title: 'Citación a consejo de profesores extraordinario', type: 'CITACION', date: '2026-09-07', author: 'directora', description: 'Consejo extraordinario para planificar el cierre de semestre.', visibility: ['DOCENTE'], recipients: ['docente'], ack: true },
  { title: 'Acuerdo Centro General de Padres: aporte voluntario 2026', type: 'ACUERDO', date: '2026-04-15', author: 'directora', description: 'Acuerdo sobre el aporte voluntario anual y su destino.', visibility: ['DOCENTE', 'APODERADO'] },
  { title: 'Acuerdo de convivencia escolar 2026', type: 'ACUERDO', date: '2026-03-10', author: 'equipo', description: 'Reglamento de convivencia actualizado y acordado con la comunidad.', visibility: ['DOCENTE', 'APODERADO'] },
  { title: 'Acta reunión apoderados 08-2026', type: 'ACTA', date: '2026-08-20', author: 'directora', description: 'Acta de la reunión general de apoderados de agosto de 2026.', visibility: ['DOCENTE', 'APODERADO'] },
  { title: 'Acta consejo escolar 07-2026', type: 'ACTA', date: '2026-07-14', author: 'directora', description: 'Acta de la sesión ordinaria del consejo escolar.', visibility: ['DOCENTE', 'APODERADO'] },
  { title: 'Acta consejo de profesores 08-2026', type: 'ACTA', date: '2026-08-25', author: 'equipo', description: 'Acuerdos del consejo de profesores de agosto.', visibility: ['DOCENTE'] },
  { title: 'Acta reunión equipo directivo 09-2026', type: 'ACTA', date: '2026-09-03', author: 'directora', description: 'Acta de la reunión del equipo directivo (uso interno).' },
  { title: 'Permiso administrativo docente J. Contreras', type: 'PERMISO_ADMINISTRATIVO', date: '2026-08-12', author: 'directora', description: 'Permiso administrativo de un día hábil concedido para el 14 de agosto.', recipients: ['docente'] },
  { title: 'Permiso administrativo asistente de la educación', type: 'PERMISO_ADMINISTRATIVO', date: '2026-06-23', author: 'directora', description: 'Permiso administrativo concedido a asistente de la educación (uso interno).' },
];

const FOLIO_PREFIX: Record<string, string> = { MEMO: 'MEM', OFICIO: 'OFI', CITACION: 'CIT', ACUERDO: 'ACU', ACTA: 'ACT', PERMISO_ADMINISTRATIVO: 'PAD' };

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/** Sube el PDF de muestra. Si S3/MinIO no está disponible, el documento queda sin archivo. */
async function uploadSamplePdf(doc: SeedDocument, folio: string, typeName: string, authorName: string) {
  const fileName = `${slugify(doc.title)}.pdf`;
  const fileKey = `documents/seed/${fileName}`;
  const pdf = buildSamplePdf([
    'Escuela Basica G-733 Chorombo Bajo - Maria Pinto',
    `${typeName} ${folio}`,
    doc.title,
    `Fecha: ${doc.date}`,
    `Autor(a): ${authorName}`,
    doc.description,
    'Documento de muestra generado por el seed del Gestor Documental.',
  ]);
  try {
    await putObject(fileKey, pdf, 'application/pdf');
    return { fileKey, fileName, mimeType: 'application/pdf', fileSize: pdf.length };
  } catch (err) {
    console.warn(`  ! No se pudo subir ${fileKey} (${(err as Error).name}); el documento queda sin archivo.`);
    return null;
  }
}

async function main(): Promise<void> {
  console.log('Seed: tipos de documento');
  const types = new Map<string, { id: number; name: string }>();
  for (const t of DOCUMENT_TYPES) {
    const row = await prisma.documentType.upsert({ where: { code: t.code }, update: { name: t.name, color: t.color }, create: t });
    types.set(t.code, row);
  }

  console.log('Seed: usuarios');
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const users = new Map<UserKey, { id: number; fullName: string }>();
  for (const [key, u] of Object.entries(USERS) as [UserKey, (typeof USERS)[UserKey]][]) {
    const username = `${key}.chorombo`;
    const row = await prisma.user.upsert({
      where: { username },
      update: {},
      create: {
        username,
        fullName: u.fullName,
        rut: buildRut(u.rutBody),
        email: `${key}@colegiochorombo.cl`,
        passwordHash,
        role: u.role,
        phone: u.phone,
      },
    });
    users.set(key, row);
  }

  console.log('Seed: cursos, estudiantes y apoderados');
  const courses = new Map<CourseKey, number>();
  for (const [key, name] of Object.entries(COURSES) as [CourseKey, string][]) {
    const row = await prisma.course.upsert({ where: { name_year: { name, year: YEAR } }, update: {}, create: { name, year: YEAR } });
    courses.set(key, row.id);
  }
  for (const s of STUDENTS) {
    const rut = buildRut(s.rutBody);
    const student = await prisma.student.upsert({
      where: { rut },
      update: {},
      create: { fullName: s.fullName, rut, courseId: courses.get(s.course)! },
    });
    if (s.guardian) {
      const guardianId = users.get(s.guardian)!.id;
      await prisma.guardianStudent.upsert({
        where: { guardianId_studentId: { guardianId, studentId: student.id } },
        update: {},
        create: { guardianId, studentId: student.id },
      });
    }
  }

  console.log('Seed: documentos');
  const sequence = new Map<string, number>();
  let created = 0;
  for (const doc of DOCUMENTS) {
    const type = types.get(doc.type)!;
    const seqKey = doc.type;
    const seq = (sequence.get(seqKey) ?? 0) + 1;
    sequence.set(seqKey, seq);
    const folio = `${FOLIO_PREFIX[doc.type]}-${YEAR}-${String(seq).padStart(4, '0')}`;

    const exists = await prisma.document.findFirst({ where: { title: doc.title }, select: { id: true } });
    if (exists) continue;

    const author = users.get(doc.author)!;
    const file = await uploadSamplePdf(doc, folio, type.name, author.fullName);
    await prisma.document.create({
      data: {
        title: doc.title,
        description: doc.description,
        documentTypeId: type.id,
        folioNumber: folio,
        folioYear: YEAR,
        documentDate: new Date(`${doc.date}T00:00:00.000Z`),
        authorId: author.id,
        status: doc.status ?? 'VIGENTE',
        requiresAcknowledgement: doc.ack ?? false,
        ...(file ?? {}),
        createdAt: new Date(`${doc.date}T12:00:00.000Z`),
        visibilities: { create: (doc.visibility ?? []).map((role) => ({ role })) },
        recipients: { create: (doc.recipients ?? []).map((k) => ({ userId: users.get(k)!.id })) },
        courses: { create: (doc.courses ?? []).map((k) => ({ courseId: courses.get(k)! })) },
      },
    });
    created++;
  }

  console.log(`Seed completo: ${users.size} usuarios, ${STUDENTS.length} estudiantes, ${created} documentos nuevos.`);
  console.log(`Contraseña de todos los usuarios de prueba: ${SEED_PASSWORD}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
