import { router } from 'expo-router';
import { CloudUpload, FileSearch, Funnel, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { errorMessage } from '@/api/client';
import { useDocuments, useDocumentTypes, useUsers } from '@/api/queries';
import type { DocumentFilters, DocumentStatus, DocumentItem } from '@/api/types';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChipGroup } from '@/components/chip';
import { DocumentCard, DocumentTableHeader, DocumentTableRow } from '@/components/document-list-item';
import { EmptyState, ErrorState, SkeletonList } from '@/components/feedback';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useIsWide } from '@/hooks/use-layout';
import { DIRECTIVE_ROLES, isDirective, isReader } from '@/lib/roles';
import { useCurrentUser } from '@/store/session';
import { colors, fonts, radius, spacing } from '@/theme';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function DocumentListScreen({ scope: initialScope }: { scope: 'all' | 'mine' }) {
  const user = useCurrentUser();
  const wide = useIsWide();
  const directive = isDirective(user?.role);
  const reader = isReader(user?.role);

  const [scope, setScope] = useState<'all' | 'mine'>(initialScope);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [types, setTypes] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<DocumentStatus[]>([]);
  const [authors, setAuthors] = useState<number[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = useDebouncedValue(search.trim());

  const filters: DocumentFilters = useMemo(
    () => ({
      q: q || undefined,
      type: types[0],
      status: statuses[0],
      authorId: authors[0],
      from: DATE_RE.test(from) ? from : undefined,
      to: DATE_RE.test(to) ? to : undefined,
      scope,
    }),
    [q, types, statuses, authors, from, to, scope],
  );

  const docTypes = useDocumentTypes();
  const authorsQuery = useUsers({}, directive);
  const authorOptions = (authorsQuery.data ?? [])
    .filter((u) => DIRECTIVE_ROLES.includes(u.role))
    .map((u) => ({ value: u.id, label: u.fullName }));

  const { data, error, isLoading, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useDocuments(filters);
  const items: DocumentItem[] = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const activeFilters = [types.length, statuses.length, authors.length, from ? 1 : 0, to ? 1 : 0].reduce((a, b) => a + b, 0);

  const clearFilters = () => {
    setTypes([]);
    setStatuses([]);
    setAuthors([]);
    setFrom('');
    setTo('');
  };

  const header = (
    <View style={[styles.header, wide && items.length > 0 && styles.headerTable]}>
      {reader ? (
        <ChipGroup
          testIDPrefix="scope"
          options={[
            { value: 'all', label: 'Todos los documentos' },
            { value: 'mine', label: user?.role === 'APODERADO' ? 'Para mí y mis pupilos' : 'Dirigidos a mí' },
          ]}
          value={[scope]}
          onChange={(v) => setScope((v[0] as 'all' | 'mine') ?? 'all')}
        />
      ) : null}

      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Search size={18} color={colors.textSecondary} />
          <TextInput
            testID="doc-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por título o folio"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            accessibilityLabel="Buscar por título o folio"
            returnKeyType="search"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} accessibilityLabel="Limpiar búsqueda" hitSlop={8}>
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <Button
          testID="doc-filters-toggle"
          label={activeFilters ? `Filtros (${activeFilters})` : 'Filtros'}
          icon={Funnel}
          variant="secondary"
          onPress={() => setShowFilters((s) => !s)}
        />
      </View>

      {showFilters ? (
        <View style={styles.filters} testID="doc-filters">
          <FilterBlock label="Tipo">
            <ChipGroup
              testIDPrefix="filter-type"
              options={(docTypes.data ?? []).map((t) => ({ value: t.code, label: t.name }))}
              value={types}
              onChange={setTypes}
            />
          </FilterBlock>
          <FilterBlock label="Estado">
            <ChipGroup
              testIDPrefix="filter-status"
              options={[
                { value: 'VIGENTE' as DocumentStatus, label: 'Vigente' },
                { value: 'ARCHIVADO' as DocumentStatus, label: 'Archivado' },
              ]}
              value={statuses}
              onChange={setStatuses}
            />
          </FilterBlock>
          {directive && authorOptions.length ? (
            <FilterBlock label="Autor">
              <ChipGroup testIDPrefix="filter-author" options={authorOptions} value={authors} onChange={setAuthors} />
            </FilterBlock>
          ) : null}
          <FilterBlock label="Rango de fechas">
            <View style={styles.dates}>
              <TextField testID="filter-from" placeholder="Desde AAAA-MM-DD" value={from} onChangeText={setFrom} maxLength={10} />
              <TextField testID="filter-to" placeholder="Hasta AAAA-MM-DD" value={to} onChangeText={setTo} maxLength={10} />
            </View>
          </FilterBlock>
          {activeFilters ? <Button label="Limpiar filtros" variant="ghost" compact onPress={clearFilters} /> : null}
        </View>
      ) : null}

      {!isLoading && !error ? (
        <AppText variant="caption" tone="secondary" testID="doc-count">
          {total === 1 ? '1 documento' : `${total} documentos`}
        </AppText>
      ) : null}
      {wide && items.length > 0 ? <DocumentTableHeader /> : null}
    </View>
  );

  return (
    <Screen
      title={scope === 'mine' ? 'Mis documentos' : 'Documentos'}
      subtitle={scope === 'mine' ? 'Lo dirigido a usted o a sus pupilos' : 'Documentos institucionales disponibles para su perfil'}
      actions={
        directive ? (
          <Button testID="doc-upload" label="Subir documento" icon={CloudUpload} onPress={() => router.navigate('/panel/documentos/subir')} />
        ) : undefined
      }
      scroll={false}
      testID="documents-screen"
    >
      <FlatList
        data={isLoading || error ? [] : items}
        keyExtractor={(d) => String(d.id)}
        renderItem={({ item }) =>
          wide ? <DocumentTableRow doc={item} showAck={reader} /> : <DocumentCard doc={item} showAck={reader} />
        }
        ListHeaderComponent={header}
        ListEmptyComponent={
          isLoading ? (
            <SkeletonList rows={5} />
          ) : error ? (
            <ErrorState message={errorMessage(error, 'No se pudieron cargar los documentos')} onRetry={() => void refetch()} />
          ) : (
            <EmptyState
              icon={FileSearch}
              title="No encontramos documentos"
              message={q || activeFilters ? 'Pruebe con otra búsqueda o quite algunos filtros.' : 'Aún no hay documentos disponibles para su perfil.'}
              testID="documents-empty"
            />
          )
        }
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.focus} /> : <View style={styles.footer} />}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={isRefetching && !isFetchingNextPage} onRefresh={() => void refetch()} />}
        contentContainerStyle={[styles.listContent, wide && styles.listWide]}
        ItemSeparatorComponent={wide ? undefined : () => <View style={styles.separator} />}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.filterBlock}>
      <AppText variant="label">{label}</AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, paddingBottom: spacing.md },
  headerTable: { paddingBottom: 0 },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.text, paddingVertical: spacing.sm, outlineStyle: 'none' } as object,
  filters: {
    gap: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBlock: { gap: spacing.sm },
  dates: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  listContent: { padding: spacing.lg, flexGrow: 1 },
  listWide: { paddingHorizontal: spacing.xxl, paddingTop: 0 },
  separator: { height: spacing.md },
  footer: { height: spacing.xxxl, marginTop: spacing.md },
});
