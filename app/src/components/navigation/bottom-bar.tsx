import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/app-text';
import { useCurrentUser } from '@/store/session';
import { colors, fonts, radius, spacing } from '@/theme';
import { isNavItemActive, NAV_ITEMS } from './nav-items';

/** Tabs inferiores del móvil, filtradas por rol. */
export function BottomBar() {
  const user = useCurrentUser();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  if (!user) return null;
  const items = NAV_ITEMS.filter((i) => i.mobileRoles.includes(user.role));

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]} accessibilityRole="tablist">
      {items.map((item) => {
        const active = isNavItemActive(item, pathname);
        const Icon = item.icon;
        return (
          <Pressable
            key={item.key}
            testID={`nav-${item.key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            onPress={() => router.navigate(item.href as never)}
            style={styles.tab}
          >
            <View style={[styles.iconWrap, active && styles.iconActive]}>
              <Icon size={22} color={colors.text} strokeWidth={active ? 2 : 1.5} />
            </View>
            <AppText variant="caption" style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  iconWrap: { paddingHorizontal: spacing.lg, paddingVertical: 4, borderRadius: radius.pill },
  iconActive: { backgroundColor: colors.primarySoft },
  label: { fontSize: 11, color: colors.textSecondary },
  labelActive: { color: colors.text, fontFamily: fonts.bold },
});
