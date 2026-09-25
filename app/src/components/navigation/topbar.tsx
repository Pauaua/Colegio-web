import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/app-text';
import { Avatar } from '@/components/avatar';
import { RoleTag } from '@/components/tag';
import { useCurrentUser } from '@/store/session';
import { colors, spacing } from '@/theme';

/** Barra superior (web y pantallas anchas) con el nombre y el rol del usuario. */
export function Topbar() {
  const user = useCurrentUser();
  if (!user) return null;
  return (
    <View style={styles.bar} testID="topbar">
      <AppText variant="caption" tone="secondary" style={styles.school}>
        Escuela Básica G-733 Chorombo Bajo · María Pinto
      </AppText>
      <View style={styles.user}>
        <View style={styles.userText}>
          <AppText variant="bodyStrong" testID="user-name">
            {user.fullName}
          </AppText>
          <RoleTag role={user.role} testID="user-role" />
        </View>
        <Avatar name={user.fullName} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.lg,
  },
  school: { flexShrink: 1 },
  user: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  userText: { alignItems: 'flex-end', gap: 4 },
});
