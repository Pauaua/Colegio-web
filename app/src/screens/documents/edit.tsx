import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { useState } from 'react';
import { api, errorMessage } from '@/api/client';
import { queryKeys, useDocument } from '@/api/queries';
import { EmptyState, ErrorState, SkeletonList } from '@/components/feedback';
import { RequireRole } from '@/components/require-role';
import { Screen } from '@/components/screen';
import { toast } from '@/components/toast';
import { DIRECTIVE_ROLES } from '@/lib/roles';
import { DocumentForm, type DocumentFormSubmit } from './document-form';
import { toPayload, uploadFile } from './upload';

export function EditDocumentScreen({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const { data: doc, isLoading, error, refetch } = useDocument(id);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const submit = async ({ values, file }: DocumentFormSubmit) => {
    setSubmitting(true);
    try {
      const fileRef = file ? await uploadFile(file, setProgress) : undefined;
      await api.patch(`/documents/${id}`, { ...toPayload(values), ...(fileRef ? { file: fileRef } : {}) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.document(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.documentsAll }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
      ]);
      toast.success('Cambios guardados');
      router.replace(`/panel/documentos/${id}` as never);
    } catch (e) {
      toast.error(errorMessage(e, 'No se pudieron guardar los cambios'));
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <RequireRole roles={DIRECTIVE_ROLES}>
      <Screen title="Editar documento" subtitle={doc ? `Folio ${doc.folioNumber}` : undefined} back testID="edit-screen">
        {isLoading ? (
          <SkeletonList rows={3} />
        ) : error || !doc ? (
          <ErrorState message={errorMessage(error, 'No se pudo cargar el documento')} onRetry={() => void refetch()} />
        ) : !doc.permissions.edit ? (
          <EmptyState icon={Lock} title="No puede editar este documento" message="Solo puede editar los documentos que usted subió." />
        ) : (
          <DocumentForm initial={doc} submitLabel="Guardar cambios" submitting={submitting} progress={progress} onSubmit={(d) => void submit(d)} />
        )}
      </Screen>
    </RequireRole>
  );
}
