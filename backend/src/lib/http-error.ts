export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'No autenticado') => new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'No tiene permiso para esta acción') => new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Recurso no encontrado') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (message: string) => new HttpError(409, 'CONFLICT', message);
