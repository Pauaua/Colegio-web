import { router } from 'expo-router';
import { BellRing, CalendarDays, CloudDownload, CloudUpload, FileText, Inbox, UserRound } from 'lucide-react-native';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/client';
import { useDashboard } from '@/api/queries';
import type { ActivityEntry, DocumentItem, GlobalDashboard, PersonalDashboard } from '@/api/types';
import { AppText } from '@/components/app-text';
import { BarChartCard } from '@/components/bar-chart-card';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DocumentCard } from '@/components/document-list-item';
import { Banner, EmptyState, ErrorState, Skeleton, SkeletonList } from '@/components/feedback';
import { KpiCard } from '@/components/kpi-card';
import { Screen } from '@/components/screen';
import { RoleTag } from '@/components/tag';
import { useIsWide } from '@/hooks/use-layout';
import { formatDateTime } from '@/lib/format';
import { actionLabel, isDirective } from '@/lib/roles';
import { useCurrentUser } from '@/store/session';
import { colors, documentTypeColors, spacing } from '@/theme';

export function DashboardScreen() {
  const user = useCurrentUser();
  const wide = useIsWide();
  const { data, isLoading, error, refetch, isRefetching } = useDashboard();
  const firstName = user?.fullName.split(' ')[0] ?? '';

  return (
    <Screen
      title={`Hola, ${firstName}`}
      subtitle={isDirective(user?.role) ? 'Resumen de la gestión documental de la escuela' : 'Sus documentos y comunicados'}
      actions={!wide && user ? <RoleTag role={user.role} testID="user-role" /> : undefined}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      testID="dashboard-screen"
    >
      {isLoading ? (
        <DashboardSkeleton />
      ) : error || !data ? (
        <ErrorState message={errorMessage(error, 'No se pudo cargar el resumen')} onRetry={() => void refetch()} />
      ) : data.scope === 'global' ? (
        <DirectiveDashboard data={data} />
      ) : (
        <ReaderDashboard data={data} />
      )}
    </Screen>
  );
}

function DashboardSkeleton() {
  return (
    <View style={styles.gap}>
      <View style={styles.kpis}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={110} style={styles.kpiSkeleton} />
        ))}
      </View>
      <SkeletonList rows={3} />
    </View>
  );
}

function DocumentList({ docs, emptyTitle, showAck }: { docs: DocumentItem[]; emptyTitle: string; showAck?: boolean }) {
  if (docs.length === 0) return <EmptyState title={emptyTitle} />;
  return (
    <View style={styles.list}>
      {docs.map((d) => (
        <DocumentCard key={d.id} doc={d} showAck={showAck} />
      ))}
    </View>
  );
}

function DirectiveDashboard({ data }: { data: GlobalDashboard }) {
  const { kpis } = data;
  return (
    <View style={styles.gap} testID="dashboard-directive">
      <View style={styles.kpis}>
        <KpiCard testID="kpi-total" label="Documentos en total" value={kpis.totalDocuments} icon={FileText} tint={colors.primarySoft} />
        <KpiCard testID="kpi-month" label="Subidos este mes" value={kpis.uploadedThisMonth} icon={CloudUpload} tint={colors.secondarySoft} />
        <KpiCard testID="kpi-downloads" label="Descargas del mes" value={kpis.downloadsThisMonth} icon={CloudDownload} tint={colors.success} />
        <KpiCard testID="kpi-pending" label="Acuses pendientes" value={kpis.pendingAcknowledgements} icon={BellRing} tint={colors.warning} />
      </View>

      <View style={styles.row}>
        <BarChartCard
          testID="chart-by-type"
          title="Documentos por tipo"
          data={data.byType.map((t) => ({ label: t.name.split(' ')[0] ?? t.name, value: t.count, color: documentTypeColors[t.code] ?? t.color }))}
        />
        <BarChartCard
          testID="chart-by-month"
          title="Documentos por mes"
          subtitle={`Año ${data.byMonth[0]?.month.slice(0, 4) ?? ''}`}
          data={data.byMonth.map((m, i) => ({ label: m.label, value: m.count, color: i % 2 ? colors.secondary : colors.primary }))}
        />
      </View>

      <View style={styles.row}>
        <Card
          title="Últimos documentos subidos"
          style={styles.flexCard}
          right={<Button label="Ver todos" variant="ghost" compact onPress={() => router.navigate('/panel/documentos')} />}
        >
          <DocumentList docs={data.latestDocuments} emptyTitle="Aún no hay documentos" />
        </Card>
        <Card title="Actividad reciente" style={styles.flexCard}>
          <ActivityList items={data.recentActivity} />
        </Card>
      </View>
    </View>
  );
}

