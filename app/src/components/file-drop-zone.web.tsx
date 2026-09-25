import { CloudUpload, FileCheck2, X } from 'lucide-react-native';
import { createElement, useState, type DragEvent } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatFileSize } from '@/lib/format';
import { ALLOWED_MIME_TYPES, fromBrowserFile, type PickedFile } from '@/lib/files';
import { colors, fonts, radius, spacing } from '@/theme';
import { AppText } from './app-text';

export interface FileDropZoneProps {
  file: PickedFile | null;
  onChange: (file: PickedFile | null) => void;
  error?: string;
  disabled?: boolean;
}

/** Zona de arrastrar y soltar (web). También permite hacer clic para elegir el archivo. */
export function FileDropZone({ file, onChange, error, disabled }: FileDropZoneProps) {
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const accept = (f: globalThis.File | undefined) => {
    if (f) onChange(fromBrowserFile(f));
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) accept(e.dataTransfer.files?.[0]);
  };

  return (
    <View style={styles.wrapper}>
      {createElement(
        'div',
        {
          'data-testid': 'upload-dropzone',
          role: 'button',
          tabIndex: 0,
          'aria-label': 'Arrastre un archivo aquí o haga clic para seleccionarlo',
          onClick: () => !disabled && input?.click(),
          onKeyDown: (e: KeyboardEvent) => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabled) input?.click();
          },
          onDragOver: (e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setDragging(true);
          },
          onDragLeave: () => setDragging(false),
          onDrop,
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            padding: spacing.xl,
            minHeight: 170,
            borderRadius: radius.lg,
            border: `2px dashed ${error ? colors.dangerText : dragging ? colors.focus : colors.accent}`,
            backgroundColor: dragging ? colors.secondarySoft : colors.primarySoft,
            cursor: disabled ? 'default' : 'pointer',
            textAlign: 'center',
            fontFamily: fonts.regular,
            outline: 'none',
          },
        },
        file ? <FileCheck2 size={30} color={colors.text} strokeWidth={1.5} /> : <CloudUpload size={30} color={colors.text} strokeWidth={1.5} />,
        <AppText key="t" variant="bodyStrong" center>
          {file ? file.name : dragging ? 'Suelte el archivo aquí' : 'Arrastre un archivo aquí o haga clic para seleccionarlo'}
        </AppText>,
        <AppText key="s" variant="caption" tone="secondary" center>
          {file ? formatFileSize(file.size) : 'PDF, DOCX, JPG o PNG · máximo 10 MB'}
        </AppText>,
        createElement('input', {
          key: 'input',
          ref: setInput,
          type: 'file',
          'data-testid': 'upload-file',
          accept: ALLOWED_MIME_TYPES.join(','),
          style: { display: 'none' },
          onChange: (e: { target: HTMLInputElement }) => {
            accept(e.target.files?.[0]);
            e.target.value = '';
          },
        }),
      )}
      {file && !disabled ? (
        <Pressable onPress={() => onChange(null)} style={styles.remove} accessibilityLabel="Quitar archivo">
          <X size={16} color={colors.text} />
          <AppText variant="label">Quitar archivo</AppText>
        </Pressable>
      ) : null}
      {error ? (
        <AppText variant="caption" tone="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
});
