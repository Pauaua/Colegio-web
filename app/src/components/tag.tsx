import { StyleSheet, View } from 'react-native';
import type { DocumentStatus, Role } from '@/api/types';
import { ROLE_LABELS, STATUS_LABELS } from '@/lib/roles';
import { colors, documentTypeColors, radius, spacing } from '@/theme';
import { AppText } from './app-text';

export function Tag({ label, color, testID }: { label: string; color: string; testID?: string }) {
  return (
    <View testID={testID} style={[styles.tag, { backgroundColor: color }]}>
      <AppText variant="label" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

export function DocumentTypeTag({ code, name }: { code: string; name: string }) {
  return <Tag label={name} color={documentTypeColors[code] ?? colors.primarySoft} />;
}

export function StatusTag({ status }: { status: DocumentStatus }) {
  return <Tag label={STATUS_LABELS[status]} color={status === 'VIGENTE' ? colors.success : colors.border} />;
}

const roleColors: Record<Role, string> = {
  DIRECTOR: colors.secondary,
  SOSTENEDOR: colors.accent,
  EQUIPO_DIRECTIVO: colors.primary,
  DOCENTE: colors.success,
  APODERADO: colors.warning,
};

export function RoleTag({ role, testID }: { role: Role; testID?: string }) {
  return <Tag label={ROLE_LABELS[role]} color={roleColors[role]} testID={testID} />;
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
});
