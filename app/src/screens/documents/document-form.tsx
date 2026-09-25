import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { api } from '@/api/client';
import { useCourses, useDocumentTypes, useUsers } from '@/api/queries';
import type { DocumentDetail, Role } from '@/api/types';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChipGroup } from '@/components/chip';
import { ProgressBar } from '@/components/feedback';
import { FileDropZone } from '@/components/file-drop-zone';
import { SwitchRow } from '@/components/switch-row';
import { TextField } from '@/components/text-field';
import { UserPicker } from '@/components/user-picker';
import { useIsWide } from '@/hooks/use-layout';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE, type PickedFile } from '@/lib/files';
import { todayInSantiago } from '@/lib/format';
import { isAdmin, READER_ROLES } from '@/lib/roles';
import { useCurrentUser } from '@/store/session';
import { spacing } from '@/theme';

const schema = z.object({
  title: z.string().trim().min(3, 'Ingrese un título (mínimo 3 caracteres)').max(200),
  typeCode: z.string().min(1, 'Seleccione el tipo de documento'),
  documentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD')
    .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), 'Fecha inválida'),
  folioNumber: z.string().trim().max(30).optional(),
  description: z.string().max(5000).optional(),
  visibility: z.array(z.enum(['DIRECTOR', 'SOSTENEDOR', 'EQUIPO_DIRECTIVO', 'DOCENTE', 'APODERADO'])),
  recipientIds: z.array(z.number()),
  courseIds: z.array(z.number()),
  requiresAcknowledgement: z.boolean(),
});

export type DocumentFormValues = z.infer<typeof schema>;

export interface DocumentFormSubmit {
  values: DocumentFormValues;
  file: PickedFile | null;
}

