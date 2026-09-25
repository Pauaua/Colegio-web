import axios, { AxiosError, isAxiosError, type InternalAxiosRequestConfig } from 'axios';
import { getApiBaseUrl } from '@/lib/config';
import { useSession } from '@/store/session';

// eslint-disable-next-line import/no-named-as-default-member -- axios.create es la API documentada
export const api = axios.create({
  baseURL: `${getApiBaseUrl()}/api/v1`,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

// Agrega el JWT a cada solicitud.
api.interceptors.request.use((config) => {
  const token = useSession.getState().session?.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Un solo refresh en curso aunque fallen varias solicitudes a la vez. */
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = useSession.getState().session?.refreshToken;
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post<{ accessToken: string; refreshToken: string }>(
      `${getApiBaseUrl()}/api/v1/auth/refresh`,
      { refreshToken },
      { timeout: 15_000 },
    );
    await useSession.getState().setTokens(data.accessToken, data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

// Si el access token (15 min) expiró, se renueva con el refresh token y se reintenta una vez.
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/login') || original?.url?.startsWith('/auth/mfa/verify');
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      refreshing ??= refreshAccessToken().finally(() => {
        refreshing = null;
      });
      const token = await refreshing;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      await useSession.getState().clear();
    }
    return Promise.reject(error);
  },
);

/** Mensaje de error legible para mostrar al usuario. */
export function errorMessage(error: unknown, fallback = 'Ocurrió un error. Intente nuevamente.'): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string; details?: { message?: string }[] } | undefined;
    if (data?.details?.length && data.details[0]?.message) return data.details[0].message;
    if (data?.message) return data.message;
    if (!error.response) return 'No hay conexión con el servidor.';
    if (error.response.status === 403) return 'No tiene permiso para esta acción.';
  }
  return fallback;
}

export function statusOf(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}
