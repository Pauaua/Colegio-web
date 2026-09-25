import * as SecureStore from 'expo-secure-store';

/** Almacenamiento de la sesión en móvil: Keychain (iOS) / Keystore (Android). */
export const storage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