export function DocumentForm({
  initial,
  submitLabel,
  submitting,
  progress,
  onSubmit,
}: {
  initial?: DocumentDetail;
  submitLabel: string;
  submitting: boolean;
  progress: number | null;
  onSubmit: (data: DocumentFormSubmit) => void;
}) {
  const wide = useIsWide();
  const user = useCurrentUser();
  const types = useDocumentTypes();
  const courses = useCourses();
  const users = useUsers({ isActive: true });
  const [file, setFile] = useState<PickedFile | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [folioTouched, setFolioTouched] = useState(Boolean(initial));

  const { control, handleSubmit, setValue } = useForm<DocumentFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initial?.title ?? '',
      typeCode: initial?.documentType.code ?? '',
      documentDate: initial?.documentDate ?? todayInSantiago(),
      folioNumber: initial?.folioNumber ?? '',
      description: initial?.description ?? '',
      visibility: initial?.visibility ?? [],
      recipientIds: initial?.recipientIds ?? [],
      courseIds: initial?.courseIds ?? [],
      requiresAcknowledgement: initial?.requiresAcknowledgement ?? false,
    },
  });

  // Folio sugerido: se recalcula al cambiar tipo o fecha, salvo que el usuario lo haya editado.
  const typeCode = useWatch({ control, name: 'typeCode' });
  const documentDate = useWatch({ control, name: 'documentDate' });
  useEffect(() => {
    if (folioTouched || !typeCode || !/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) return;
    let cancelled = false;
    api
      .get<{ folioNumber: string }>('/documents/next-folio', { params: { type: typeCode, date: documentDate } })
      .then(({ data }) => {
        if (!cancelled) setValue('folioNumber', data.folioNumber);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [typeCode, documentDate, folioTouched, setValue]);

  const validateFile = (f: PickedFile | null): string | undefined => {
    if (!f) return undefined;
    if (!ALLOWED_MIME_TYPES.includes(f.mimeType)) return 'Tipo no permitido: use PDF, DOCX, JPG o PNG';
    if (f.size > MAX_FILE_SIZE) return 'El archivo supera los 10 MB';
    return undefined;
  };

  const submit = handleSubmit((values) => {
    const err = validateFile(file);
    setFileError(err);
    if (err) return;
    onSubmit({ values, file });
  });

  // Destinatarios: lectores (docentes y apoderados). Los directivos ya ven todo.
  const readerUsers = (users.data ?? []).filter((u) => READER_ROLES.includes(u.role));

  return (
    <View style={styles.form} testID="document-form">
      <View style={[styles.columns, wide && styles.columnsWide]}>
        <Card title="Datos del documento" style={styles.col}>
          <Controller
            control={control}
            name="title"
            render={({ field, fieldState }) => (
              <TextField testID="upload-title" label="Título" placeholder="Ej.: Acta reunión apoderados 08-2026" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />
            )}
          />
          <Controller
            control={control}
            name="typeCode"
            render={({ field, fieldState }) => (
              <View style={styles.block}>
                <AppText variant="label">Tipo de documento</AppText>
                <ChipGroup
                  testIDPrefix="upload-type"
                  options={(types.data ?? []).map((t) => ({ value: t.code, label: t.name }))}
                  value={field.value ? [field.value] : []}
                  onChange={(v) => field.onChange(v[0] ?? '')}
                />
                {fieldState.error ? (
                  <AppText variant="caption" tone="danger">
                    {fieldState.error.message}
                  </AppText>
                ) : null}
              </View>
            )}
          />
          <View style={styles.row}>
            <Controller
              control={control}
              name="documentDate"
              render={({ field, fieldState }) => (
                <TextField testID="upload-date" label="Fecha" placeholder="AAAA-MM-DD" maxLength={10} value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
              )}
            />
            <Controller
              control={control}
              name="folioNumber"
              render={({ field, fieldState }) => (
                <TextField
                  testID="upload-folio"
                  label="Folio"
                  hint={folioTouched ? undefined : 'Sugerido automáticamente'}
                  value={field.value}
                  onChangeText={(v) => {
                    setFolioTouched(true);
                    field.onChange(v);
                  }}
                  error={fieldState.error?.message}
                />
              )}
            />
          </View>
          <Controller
            control={control}
            name="description"
            render={({ field }) => (
              <TextField testID="upload-description" label="Descripción (opcional)" multiline value={field.value} onChangeText={field.onChange} />
            )}
          />
          <View style={styles.block}>
            <AppText variant="label">{initial ? 'Reemplazar archivo (opcional)' : 'Archivo'}</AppText>
            <FileDropZone
              file={file}
              onChange={(f) => {
                setFile(f);
                setFileError(validateFile(f));
              }}
              error={fileError}
              disabled={submitting}
            />
            {progress !== null ? (
              <View style={styles.block}>
                <ProgressBar value={progress} testID="upload-progress" />
                <AppText variant="caption" tone="secondary">
                  Subiendo… {Math.round(progress * 100)}%
                </AppText>
              </View>
            ) : null}
          </View>
        </Card>

        <Card title="¿Quién puede verlo?" subtitle="El equipo directivo siempre ve todos los documentos." style={styles.col}>
          <Controller
            control={control}
            name="visibility"
            render={({ field }) => (
              <View style={styles.block}>
                <AppText variant="label">Roles con visibilidad</AppText>
                <ChipGroup<Role>
                  multiple
                  testIDPrefix="upload-visibility"
                  options={READER_ROLES.map((r) => ({ value: r, label: `Todos los ${r === 'DOCENTE' ? 'docentes' : 'apoderados'}` }))}
                  value={field.value}
                  onChange={field.onChange}
                />
              </View>
            )}
          />
          <Controller
            control={control}
            name="courseIds"
            render={({ field }) => (
              <View style={styles.block}>
                <AppText variant="label">Apoderados de cursos completos</AppText>
                <ChipGroup
                  multiple
                  testIDPrefix="upload-course"
                  options={(courses.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                  value={field.value}
                  onChange={field.onChange}
                />
              </View>
            )}
          />
          <Controller
            control={control}
            name="recipientIds"
            render={({ field }) => (
              <View style={styles.block}>
                <AppText variant="label">Destinatarios específicos</AppText>
                <UserPicker users={readerUsers} value={field.value} onChange={field.onChange} />
              </View>
            )}
          />
          <Controller
            control={control}
            name="requiresAcknowledgement"
            render={({ field }) => (
              <SwitchRow
                testID="upload-requires-ack"
                label="Requiere acuse de recibo"
                description="Los destinatarios deberán confirmar que lo leyeron."
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          {!isAdmin(user?.role) && initial && initial.author.id !== user?.id ? (
            <AppText variant="caption" tone="warning">
              Solo puede editar los documentos que usted subió.
            </AppText>
          ) : null}
        </Card>
      </View>

      <Button testID="upload-submit" label={submitLabel} icon={Save} loading={submitting} onPress={() => void submit()} style={styles.submit} />
      <AppText variant="caption" tone="secondary">
        Docentes y apoderados solo verán el documento si su rol tiene visibilidad, si los elige como destinatarios o si elige el curso de sus pupilos.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  columns: { gap: spacing.lg },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  block: { gap: spacing.sm },
  submit: { alignSelf: 'flex-start' },
});
