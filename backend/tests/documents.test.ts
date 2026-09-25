/**
 * Documentos en la API v1: subida con URL firmada, listado por rol, descarga protegida y acuse de recibo.
 * Requiere docker compose (MySQL + MinIO) con migraciones y seed aplicados.
 */
import { buildSamplePdf } from '../src/lib/pdf';
import { prisma } from '../src/lib/prisma';
import { api, courseId, documentIdByTitle, purgeDocuments, userId } from './helpers';

const created: number[] = [];

afterAll(async () => {
  await purgeDocuments(created);
  await prisma.$disconnect();
});

async function uploadPdf(title: string): Promise<{ fileKey: string; fileName: string; mimeType: string; size: number }> {
  const directora = await api('directora');
  const pdf = buildSamplePdf([title, 'Prueba automatizada']);
  const fileName = `${title}.pdf`;
  const res = await directora.post('/api/v1/documents/upload-url', { fileName, mimeType: 'application/pdf', fileSize: pdf.length });
  expect(res.status).toBe(200);
  expect(res.body.fileKey).toMatch(/^documents\/\d{4}\/[0-9a-f-]{36}-/);

  const put = await fetch(res.body.uploadUrl as string, { method: 'PUT', body: pdf, headers: { 'Content-Type': 'application/pdf' } });
  expect(put.status).toBe(200);
  return { fileKey: res.body.fileKey as string, fileName, mimeType: 'application/pdf', size: pdf.length };
}

describe('POST /documents/upload-url', () => {
  it('rechaza tipos no permitidos', async () => {
    const res = await (await api('directora')).post('/api/v1/documents/upload-url', { fileName: 'virus.exe', mimeType: 'application/x-msdownload', fileSize: 100 });
    expect(res.status).toBe(400);
  });

  it('rechaza archivos de más de 10 MB', async () => {
    const res = await (await api('directora')).post('/api/v1/documents/upload-url', { fileName: 'grande.pdf', mimeType: 'application/pdf', fileSize: 10 * 1024 * 1024 + 1 });
    expect(res.status).toBe(400);
  });

  it('no está disponible para docentes ni apoderados', async () => {
    const body = { fileName: 'a.pdf', mimeType: 'application/pdf', fileSize: 100 };
    expect((await (await api('docente')).post('/api/v1/documents/upload-url', body)).status).toBe(403);
    expect((await (await api('apoderado1')).post('/api/v1/documents/upload-url', body)).status).toBe(403);
  });
});

