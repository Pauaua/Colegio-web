import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { BottomBar } from '@/components/navigation/bottom-bar';
import { Sidebar } from '@/components/navigation/sidebar';
import { Topbar } from '@/components/navigation/topbar';
import { useIsWide } from '@/hooks/use-layout';
import { useSession } from '@/store/session';
import { colors } from '@/theme';

const SUFFIX = ' · Gestor Documental';

/**
 * Panel protegido. Sin sesión redirige al login.
 * Pantallas anchas: sidebar + topbar. Móvil: tabs inferiores según el rol.
 */
export default function PanelLayout() {
  const session = useSession((s) => s.session);
  const wide = useIsWide();
  if (!session) return <Redirect href="/" />;

  return (
    <Tabs
      backBehavior="history"
      tabBar={() => (wide ? <Sidebar /> : <BottomBar />)}
      screenOptions={{
        tabBarPosition: wide ? 'left' : 'bottom',
        headerShown: wide,
        header: () => <Topbar />,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: `Inicio${SUFFIX}` }} />
      <Tabs.Screen name="documentos" options={{ title: `Documentos${SUFFIX}` }} />
      <Tabs.Screen name="mis-documentos" options={{ title: `Mis documentos${SUFFIX}` }} />
      <Tabs.Screen name="usuarios" options={{ title: `Usuarios${SUFFIX}` }} />
      <Tabs.Screen name="cursos" options={{ title: `Cursos y estudiantes${SUFFIX}` }} />
      <Tabs.Screen name="auditoria" options={{ title: `Auditoría${SUFFIX}` }} />
      <Tabs.Screen name="perfil" options={{ title: `Perfil${SUFFIX}` }} />
    </Tabs>
  );
}
