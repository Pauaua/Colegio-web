import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fonts, gradient, radius, spacing } from '@/theme';
import { AppText } from './app-text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  fullWidth?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const backgrounds: Record<Exclude<Variant, 'primary'>, string> = {
  secondary: colors.surface,
  ghost: 'transparent',
  danger: colors.danger,
  success: colors.success,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon: Icon,
  loading,
  disabled,
  compact,
  fullWidth,
  testID,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const inactive = disabled || loading;
  const content = (
    <View style={[styles.content, compact && styles.compact]}>
      {loading ? (
        <ActivityIndicator size="small" color={colors.text} />
      ) : Icon ? (
        <Icon size={compact ? 16 : 18} color={colors.text} strokeWidth={1.75} />
      ) : null}
      <AppText variant="bodyStrong" style={styles.label}>
        {label}
      </AppText>
    </View>
  );

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed, hovered }) => [
        styles.base,
        variant !== 'primary' && { backgroundColor: backgrounds[variant] },
        variant === 'secondary' && styles.bordered,
        fullWidth && styles.fullWidth,
        (pressed || hovered) && !inactive && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}
    >
      {variant === 'primary' ? (
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, overflow: 'hidden', alignSelf: 'flex-start' },
  fullWidth: { alignSelf: 'stretch' },
  bordered: { borderWidth: 1, borderColor: colors.border },
  gradient: { borderRadius: radius.md },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: 46,
  },
  compact: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 36 },
  label: { fontFamily: fonts.bold },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.55 },
});
