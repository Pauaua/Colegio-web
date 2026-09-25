import { Text, type TextProps } from 'react-native';
import { colors, typography } from '@/theme';

type Variant = keyof typeof typography;
type Tone = 'default' | 'secondary' | 'muted' | 'success' | 'warning' | 'danger';

const toneColor: Record<Tone, string> = {
  default: colors.text,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  success: colors.successText,
  warning: colors.warningText,
  danger: colors.dangerText,
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
}

export function AppText({ variant = 'body', tone = 'default', center, style, ...props }: AppTextProps) {
  return <Text {...props} style={[typography[variant], { color: toneColor[tone] }, center && { textAlign: 'center' }, style]} />;
}
