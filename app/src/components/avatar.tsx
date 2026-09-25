import { StyleSheet, View } from 'react-native';
import { initials } from '@/lib/format';
import { colors } from '@/theme';
import { AppText } from './app-text';

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]} accessibilityElementsHidden>
      <AppText variant="bodyStrong">{initials(name)}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { backgroundColor: colors.secondarySoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
});
