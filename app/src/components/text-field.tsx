import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react-native';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fonts, radius, spacing } from '@/theme';
import { AppText } from './app-text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  /** Muestra un botón para ver/ocultar la contraseña. */
  password?: boolean;
}

export function TextField({ label, error, hint, password, multiline, testID, ...props }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? (
        <AppText variant="label" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View style={[styles.box, focused && styles.focused, !!error && styles.errorBox]}>
        <TextInput
          testID={testID}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={password && !visible}
          multiline={multiline}
          accessibilityLabel={label}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[styles.input, multiline && styles.multiline]}
        />
        {password ? (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            hitSlop={8}
            style={styles.eye}
          >
            {visible ? <EyeOff size={18} color={colors.textSecondary} /> : <Eye size={18} color={colors.textSecondary} />}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" tone="danger" testID={testID ? `${testID}-error` : undefined}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="secondary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs, flexGrow: 1 },
  label: { color: colors.text },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  focused: { borderColor: colors.focus },
  errorBox: { borderColor: colors.dangerText },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 46,
    outlineStyle: 'none',
  } as object,
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  eye: { paddingHorizontal: spacing.md },
});
