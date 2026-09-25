import { FileText } from 'lucide-react-native';
import { createElement } from 'react';
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

/** Vista previa en web: PDF en un iframe e imágenes en línea; DOCX se abre en otra pestaña. */
export function FilePreview({ url, mimeType, fileName, onOpen }: FilePreviewProps) {
  if (mimeType === 'application/pdf') {
    return (
      <View style={styles.frame} testID="doc-preview">
        {createElement('iframe', {
          src: url,
          title: fileName ?? 'Vista previa',
          style: { width: '100%', height: '100%', border: 'none', borderRadius: radius.md },
        })}
      </View>
    );
  }
  if (mimeType?.startsWith('image/')) {
    return (
      <View style={styles.imageWrap} testID="doc-preview">
        {createElement('img', {
          src: url,
          alt: fileName ?? 'Imagen',
          style: { maxWidth: '100%', maxHeight: 520, borderRadius: radius.md, objectFit: 'contain' },
        })}
      </View>
    );
  }
  return (
    <View style={styles.placeholder}>
      <FileText size={36} color={colors.text} strokeWidth={1.25} />
      <AppText variant="bodyStrong" center>
        {fileName}
      </AppText>
      <Button label="Abrir en otra pestaña" variant="secondary" compact onPress={onOpen} testID="doc-preview-open" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', height: 560, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  imageWrap: { alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md },
  placeholder: { alignItems: 'center', gap: spacing.md, padding: spacing.xl, borderRadius: radius.md, backgroundColor: colors.secondarySoft },
});
