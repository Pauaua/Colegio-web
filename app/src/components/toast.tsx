import { useEffect, useState } from 'react';
import { CircleCheck, Info, TriangleAlert } from 'lucide-react-native';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { colors, radius, shadow, spacing } from '@/theme';
import { AppText } from './app-text';

type ToastTone = 'success' | 'error' | 'info';

interface ToastState {
  message: string | null;
  tone: ToastTone;
  key: number;
  show: (message: string, tone?: ToastTone) => void;
  hide: () => void;
}

const useToastStore = create<ToastState>((set) => ({
  message: null,
  tone: 'info',
  key: 0,
  show: (message, tone = 'info') => set((s) => ({ message, tone, key: s.key + 1 })),
  hide: () => set({ message: null }),
}));

/** Muestra un toast suave desde cualquier parte de la app. */
export const toast = {
  success: (message: string) => useToastStore.getState().show(message, 'success'),
  error: (message: string) => useToastStore.getState().show(message, 'error'),
  info: (message: string) => useToastStore.getState().show(message, 'info'),
};

const toneStyle: Record<ToastTone, { bg: string; Icon: typeof Info }> = {
  success: { bg: colors.success, Icon: CircleCheck },
  error: { bg: colors.danger, Icon: TriangleAlert },
  info: { bg: colors.primarySoft, Icon: Info },
};

export function ToastHost() {
  const { message, tone, key, hide } = useToastStore();
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const id = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => hide());
    }, 3200);
    return () => clearTimeout(id);
  }, [key, message, hide, opacity]);

  if (!message) return null;
  const { bg, Icon } = toneStyle[tone];
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing.lg }]}>
      <Animated.View style={{ opacity }}>
        <Pressable onPress={hide} style={[styles.toast, { backgroundColor: bg }]} testID="toast" accessibilityRole="alert">
          <Icon size={18} color={colors.text} strokeWidth={1.75} />
          <AppText variant="bodyStrong" style={styles.text}>
            {message}
          </AppText>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: spacing.lg, zIndex: 1000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    maxWidth: 520,
    ...shadow,
  },
  text: { flexShrink: 1 },
});
