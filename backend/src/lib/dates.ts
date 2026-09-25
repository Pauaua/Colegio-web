export const TIME_ZONE = 'America/Santiago';

/** Desfase (en minutos) de America/Santiago respecto de UTC en el instante dado; considera el horario de verano. */
function santiagoOffsetMinutes(at: Date): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(part ?? '');
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/** Año y mes (1-12) actuales en Chile. */
export function santiagoYearMonth(at = new Date()): { year: number; month: number } {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit' })
    .format(at)
    .split('-')
    .map(Number);
  return { year: year ?? at.getUTCFullYear(), month: month ?? at.getUTCMonth() + 1 };
}

/** Instante UTC en que empieza el mes actual en hora de Chile. */
export function startOfSantiagoMonth(at = new Date()): Date {
  const { year, month } = santiagoYearMonth(at);
  const utcMidnight = new Date(Date.UTC(year, month - 1, 1));
  return new Date(utcMidnight.getTime() - santiagoOffsetMinutes(utcMidnight) * 60_000);
}
