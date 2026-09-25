import { create } from 'zustand';
import type { Session, User } from '@/api/types';
import { storage } from '@/lib/storage';

const STORAGE_KEY = 'chorombo.session';

type StoredSession = Pick<Session, 'accessToken' | 'refreshToken' | 'user'>;

interface SessionState {
  session: StoredSession | null;
  /** true cuando ya se leyó la sesión guardada (evita redirigir al login antes de tiempo). */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (session: StoredSession) => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  setUser: (user: User) => Promise<void>;
  clear: () => Promise<void>;
}

async function persist(session: StoredSession | null): Promise<void> {
  try {
    if (session) await storage.set(STORAGE_KEY, JSON.stringify(session));
    else await storage.remove(STORAGE_KEY);
  } catch {
    // Si el almacenamiento no está disponible, la sesión dura solo mientras la app esté abierta.
  }
}

export const useSession = create<SessionState>((set, get) => ({
  session: null,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await storage.get(STORAGE_KEY);
      set({ session: raw ? (JSON.parse(raw) as StoredSession) : null, hydrated: true });
    } catch {
      set({ session: null, hydrated: true });
    }
  },

  setSession: async (session) => {
    set({ session });
    await persist(session);
  },

  setTokens: async (accessToken, refreshToken) => {
    const current = get().session;
    if (!current) return;
    const next = { ...current, accessToken, refreshToken };
    set({ session: next });
    await persist(next);
  },

  setUser: async (user) => {
    const current = get().session;
    if (!current) return;
    const next = { ...current, user };
    set({ session: next });
    await persist(next);
  },

  clear: async () => {
    set({ session: null });
    await persist(null);
  },
}));

/** Usuario autenticado (o null). */
export const useCurrentUser = () => useSession((s) => s.session?.user ?? null);
