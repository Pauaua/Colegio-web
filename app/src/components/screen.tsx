import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsWide } from '@/hooks/use-layout';
import { colors, CONTENT_MAX_WIDTH, gradient, radius, spacing } from '@/theme';
import { AppText } from './app-text';

export interface ScreenProps {
  title: string;
  subtitle?: string;
  /** Botones a la derecha del título. */
  actions?: React.ReactNode;
  /** Muestra "volver" (pantallas de detalle). */
  back?: boolean;
  /** false cuando el contenido ya es una lista con scroll propio (FlatList). */
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  testID?: string;
  children: React.ReactNode;
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/panel');
}

/** Contenedor de cada pantalla: encabezado con degradado en móvil y contenido centrado en web. */
export function Screen({ title, subtitle, actions, back, scroll = true, refreshControl, testID, children }: ScreenProps) {
  const wide = useIsWide();
  const insets = useSafeAreaInsets();

  const header = (
    <View style={[styles.headerRow, wide && styles.headerRowWide]}>
      <View style={styles.titleWrap}>
        {back ? (
          <Pressable onPress={goBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Volver" testID="nav-back">
            <ChevronLeft size={20} color={colors.text} />
            <AppText variant="label">Volver</AppText>
          </Pressable>
        ) : null}
        <AppText variant={wide ? 'display' : 'title'} accessibilityRole="header" testID="screen-title">
          {title}
        </AppText>
        {subtitle ? <AppText tone="secondary">{subtitle}</AppText> : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );

  const body = <View style={[styles.content, wide && styles.contentWide]}>{children}</View>;

  return (
    <View style={styles.root} testID={testID}>
      {!wide ? (
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.mobileHeader, { paddingTop: insets.top + spacing.lg }]}>
          {header}
        </LinearGradient>
      ) : null}
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={refreshControl} keyboardShouldPersistTaps="handled">
          <View style={styles.center}>
            {wide ? header : null}
            {body}
          </View>
        </ScrollView>
      ) : (
        <View style={[styles.center, styles.flex]}>
          {wide ? header : null}
          <View style={[styles.flex, !wide && styles.flatMobile]}>{children}</View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  mobileHeader: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' },
  headerRowWide: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl, paddingBottom: spacing.lg },
  titleWrap: { flexShrink: 1, gap: 4 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: spacing.xs, alignSelf: 'flex-start' },
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  scroll: { flexGrow: 1, paddingBottom: spacing.xxxl },
  center: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  content: { padding: spacing.lg, gap: spacing.lg },
  contentWide: { paddingHorizontal: spacing.xxl, paddingTop: 0, gap: spacing.xl },
  flatMobile: { paddingTop: spacing.sm },
});
