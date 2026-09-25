import { Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { User } from '@/api/types';
import { ROLE_LABELS } from '@/lib/roles';
import { colors, fonts, radius, spacing } from '@/theme';
import { AppText } from './app-text';
import { Chip } from './chip';

/** Selección múltiple de usuarios con buscador (destinatarios específicos). */
export function UserPicker({ users, value, onChange }: { users: User[]; value: number[]; onChange: (ids: number[]) => void }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? users.filter((u) => `${u.fullName} ${u.email}`.toLowerCase().includes(q)) : users;
    return list.slice(0, 30);
  }, [users, query]);
  const selected = users.filter((u) => value.includes(u.id));
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <View style={styles.wrapper}>
      {selected.length ? (
        <View style={styles.row}>
          {selected.map((u) => (
            <Chip key={u.id} label={u.fullName} selected onPress={() => toggle(u.id)} testID={`recipient-selected-${u.id}`} />
          ))}
        </View>
      ) : null}
      <View style={styles.search}>
        <Search size={16} color={colors.textSecondary} />
        <TextInput
          testID="recipient-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por nombre o email"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          accessibilityLabel="Buscar destinatario"
        />
      </View>
      <View style={styles.row}>
        {filtered
          .filter((u) => !value.includes(u.id))
          .map((u) => (
            <Chip key={u.id} label={`${u.fullName} · ${ROLE_LABELS[u.role]}`} onPress={() => toggle(u.id)} testID={`recipient-${u.id}`} />
          ))}
      </View>
      {!filtered.length ? (
        <AppText variant="caption" tone="secondary">
          Sin resultados.
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.text, paddingVertical: spacing.sm, outlineStyle: 'none' } as object,
});
