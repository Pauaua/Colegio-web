import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import { FolderOpen, LogOut } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/app-text';
import { useLogout } from '@/hooks/use-logout';
import { useCurrentUser } from '@/store/session';
import { colors, gradient, radius, spacing } from '@/theme';
import { isNavItemActive, NAV_ITEMS } from './nav-items';

/** Sidebar lateral (web y pantallas anchas) con degradado celeste → lavanda. */
export function Sidebar() {
  const user = useCurrentUser();
  const pathname = usePathname();
  const logout = useLogout();
  if (!user) return null;
  const items = NAV_ITEMS.filter((i) => i.roles.includes(user.role));

  return (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={styles.sidebar}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <FolderOpen size={22} color={colors.text} strokeWidth={1.75} />
        </View>
        <View style={styles.brandText}>
          <AppText variant="subtitle">Gestor Documental</AppText>
          <AppText variant="caption" tone="secondary">
            Esc. Básica G-733 Chorombo Bajo
          </AppText>
        </View>
      </View>

      <View style={styles.nav} accessibilityRole="menu">
        {items.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.icon;
          return (
            <Pressable
              key={item.key}
              testID={`nav-${item.key}`}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: active }}
              onPress={() => router.navigate(item.href as never)}
              style={({ hovered }) => [styles.item, active && styles.itemActive, hovered && !active && styles.itemHover]}
            >
              <Icon size={20} color={colors.text} strokeWidth={active ? 2 : 1.5} />
              <AppText variant={active ? 'bodyStrong' : 'body'}>{item.label}</AppText>
            </Pressable>
          );
        })}
      </View>

      <Pressable testID="nav-logout" onPress={logout} style={({ hovered }) => [styles.item, hovered && styles.itemHover]} accessibilityRole="button">
        <LogOut size={20} color={colors.text} strokeWidth={1.5} />
        <AppText>Cerrar sesión</AppText>
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  sidebar: { width: 264, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, gap: spacing.xl, borderRightWidth: 1, borderRightColor: colors.border },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.sm },
  logo: { width: 42, height: 42, borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  brandText: { flex: 1 },
  nav: { flex: 1, gap: spacing.xs },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  itemActive: { backgroundColor: colors.primarySoft },
  itemHover: { backgroundColor: 'rgba(255, 255, 255, 0.45)' },
});
