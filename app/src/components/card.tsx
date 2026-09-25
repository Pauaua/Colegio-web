import { StyleSheet, View, type ViewProps } from 'react-native';
import { colors, radius, shadow, spacing } from '@/theme';
import { AppText } from './app-text';

export interface CardProps extends ViewProps {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  padded?: boolean;
}

export function Card({ title, subtitle, right, padded = true, style, children, ...props }: CardProps) {
  return (
    <View {...props} style={[styles.card, padded && styles.padded, style]}>
      {title ? (
        <View style={styles.header}>
          <View style={styles.headerText}>
            <AppText variant="subtitle">{title}</AppText>
            {subtitle ? (
              <AppText variant="caption" tone="secondary">
                {subtitle}
              </AppText>
            ) : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  padded: { padding: spacing.xl, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headerText: { flex: 1, gap: 2 },
});