describe('Flujo completo: subir, registrar, descargar y confirmar lectura', () => {
  let docId: number;

  it('registra un documento con archivo subido a S3/MinIO (201)', async () => {
    const file = await uploadPdf('Citacion prueba 3A');
    const res = await (await api('equipo')).post('/api/v1/documents', {
      title: 'Citación de prueba 3° Básico A',
      typeCode: 'CITACION',
      documentDate: '2026-09-15',
      description: 'Creado por las pruebas automatizadas',
      courseIds: [await courseId('3° Básico A')],
      requiresAcknowledgement: true,
      file: { fileKey: file.fileKey, fileName: file.fileName, mimeType: file.mimeType },
    });
    expect(res.status).toBe(201);
    docId = res.body.id;
    created.push(docId);
    expect(res.body.folioNumber).toMatch(/^CIT-2026-\d{4}$/);
    expect(res.body.file).toMatchObject({ fileName: file.fileName, mimeType: 'application/pdf', fileSize: file.size });
  });

  it('rechaza registrar un archivo que no se subió', async () => {
    const res = await (await api('directora')).post('/api/v1/documents', {
      title: 'Sin archivo real',
      typeCode: 'MEMO',
      documentDate: '2026-09-15',
      file: { fileKey: 'documents/2026/no-existe.pdf', fileName: 'no-existe.pdf', mimeType: 'application/pdf' },
    });
    expect(res.status).toBe(400);
  });

  it('el apoderado con pupilo en el curso lo ve y descarga el PDF firmado', async () => {
    const apoderado = await api('apoderado1');
    const list = await apoderado.get('/api/v1/documents?pageSize=100');
    expect(list.body.items.map((d: { id: number }) => d.id)).toContain(docId);

    const res = await apoderado.get(`/api/v1/documents/${docId}/download-url`);
    expect(res.status).toBe(200);
    expect(res.body.expiresIn).toBe(300);
    const file = await fetch(res.body.url as string);
    expect(file.status).toBe(200);
    expect(Buffer.from(await file.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');

    const logs = await prisma.downloadLog.count({ where: { documentId: docId, userId: await userId('apoderado1') } });
    expect(logs).toBe(1);
  });

  it('un apoderado sin pupilos en el curso recibe 403 al pedir la descarga', async () => {
    const apoderado = await api('apoderado2');
    const list = await apoderado.get('/api/v1/documents?pageSize=100');
    expect(list.body.items.map((d: { id: number }) => d.id)).not.toContain(docId);
    expect((await apoderado.get(`/api/v1/documents/${docId}/download-url`)).status).toBe(403);
    expect((await apoderado.get(`/api/v1/documents/${docId}`)).status).toBe(403);
    expect((await apoderado.post(`/api/v1/documents/${docId}/acknowledge`)).status).toBe(403);
  });

  it('el apoderado confirma la lectura y el directivo lo ve reflejado', async () => {
    const apoderado = await api('apoderado1');
    const before = await apoderado.get(`/api/v1/documents/${docId}`);
    expect(before.body.canAcknowledge).toBe(true);

    const ack = await apoderado.post(`/api/v1/documents/${docId}/acknowledge`);
    expect(ack.status).toBe(200);
    expect(ack.body.alreadyAcknowledged).toBe(false);
    const again = await apoderado.post(`/api/v1/documents/${docId}/acknowledge`);
    expect(again.body.alreadyAcknowledged).toBe(true);

    const tracking = await (await api('directora')).get(`/api/v1/documents/${docId}/acknowledgements`);
    expect(tracking.status).toBe(200);
    const me = tracking.body.members.find((m: { fullName: string }) => m.fullName === 'Marcela Alejandra Fuentes Carrasco');
    expect(me.acknowledgedAt).toEqual(expect.any(String));
    expect(tracking.body.acknowledged).toBeGreaterThanOrEqual(1);
  });

  it('solo los directivos ven el registro de descargas y acuses', async () => {
    expect((await (await api('apoderado1')).get(`/api/v1/documents/${docId}/downloads`)).status).toBe(403);
    expect((await (await api('docente')).get(`/api/v1/documents/${docId}/acknowledgements`)).status).toBe(403);
    const downloads = await (await api('equipo')).get(`/api/v1/documents/${docId}/downloads`);
    expect(downloads.status).toBe(200);
    expect(downloads.body[0].user.fullName).toBe('Marcela Alejandra Fuentes Carrasco');
  });
});

describe('Control de acceso por rol', () => {
  it('un apoderado no ve documentos exclusivos de directivos y la descarga le responde 403', async () => {
    const id = await documentIdByTitle('Acta reunión equipo directivo 09-2026');
    const apoderado = await api('apoderado1');
    const list = await apoderado.get('/api/v1/documents?pageSize=100');
    expect(list.body.items.map((d: { id: number }) => d.id)).not.toContain(id);
    expect((await apoderado.get(`/api/v1/documents/${id}/download-url`)).status).toBe(403);
  });

  it('un apoderado no ve la citación dirigida a otro apoderado', async () => {
    const id = await documentIdByTitle('Citación a entrevista de apoderado — 3° Básico A');
    expect((await (await api('apoderado2')).get(`/api/v1/documents/${id}/download-url`)).status).toBe(403);
    expect((await (await api('apoderado1')).get(`/api/v1/documents/${id}/download-url`)).status).toBe(200);
  });

  it('el docente solo ve documentos visibles para docentes o dirigidos a él', async () => {
    const docenteId = await userId('docente');
    const res = await (await api('docente')).get('/api/v1/documents?pageSize=100');
    expect(res.status).toBe(200);
    for (const doc of res.body.items as { visibility: string[]; recipientIds: number[] }[]) {
      expect(doc.visibility.includes('DOCENTE') || doc.recipientIds.includes(docenteId)).toBe(true);
    }
    const titles = (res.body.items as { title: string }[]).map((d) => d.title);
    expect(titles).toContain('Permiso administrativo docente J. Contreras');
    expect(titles).not.toContain('Permiso administrativo asistente de la educación');
  });

  it('filtra por tipo, fecha y texto', async () => {
    const directora = await api('directora');
    const actas = await directora.get('/api/v1/documents?type=ACTA&pageSize=100');
    expect(actas.body.items.every((d: { documentType: { code: string } }) => d.documentType.code === 'ACTA')).toBe(true);

    const agosto = await directora.get('/api/v1/documents?from=2026-08-01&to=2026-08-31&pageSize=100');
    expect(agosto.body.items.every((d: { documentDate: string }) => d.documentDate.startsWith('2026-08'))).toBe(true);

    const folio = await directora.get('/api/v1/documents?q=ACT-2026-0001');
    expect(folio.body.total).toBeGreaterThanOrEqual(1);
  });
});

describe('Edición, archivado y borrado lógico', () => {
  let ownId: number;
  let othersId: number;

  beforeAll(async () => {
    const base = { typeCode: 'MEMO', documentDate: '2026-09-10', visibility: ['DOCENTE'] };
    const own = await (await api('equipo')).post('/api/v1/documents', { ...base, title: 'Memo propio del equipo (prueba)' });
    const others = await (await api('directora')).post('/api/v1/documents', { ...base, title: 'Memo de la directora (prueba)' });
    ownId = own.body.id;
    othersId = others.body.id;
    created.push(ownId, othersId);
  });

  it('EQUIPO_DIRECTIVO edita y archiva lo propio, pero no lo ajeno', async () => {
    const equipo = await api('equipo');
    expect((await equipo.patch(`/api/v1/documents/${ownId}`, { title: 'Memo propio editado' })).status).toBe(200);
    expect((await equipo.post(`/api/v1/documents/${ownId}/archive`)).body.status).toBe('ARCHIVADO');
    expect((await equipo.patch(`/api/v1/documents/${othersId}`, { title: 'No debería' })).status).toBe(403);
    expect((await equipo.post(`/api/v1/documents/${othersId}/archive`)).status).toBe(403);
  });

  it('cambia la visibilidad: al quitar DOCENTE, el docente deja de verlo', async () => {
    const directora = await api('directora');
    expect((await (await api('docente')).get(`/api/v1/documents/${othersId}`)).status).toBe(200);
    await directora.patch(`/api/v1/documents/${othersId}`, { visibility: [] });
    expect((await (await api('docente')).get(`/api/v1/documents/${othersId}`)).status).toBe(403);
  });

  it('EQUIPO_DIRECTIVO no elimina; la directora hace borrado lógico', async () => {
    expect((await (await api('equipo')).delete(`/api/v1/documents/${ownId}`)).status).toBe(403);
    const directora = await api('directora');
    expect((await directora.delete(`/api/v1/documents/${ownId}`)).status).toBe(204);
    expect((await directora.get(`/api/v1/documents/${ownId}`)).status).toBe(404);
    const row = await prisma.document.findUniqueOrThrow({ where: { id: ownId } });
    expect(row.isDeleted).toBe(true);
  });

  it('docentes y apoderados no pueden editar', async () => {
    expect((await (await api('docente')).patch(`/api/v1/documents/${othersId}`, { title: 'x' })).status).toBe(403);
  });

  it('sugiere el siguiente folio', async () => {
    const res = await (await api('equipo')).get('/api/v1/documents/next-folio?type=ACTA&date=2026-10-01');
    expect(res.status).toBe(200);
    expect(res.body.folioNumber).toMatch(/^ACT-2026-\d{4}$/);
  });
});
