import { useLocalSearchParams } from 'expo-router';
import { EditDocumentScreen } from '@/screens/documents/edit';

export default function EditDocumentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditDocumentScreen id={Number(id)} />;
}
