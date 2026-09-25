import { router } from 'expo-router';
import { SearchX } from 'lucide-react-native';
import { View } from 'react-native';
import { EmptyState } from '@/components/feedback';
import { colors } from '@/theme';

export default function NotFound() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
      <EmptyState
        icon={SearchX}
        title="Página no encontrada"
        message="La dirección que abrió no existe."
        actionLabel="Volver al inicio"
        onAction={() => router.replace('/')}
      />
    </View>
  );
}
