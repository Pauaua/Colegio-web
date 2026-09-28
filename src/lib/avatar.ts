/**
 * Fotos de perfil. El navegador recorta la imagen al centro, la reduce a
 * AVATAR_SIZE px y la convierte a JPEG antes de subirla: el servidor solo
 * guarda archivos pequeños y de un único formato.
 */

/** Lado del cuadrado final, en px (suficiente para pantallas de alta densidad). */
export const AVATAR_SIZE = 512;

/** Tamaño máximo de la imagen original que elige el usuario. */
export const MAX_AVATAR_SOURCE_SIZE = 15 * 1024 * 1024; // 15 MB

/** Tamaño máximo del JPEG ya procesado (bajo el límite de 1 MB de las Server Actions). */
export const MAX_AVATAR_UPLOAD_SIZE = 800 * 1024; // 800 KB

export const AVATAR_SOURCE_ACCEPT = "image/jpeg,image/png,image/webp";

/** Clave del storage para una foto nueva. */
export function buildAvatarKey(uuid: string): string {
  return `avatars/${uuid}.jpg`;
}

/**
 * URL pública (con sesión) de la foto. La clave va en la URL para que, al
 * cambiar la foto, el navegador no siga mostrando la anterior desde su caché.
 */
export function avatarUrl(userId: string, avatarKey: string | null): string | null {
  if (!avatarKey) return null;
  const version = avatarKey.slice("avatars/".length, "avatars/".length + 8);
  return `/api/users/${userId}/avatar?v=${version}`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