function ActivityList({ items }: { items: ActivityEntry[] }) {
  if (items.length === 0) return <EmptyState title="Sin actividad reciente" />;
  return (
    <View style={styles.list}>
      {items.map((a) => (
        <View key={a.id} style={styles.activity}>
          <View style={styles.dot} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{actionLabel(a.action)}</AppText>
            <AppText variant="caption" tone="secondary">
              {a.user?.fullName ?? 'Usuario no identificado'} · {formatDateTime(a.createdAt)}
            </AppText>
          </View>
        </View>
      ))}
    </View>
  );
}

function ReaderDashboard({ data }: { data: PersonalDashboard }) {
  const user = useCurrentUser();
  const pending = data.pendingAcknowledgements;
  return (
    <View style={styles.gap} testID="dashboard-reader">
      {pending.length > 0 ? (
        <Banner
          tone="warning"
          icon={BellRing}
          testID="pending-ack-banner"
          title={pending.length === 1 ? 'Tiene 1 documento pendiente de confirmar lectura' : `Tiene ${pending.length} documentos pendientes de confirmar lectura`}
          message="Ábralos y presione «Confirmar lectura» para avisar a la escuela."
        />
      ) : (
        <Banner tone="success" title="Está al día: no tiene lecturas pendientes" />
      )}

      <View style={styles.kpis}>
        <KpiCard testID="kpi-visible" label="Documentos disponibles" value={data.kpis.totalVisible} icon={FileText} />
        <KpiCard testID="kpi-directed" label="Dirigidos a usted" value={data.kpis.directedToMe} icon={Inbox} tint={colors.secondarySoft} />
        <KpiCard testID="kpi-pending" label="Por confirmar" value={data.kpis.pendingAcknowledgements} icon={BellRing} tint={colors.warning} />
      </View>

      {data.pupils.length > 0 ? (
        <Card title="Mis pupilos">
          {data.pupils.map((p) => (
            <View key={p.id} style={styles.pupil}>
              <UserRound size={18} color={colors.text} />
              <AppText variant="bodyStrong">{p.fullName}</AppText>
              <AppText tone="secondary">· {p.course}</AppText>
            </View>
          ))}
        </Card>
      ) : null}

      {pending.length > 0 ? (
        <Card title="Pendientes de confirmar lectura">
          <DocumentList docs={pending} emptyTitle="" showAck />
        </Card>
      ) : null}

      <View style={styles.row}>
        <Card
          title={user?.role === 'APODERADO' ? 'Citaciones y comunicados para usted' : 'Dirigidos a usted'}
          style={styles.flexCard}
          right={<Button label="Ver todos" variant="ghost" compact onPress={() => router.navigate('/panel/mis-documentos')} />}
        >
          <DocumentList docs={data.directedToMe} emptyTitle="No hay documentos dirigidos a usted" showAck />
        </Card>
        <Card title="Documentos recientes" style={styles.flexCard} right={<CalendarDays size={18} color={colors.textSecondary} />}>
          <DocumentList docs={data.recentDocuments} emptyTitle="Aún no hay documentos" showAck />
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.xl },
  flex: { flex: 1 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  kpiSkeleton: { flexGrow: 1, flexBasis: 160, borderRadius: 20 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  flexCard: { flexGrow: 1, flexBasis: 340 },
  list: { gap: spacing.md },
  activity: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent, marginTop: 6 },
  pupil: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
