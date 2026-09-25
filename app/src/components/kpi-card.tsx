import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { colors, radius, shadow, spacing } from '@/theme';
import { AppText } from './app-text';

export function KpiCard({
  label,
  value,
  icon: Icon,
  tint = colors.primarySoft,
  testID,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tint?: string;
  testID?: string;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={[styles.icon, { backgroundColor: tint }]}>
        <Icon size={20} color={colors.text} strokeWidth={1.75} />
      </View>
      <AppText variant="kpi" testID={testID ? `${testID}-value` : undefined}>
        {value}
      </AppText>
      <AppText variant="label" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: 160,
    gap: spacing.xs,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  icon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
});
