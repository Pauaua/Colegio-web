import { TZDate } from "@date-fns/tz";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export const APP_TIME_ZONE = "America/Santiago";

function inSantiago(date: Date | string | number) {
  return new TZDate(new Date(date), APP_TIME_ZONE);
}

/** 24 de septiembre de 2026 */
export function formatLongDate(date: Date | string | number) {
  return format(inSantiago(date), "d 'de' MMMM 'de' yyyy", { locale: es });
}

/** 24-09-2026 */
export function formatShortDate(date: Date | string | number) {
  return format(inSantiago(date), "dd-MM-yyyy", { locale: es });
}

/** 24-09-2026 21:15 */
export function formatDateTime(date: Date | string | number) {
  return format(inSantiago(date), "dd-MM-yyyy HH:mm", { locale: es });
}

/** "hace 5 minutos" */
export function formatRelative(date: Date | string | number) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es });
}

/**
 * Fechas de calendario (columnas @db.Date) se guardan a medianoche UTC:
 * se formatean en UTC para no correr el día por la zona horaria.
 */
export function formatCalendarDate(date: Date | string) {
  return format(new TZDate(new Date(date), "UTC"), "dd-MM-yyyy", { locale: es });
}
