import { useEffect, useState } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './app-text';
import { Button } from './button';

/** Bloque animado para indicar carga (skeleton loader). */
export function Skeleton({ width = '100%', height = 16, style }: { width?: DimensionValue; height?: number; style?: StyleProp<ViewStyle> }) {
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.skeleton, { width, height, opacity }, style]} />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <View style={styles.list} accessibilityLabel="Cargando" testID="skeleton-list">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.skeletonCard}>
          <Skeleton width="30%" height={14} />
          <Skeleton width="80%" height={18} />
          <Skeleton width="50%" height={14} />
        </View>
      ))}
    </View>
  );
}

/** Estado vacío amable. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  message,
  actionLabel,
  onAction,
  testID,
}: {
  icon?: LucideIcon;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.empty} testID={testID}>
      <View style={styles.emptyIcon}>
        <Icon size={28} color={colors.text} strokeWidth={1.5} />
      </View>
      <AppText variant="subtitle" center>
        {title}
      </AppText>
      {message ? (
        <AppText tone="secondary" center style={styles.emptyMessage}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" compact /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[styles.empty, styles.error]} testID="error-state">
      <AppText variant="bodyStrong" tone="danger" center>
        {message}
      </AppText>
      {onRetry ? <Button label="Reintentar" onPress={onRetry} variant="secondary" compact /> : null}
    </View>
  );
}

export function FullScreenLoader() {
  return (
    <View style={styles.fullscreen}>
      <ActivityIndicator color={colors.focus} size="large" />
    </View>
  );
}

export function ProgressBar({ value, testID }: { value: number; testID?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View
      style={styles.track}
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
    >
      <View style={[styles.bar, { width: `${pct * 100}%` }]} />
    </View>
  );
}

/** Aviso destacado (p. ej. "pendiente de confirmar lectura"). */
export function Banner({
  tone = 'warning',
  title,
  message,
  icon: Icon,
  testID,
  children,
}: {
  tone?: 'warning' | 'success' | 'info' | 'danger';
  title: string;
  message?: string;
  icon?: LucideIcon;
  testID?: string;
  children?: React.ReactNode;
}) {
  const bg = { warning: colors.warning, success: colors.success, info: colors.primarySoft, danger: colors.danger }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} testID={testID} accessibilityRole="alert">
      {Icon ? <Icon size={22} color={colors.text} strokeWidth={1.75} /> : null}
      <View style={styles.bannerText}>
        <AppText variant="bodyStrong">{title}</AppText>
        {message ? <AppText>{message}</AppText> : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { backgroundColor: colors.border, borderRadius: 8 },
  list: { gap: spacing.md },
  skeletonCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.secondarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyMessage: { maxWidth: 380 },
  error: { backgroundColor: colors.danger + '55', borderRadius: radius.md },
  fullscreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: colors.primarySoft, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  banner: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, alignItems: 'flex-start' },
  bannerText: { flex: 1, gap: 4 },
});
