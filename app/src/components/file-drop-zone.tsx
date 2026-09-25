import { CloudUpload, FileCheck2, X } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatFileSize } from '@/lib/format';
import { pickDocument, type PickedFile } from '@/lib/files';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './app-text';

export interface FileDropZoneProps {
  file: PickedFile | null;
  onChange: (file: PickedFile | null) => void;
  error?: string;
  disabled?: boolean;
}

/** Selector de archivo en móvil (en web existe la variante con arrastrar y soltar). */
export function FileDropZone({ file, onChange, error, disabled }: FileDropZoneProps) {
  const choose = async () => {
    const picked = await pickDocument();
    if (picked) onChange(picked);
  };

  return (
    <View style={styles.wrapper}>
      <Pressable
        testID="upload-file"
        onPress={() => void choose()}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Seleccionar archivo"
        style={[styles.zone, !!error && styles.zoneError]}
      >
        {file ? <FileCheck2 size={28} color={colors.text} strokeWidth={1.5} /> : <CloudUpload size={28} color={colors.text} strokeWidth={1.5} />}
        <AppText variant="bodyStrong" center>
          {file ? file.name : 'Toque para seleccionar un archivo'}
        </AppText>
        <AppText variant="caption" tone="secondary" center>
          {file ? formatFileSize(file.size) : 'PDF, DOCX, JPG o PNG · máximo 10 MB'}
        </AppText>
      </Pressable>
      {file && !disabled ? (
        <Pressable onPress={() => onChange(null)} style={styles.remove} accessibilityLabel="Quitar archivo" hitSlop={8}>
          <X size={16} color={colors.text} />
          <AppText variant="label">Quitar</AppText>
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
  zone: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    minHeight: 150,
  },
  zoneError: { borderColor: colors.dangerText },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
});
