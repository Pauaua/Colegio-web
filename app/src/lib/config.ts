import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Puerto de Metro en desarrollo (`expo start`). */
const METRO_PORT = '8081';
const API_PORT = '8000';

/**
 * URL base del backend.
 * - Web: siempre el mismo origen (el backend sirve la app). Solo en desarrollo con Metro se apunta al puerto 8000.
 * - Móvil: EXPO_PUBLIC_API_URL (ALB/CloudFront) o, en desarrollo, la IP del PC que corre Metro.
 */
export function getApiBaseUrl(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location.port === METRO_PORT) {
      return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
    }
    return '';
  }
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:${API_PORT}`;
}
