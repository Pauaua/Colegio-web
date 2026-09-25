import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './app-text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
}

export function Chip({ label, selected, onPress, testID }: ChipProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!selected }}
      style={({ hovered }) => [styles.chip, selected && styles.selected, hovered && !selected && styles.hovered]}
    >
      {selected ? <Check size={14} color={colors.text} strokeWidth={2} /> : null}
      <AppText variant="label">{label}</AppText>
    </Pressable>
  );
}

/** Grupo de chips de selección única o múltiple. */
export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  multiple,
  testIDPrefix,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (value: T[]) => void;
  multiple?: boolean;
  testIDPrefix?: string;
}) {
  const toggle = (v: T) => {
    if (multiple) onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
    else onChange(value.includes(v) ? [] : [v]);
  };
  return (
    <View style={styles.group}>
      {options.map((o) => (
        <Chip
          key={String(o.value)}
          label={o.label}
          selected={value.includes(o.value)}
          onPress={() => toggle(o.value)}
          testID={testIDPrefix ? `${testIDPrefix}-${o.value}` : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  hovered: { backgroundColor: colors.background },
});
