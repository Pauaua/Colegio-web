import { useLocalSearchParams } from 'expo-router';
import { DocumentDetailScreen } from '@/screens/documents/detail';

export default function DocumentDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DocumentDetailScreen id={Number(id)} />;
}
