import { Lock } from 'lucide-react-native';
import { router } from 'expo-router';
import type { Role } from '@/api/types';
import { useCurrentUser } from '@/store/session';
import { EmptyState } from './feedback';
import { Screen } from './screen';

/** Protege una pantalla por rol. El servidor igualmente rechaza cualquier acción no permitida. */
export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const user = useCurrentUser();
  if (!user || !roles.includes(user.role)) {
    return (
      <Screen title="Acceso restringido">
        <EmptyState
          icon={Lock}
          title="No tiene acceso a esta sección"
          message="Su perfil no tiene permiso para ver esta página."
          actionLabel="Ir al inicio"
          onAction={() => router.replace('/panel')}
          testID="no-access"
        />
      </Screen>
    );
  }
  return <>{children}</>;
}
