/** En web la sesión vive en sessionStorage: se borra al cerrar la pestaña. */
function session(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export const storage = {
  get: async (key: string) => session()?.getItem(key) ?? null,
  set: async (key: string, value: string) => {
    session()?.setItem(key, value);
  },
  remove: async (key: string) => {
    session()?.removeItem(key);
  },
};
