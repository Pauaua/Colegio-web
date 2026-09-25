import { router } from 'expo-router';
import { ChevronRight, Clock, Paperclip } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import type { DocumentItem } from '@/api/types';
import { formatShortDate } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './app-text';
import { DocumentTypeTag, StatusTag, Tag } from './tag';

const open = (id: number) => router.push(`/panel/documentos/${id}` as never);

/** Indica si el lector aún debe confirmar la lectura. */
const pendingAck = (doc: DocumentItem, showAck: boolean) => showAck && doc.requiresAcknowledgement && !doc.myAcknowledgedAt;

/** Tarjeta de documento (móvil). */
export function DocumentCard({ doc, showAck = false }: { doc: DocumentItem; showAck?: boolean }) {
  return (
    <Pressable
      testID={`doc-row-${doc.id}`}
      onPress={() => open(doc.id)}
      accessibilityRole="button"
      accessibilityLabel={`${doc.title}, ${doc.documentType.name}, ${formatShortDate(doc.documentDate)}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardTop}>
        <DocumentTypeTag code={doc.documentType.code} name={doc.documentType.name} />
        <AppText variant="caption" tone="secondary">
          {formatShortDate(doc.documentDate)}
        </AppText>
      </View>
      <AppText variant="bodyStrong" numberOfLines={2}>
        {doc.title}
      </AppText>
      <View style={styles.meta}>
        <AppText variant="caption" tone="secondary">
          Folio {doc.folioNumber} · {doc.author.fullName}
        </AppText>
        {doc.file ? <Paperclip size={14} color={colors.textSecondary} /> : null}
      </View>
      <View style={styles.tags}>
        {doc.status === 'ARCHIVADO' ? <StatusTag status={doc.status} /> : null}
        {pendingAck(doc, showAck) ? <Tag label="Pendiente de confirmar" color={colors.warning} /> : null}
      </View>
    </Pressable>
  );
}

/** Encabezado de la tabla (web / pantallas anchas). */
export function DocumentTableHeader() {
  return (
    <View style={[styles.row, styles.headerRow]} accessibilityRole="header">
      <AppText variant="label" style={styles.colTitle}>
        Título
      </AppText>
      <AppText variant="label" style={styles.colType}>
        Tipo
      </AppText>
      <AppText variant="label" style={styles.colFolio}>
        Folio
      </AppText>
      <AppText variant="label" style={styles.colDate}>
        Fecha
      </AppText>
      <AppText variant="label" style={styles.colAuthor}>
        Autor
      </AppText>
      <AppText variant="label" style={styles.colStatus}>
        Estado
      </AppText>
      <View style={styles.colChevron} />
    </View>
  );
}

/** Fila de la tabla (web / pantallas anchas). */
export function DocumentTableRow({ doc, showAck = false }: { doc: DocumentItem; showAck?: boolean }) {
  return (
    <Pressable
      testID={`doc-row-${doc.id}`}
      onPress={() => open(doc.id)}
      accessibilityRole="link"
      style={({ hovered }) => [styles.row, hovered && styles.rowHover]}
    >
      <View style={[styles.colTitle, styles.titleCell]}>
        <AppText variant="bodyStrong" numberOfLines={1} style={styles.shrink}>
          {doc.title}
        </AppText>
        {doc.file ? <Paperclip size={14} color={colors.textSecondary} /> : null}
        {pendingAck(doc, showAck) ? <Clock size={14} color={colors.warningText} accessibilityLabel="Pendiente de confirmar lectura" /> : null}
      </View>
      <View style={styles.colType}>
        <DocumentTypeTag code={doc.documentType.code} name={doc.documentType.name} />
      </View>
      <AppText tone="secondary" numberOfLines={1} style={styles.colFolio}>
        {doc.folioNumber}
      </AppText>
      <AppText tone="secondary" style={styles.colDate}>
        {formatShortDate(doc.documentDate)}
      </AppText>
      <AppText tone="secondary" numberOfLines={1} style={styles.colAuthor}>
        {doc.author.fullName}
      </AppText>
      <View style={styles.colStatus}>
        <StatusTag status={doc.status} />
      </View>
      <View style={styles.colChevron}>
        <ChevronRight size={18} color={colors.textSecondary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pressed: { backgroundColor: colors.primarySoft },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between' },
  tags: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerRow: { backgroundColor: colors.secondarySoft, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  rowHover: { backgroundColor: colors.background },
  titleCell: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  shrink: { flexShrink: 1 },
  colTitle: { flex: 3 },
  colType: { flex: 1.5, minWidth: 0 },
  colFolio: { flex: 1.35, minWidth: 118 },
  colDate: { flex: 1, minWidth: 90 },
  colAuthor: { flex: 1.5 },
  colStatus: { flex: 0.9 },
  colChevron: { width: 20 },
});
