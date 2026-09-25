import { Redirect } from 'expo-router';
import { LoginScreen } from '@/screens/login';
import { useSession } from '@/store/session';

/** `/`: pantalla de acceso. Si ya hay sesión, pasa directo al panel. */
export default function Index() {
  const session = useSession((s) => s.session);
  if (session) return <Redirect href="/panel" />;
  return <LoginScreen />;
}
