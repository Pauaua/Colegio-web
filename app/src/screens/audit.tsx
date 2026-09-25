import { router } from 'expo-router';
import { Download, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/client';
import { useAuditActions, useAuditLogs, useDownloadLogs } from '@/api/queries';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChipGroup } from '@/components/chip';
import { EmptyState, ErrorState, SkeletonList } from '@/components/feedback';
import { RequireRole } from '@/components/require-role';
import { Screen } from '@/components/screen';
import { RoleTag } from '@/components/tag';
import { TextField } from '@/components/text-field';
import { formatDateTime } from '@/lib/format';
import { actionLabel, DIRECTIVE_ROLES } from '@/lib/roles';
import { colors, spacing } from '@/theme';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function AuditScreen() {
  const [tab, setTab] = useState<'actions' | 'downloads'>('actions');
  const [action, setAction] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const range = { from: DATE_RE.test(from) ? from : undefined, to: DATE_RE.test(to) ? to : undefined };

  return (
    <RequireRole roles={DIRECTIVE_ROLES}>
      <Screen title="Auditoría" subtitle="Registro de descargas y acciones realizadas en el sistema" testID="audit-screen">
        <ChipGroup
          testIDPrefix="audit-tab"
          options={[
            { value: 'actions', label: 'Acciones' },
            { value: 'downloads', label: 'Descargas' },
          ]}
          value={[tab]}
          onChange={(v) => v[0] && setTab(v[0] as 'actions' | 'downloads')}
        />
        <Card title="Filtros">
          <View style={styles.row}>
            <TextField testID="audit-from" label="Desde" placeholder="AAAA-MM-DD" maxLength={10} value={from} onChangeText={setFrom} />
            <TextField testID="audit-to" label="Hasta" placeholder="AAAA-MM-DD" maxLength={10} value={to} onChangeText={setTo} />
          </View>
          {tab === 'actions' ? <ActionFilter value={action} onChange={setAction} /> : null}
        </Card>
        {tab === 'actions' ? <ActionsLog filters={{ ...range, action: action[0] }} /> : <DownloadsLog filters={range} />}
      </Screen>
    </RequireRole>
  );
}

function ActionFilter({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data } = useAuditActions();
  return (
    <View style={styles.block}>
      <AppText variant="label">Tipo de acción</AppText>
      <ChipGroup testIDPrefix="audit-action" options={(data ?? []).map((a) => ({ value: a, label: actionLabel(a) }))} value={value} onChange={onChange} />
    </View>
  );
}

function LoadMore({ hasNext, loading, onPress }: { hasNext: boolean; loading: boolean; onPress: () => void }) {
  if (loading) return <ActivityIndicator color={colors.focus} />;
  if (!hasNext) return null;
  return <Button label="Cargar más" variant="secondary" compact onPress={onPress} />;
}

function ActionsLog({ filters }: { filters: { action?: string; from?: string; to?: string } }) {
  const q = useAuditLogs(filters);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (q.isLoading) return <SkeletonList rows={4} />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  if (!items.length) return <EmptyState icon={ShieldCheck} title="No hay acciones registradas con esos filtros" />;
  return (
    <Card title="Acciones" subtitle={`${q.data?.pages[0]?.total ?? 0} registros`} testID="audit-actions">
      {items.map((a) => (
        <View key={a.id} style={styles.entry}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{actionLabel(a.action)}</AppText>
            <AppText variant="caption" tone="secondary">
              {a.user?.fullName ?? 'Sin usuario identificado'} · {formatDateTime(a.createdAt)}
              {a.entity === 'Document' && a.entityId ? ` · Documento #${a.entityId}` : ''}
            </AppText>
          </View>
          {a.user ? <RoleTag role={a.user.role} /> : null}
        </View>
      ))}
      <LoadMore hasNext={!!q.hasNextPage} loading={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()} />
    </Card>
  );
}

function DownloadsLog({ filters }: { filters: { from?: string; to?: string } }) {
  const q = useDownloadLogs(filters);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (q.isLoading) return <SkeletonList rows={4} />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  if (!items.length) return <EmptyState icon={Download} title="No hay descargas registradas con esos filtros" />;
  return (
    <Card title="Descargas" subtitle={`${q.data?.pages[0]?.total ?? 0} registros`} testID="audit-downloads">
      {items.map((d) => (
        <Pressable key={d.id} style={styles.entry} onPress={() => router.push(`/panel/documentos/${d.document.id}` as never)} accessibilityRole="link">
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{d.document.title}</AppText>
            <AppText variant="caption" tone="secondary">
              {d.user.fullName} · {formatDateTime(d.downloadedAt)} · Folio {d.document.folioNumber}
              {d.ipAddress ? ` · IP ${d.ipAddress}` : ''}
            </AppText>
          </View>
          <RoleTag role={d.user.role} />
        </Pressable>
      ))}
      <LoadMore hasNext={!!q.hasNextPage} loading={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  block: { gap: spacing.sm },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
