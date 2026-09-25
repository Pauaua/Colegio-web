import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { api, errorMessage } from '@/api/client';
import { queryKeys } from '@/api/queries';
import type { DocumentItem } from '@/api/types';
import { RequireRole } from '@/components/require-role';
import { Screen } from '@/components/screen';
import { toast } from '@/components/toast';
import { uploadToSignedUrl, type PickedFile } from '@/lib/files';
import { DIRECTIVE_ROLES } from '@/lib/roles';
import { DocumentForm, type DocumentFormSubmit, type DocumentFormValues } from './document-form';

/**
 * Sube el archivo en dos pasos: pide una URL firmada al backend y hace PUT directo a S3.
 * Devuelve la referencia que se registra junto a los metadatos.
 */
export async function uploadFile(file: PickedFile, onProgress: (ratio: number) => void) {
  const { data } = await api.post<{ uploadUrl: string; fileKey: string }>('/documents/upload-url', {
    fileName: file.name,
    mimeType: file.mimeType,
    fileSize: file.size,
  });
  await uploadToSignedUrl(data.uploadUrl, file, onProgress);
  return { fileKey: data.fileKey, fileName: file.name, mimeType: file.mimeType };
}

export function toPayload(values: DocumentFormValues) {
  return {
    title: values.title,
    typeCode: values.typeCode,
    documentDate: values.documentDate,
    folioNumber: values.folioNumber || undefined,
    description: values.description || null,
    visibility: values.visibility,
    recipientIds: values.recipientIds,
    courseIds: values.courseIds,
    requiresAcknowledgement: values.requiresAcknowledgement,
  };
}

export function UploadDocumentScreen() {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const submit = async ({ values, file }: DocumentFormSubmit) => {
    setSubmitting(true);
    try {
      const fileRef = file ? await uploadFile(file, setProgress) : null;
      const { data } = await api.post<DocumentItem>('/documents', { ...toPayload(values), file: fileRef });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.documentsAll }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
      ]);
      toast.success(`Documento registrado con folio ${data.folioNumber}`);
      router.replace(`/panel/documentos/${data.id}` as never);
    } catch (e) {
      toast.error(errorMessage(e, 'No se pudo registrar el documento'));
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <RequireRole roles={DIRECTIVE_ROLES}>
      <Screen title="Subir documento" subtitle="Cargue, clasifique y defina quién puede verlo" testID="upload-screen">
        <DocumentForm submitLabel="Registrar documento" submitting={submitting} progress={progress} onSubmit={(d) => void submit(d)} />
      </Screen>
    </RequireRole>
  );
}
