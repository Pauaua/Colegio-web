import { Image } from 'expo-image';
import { FileText } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './app-text';
import { Button } from './button';

export interface FilePreviewProps {
  url: string;
  mimeType: string | null;
  fileName: string | null;
  onOpen: () => void;
}

/** Vista previa en móvil: imágenes en línea; PDF y DOCX se abren en el visor del sistema. */
export function FilePreview({ url, mimeType, fileName, onOpen }: FilePreviewProps) {
  if (mimeType?.startsWith('image/')) {
    return <Image source={{ uri: url }} style={styles.image} contentFit="contain" accessibilityLabel={fileName ?? 'Imagen'} />;
  }
  return (
    <View style={styles.placeholder}>
      <FileText size={36} color={colors.text} strokeWidth={1.25} />
      <AppText variant="bodyStrong" center numberOfLines={2}>
        {fileName}
      </AppText>
      <Button label="Abrir vista previa" variant="secondary" compact onPress={onOpen} testID="doc-preview-open" />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: 360, borderRadius: radius.md, backgroundColor: colors.background },
  placeholder: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.secondarySoft,
  },
});
