import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Archive, ArchiveRestore, CircleCheck, Download, Lock, Pencil, Share2, Trash2 } from 'lucide-react-native';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { api, errorMessage, statusOf } from '@/api/client';
import { queryKeys, useDocument, useDocumentAcknowledgements, useDocumentDownloads } from '@/api/queries';
import type { DocumentDetail, SignedUrl } from '@/api/types';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Banner, EmptyState, ErrorState, SkeletonList } from '@/components/feedback';
import { FilePreview } from '@/components/file-preview';
import { Screen } from '@/components/screen';
import { DocumentTypeTag, RoleTag, StatusTag, Tag } from '@/components/tag';
import { toast } from '@/components/toast';
import { confirmAction } from '@/lib/confirm';
import { downloadAndShare, openPreview, shareDocument } from '@/lib/files';
import { formatDate, formatDateTime, formatFileSize } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/roles';
import { colors, spacing } from '@/theme';

export function DocumentDetailScreen({ id }: { id: number }) {
  const { data: doc, isLoading, error, refetch, isRefetching } = useDocument(id);

  if (isLoading) {
    return (
      <Screen title="Documento" back>
        <SkeletonList rows={3} />
      </Screen>
    );
  }
  if (error || !doc) {
    const status = statusOf(error);
    return (
      <Screen title="Documento" back>
        {status === 403 ? (
          <EmptyState icon={Lock} title="No tiene acceso a este documento" message="Este documento no está disponible para su perfil." testID="doc-forbidden" />
        ) : status === 404 ? (
          <EmptyState title="Documento no encontrado" message="Puede que haya sido eliminado." testID="doc-not-found" />
        ) : (
          <ErrorState message={errorMessage(error, 'No se pudo cargar el documento')} onRetry={() => void refetch()} />
        )}
      </Screen>
    );
  }

  return (
    <Screen
      title={doc.title}
      subtitle={`${doc.documentType.name} · Folio ${doc.folioNumber}`}
      back
      actions={<ManageActions doc={doc} />}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      testID="document-detail"
    >
      <AcknowledgeBanner doc={doc} />
      <View style={styles.columns}>
        <View style={styles.main}>
          <Metadata doc={doc} />
          {doc.file ? <FileSection doc={doc} /> : null}
        </View>
        {doc.permissions.viewTracking ? (
          <View style={styles.side}>
            <Tracking doc={doc} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function useInvalidateDocument(id: number) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.document(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.documentsAll }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
    ]);
}

function ManageActions({ doc }: { doc: DocumentDetail }) {
  const invalidate = useInvalidateDocument(doc.id);
  const archived = doc.status === 'ARCHIVADO';

  const archive = useMutation({
    mutationFn: () => api.post(`/documents/${doc.id}/archive`, { archived: !archived }),
    onSuccess: async () => {
      await invalidate();
      toast.success(archived ? 'Documento restaurado' : 'Documento archivado');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/documents/${doc.id}`),
    onSuccess: async () => {
      await invalidate();
      toast.success('Documento eliminado');
      router.replace('/panel/documentos');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!doc.permissions.edit && !doc.permissions.archive && !doc.permissions.delete) return null;
  return (
    <>
      {doc.permissions.edit ? (
        <Button testID="doc-edit" label="Editar" icon={Pencil} variant="secondary" compact onPress={() => router.push(`/panel/documentos/${doc.id}/editar` as never)} />
      ) : null}
      {doc.permissions.archive ? (
        <Button
          testID="doc-archive"
          label={archived ? 'Restaurar' : 'Archivar'}
          icon={archived ? ArchiveRestore : Archive}
          variant="secondary"
          compact
          loading={archive.isPending}
          onPress={() => archive.mutate()}
        />
      ) : null}
      {doc.permissions.delete ? (
        <Button
          testID="doc-delete"
          label="Eliminar"
          icon={Trash2}
          variant="danger"
          compact
          loading={remove.isPending}
          onPress={async () => {
            if (await confirmAction('Eliminar documento', `¿Eliminar «${doc.title}»? Dejará de estar visible para todos.`, 'Eliminar')) remove.mutate();
          }}
        />
      ) : null}
    </>
  );
}

function AcknowledgeBanner({ doc }: { doc: DocumentDetail }) {
  const invalidate = useInvalidateDocument(doc.id);
  const ack = useMutation({
    mutationFn: () => api.post(`/documents/${doc.id}/acknowledge`),
    onSuccess: async () => {
      await invalidate();
      toast.success('Lectura confirmada. ¡Gracias!');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (doc.myAcknowledgedAt) {
    return <Banner tone="success" icon={CircleCheck} title={`Lectura confirmada el ${formatDateTime(doc.myAcknowledgedAt)}`} testID="ack-done" />;
  }
  if (!doc.canAcknowledge) return null;
  return (
    <Banner tone="warning" title="Este documento requiere que confirme su lectura" testID="ack-pending">
      <Button testID="doc-acknowledge" label="Confirmar lectura" icon={CircleCheck} compact loading={ack.isPending} onPress={() => ack.mutate()} style={styles.ackButton} />
    </Banner>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText variant="label" tone="secondary">
        {label}
      </AppText>
      {typeof children === 'string' ? <AppText variant="bodyStrong">{children}</AppText> : children}
    </View>
  );
}

function Metadata({ doc }: { doc: DocumentDetail }) {
  return (
    <Card title="Datos del documento">
      <View style={styles.grid} testID="doc-metadata">
        <Field label="Tipo">
          <DocumentTypeTag code={doc.documentType.code} name={doc.documentType.name} />
        </Field>
        <Field label="Estado">
          <StatusTag status={doc.status} />
        </Field>
        <Field label="Folio">{doc.folioNumber}</Field>
        <Field label="Fecha del documento">{formatDate(doc.documentDate)}</Field>
        <Field label="Autor">{doc.author.fullName}</Field>
        <Field label="Registrado">{formatDateTime(doc.createdAt)}</Field>
        {doc.visibility.length ? (
          <Field label="Visible para">
            <View style={styles.tags}>
              {doc.visibility.map((r) => (
                <RoleTag key={r} role={r} />
              ))}
            </View>
          </Field>
        ) : null}
        {doc.requiresAcknowledgement ? (
          <Field label="Acuse de recibo">
            <Tag label="Requiere confirmar lectura" color={colors.warning} />
          </Field>
        ) : null}
      </View>
      {doc.description ? (
        <Field label="Descripción">
          <AppText>{doc.description}</AppText>
        </Field>
      ) : null}
    </Card>
  );
}

function FileSection({ doc }: { doc: DocumentDetail }) {
  const preview = useQuery({
    queryKey: ['document', doc.id, 'preview'],
    queryFn: async () => (await api.get<SignedUrl>(`/documents/${doc.id}/preview-url`)).data,
    staleTime: 4 * 60 * 1000, // la URL firmada dura 5 minutos
  });

  const download = useMutation({
    mutationFn: async (mode: 'download' | 'share') => {
      const { data } = await api.get<SignedUrl>(`/documents/${doc.id}/download-url`);
      const name = data.fileName ?? `${doc.folioNumber}.pdf`;
      if (mode === 'share') await shareDocument(data.url, name, data.mimeType);
      else await downloadAndShare(data.url, name, data.mimeType);
    },
    onError: (e) => toast.error(errorMessage(e, 'No se pudo descargar el archivo')),
  });

  return (
    <Card
      title="Archivo"
      subtitle={`${doc.file?.fileName ?? ''} · ${formatFileSize(doc.file?.fileSize)}`}
      right={
        <View style={styles.fileActions}>
          <Button testID="doc-download" label="Descargar" icon={Download} compact loading={download.isPending && download.variables === 'download'} onPress={() => download.mutate('download')} />
          <Button testID="doc-share" label="Compartir" icon={Share2} variant="secondary" compact loading={download.isPending && download.variables === 'share'} onPress={() => download.mutate('share')} />
        </View>
      }
    >
      {preview.data ? (
        <FilePreview url={preview.data.url} mimeType={doc.file?.mimeType ?? null} fileName={doc.file?.fileName ?? null} onOpen={() => void openPreview(preview.data.url)} />
      ) : preview.isLoading ? (
        <SkeletonList rows={1} />
      ) : (
        <AppText tone="secondary">No se pudo generar la vista previa.</AppText>
      )}
    </Card>
  );
}

function Tracking({ doc }: { doc: DocumentDetail }) {
  const acks = useDocumentAcknowledgements(doc.id, true);
  const downloads = useDocumentDownloads(doc.id, true);

  return (
    <>
      <Card title="Confirmaciones de lectura" subtitle={acks.data ? `${acks.data.acknowledged} de ${acks.data.total} confirmaron` : undefined} testID="doc-acks">
        {acks.isLoading ? (
          <SkeletonList rows={1} />
        ) : !acks.data?.members.length ? (
          <AppText tone="secondary">Sin destinatarios lectores.</AppText>
        ) : (
          acks.data.members.map((m) => (
            <View key={m.userId} style={styles.person}>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{m.fullName}</AppText>
                <AppText variant="caption" tone="secondary">
                  {ROLE_LABELS[m.role]}
                </AppText>
              </View>
              {m.acknowledgedAt ? (
                <Tag label={`Leído ${formatDateTime(m.acknowledgedAt)}`} color={colors.success} />
              ) : doc.requiresAcknowledgement ? (
                <Tag label="Pendiente" color={colors.warning} />
              ) : null}
            </View>
          ))
        )}
      </Card>
      <Card title="Descargas" subtitle={downloads.data ? `${downloads.data.length} registradas` : undefined} testID="doc-downloads">
        {downloads.isLoading ? (
          <SkeletonList rows={1} />
        ) : !downloads.data?.length ? (
          <AppText tone="secondary">Nadie ha descargado este documento todavía.</AppText>
        ) : (
          downloads.data.map((d) => (
            <View key={d.id} style={styles.person}>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{d.user.fullName}</AppText>
                <AppText variant="caption" tone="secondary">
                  {formatDateTime(d.downloadedAt)}
                </AppText>
              </View>
            </View>
          ))
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'flex-start' },
  main: { flexGrow: 2, flexBasis: 420, gap: spacing.lg },
  side: { flexGrow: 1, flexBasis: 300, gap: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg, columnGap: spacing.xl },
  field: { gap: 4, minWidth: 160, flexGrow: 1, flexBasis: 160 },
  tags: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  fileActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  ackButton: { marginTop: spacing.sm },
});
