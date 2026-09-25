import type { AuthUser } from '../lib/permissions';

declare global {
  namespace Express {
    interface Request {
      /** Usuario autenticado; lo define el middleware requireAuth. */
      user?: AuthUser;
    }
  }
}

export {};
