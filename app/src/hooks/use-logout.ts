import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { api } from '@/api/client';
import { useSession } from '@/store/session';

/** Revoca el refresh token en el servidor, limpia la sesión y la caché, y vuelve al login. */
export function useLogout() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    const refreshToken = useSession.getState().session?.refreshToken;
    if (refreshToken) await api.post('/auth/logout', { refreshToken }).catch(() => undefined);
    await useSession.getState().clear();
    queryClient.clear();
    router.replace('/');
  }, [queryClient]);
}
