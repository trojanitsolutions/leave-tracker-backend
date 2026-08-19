const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Parses a "YYYY-MM-DD" (or DATETIME string) as a UTC calendar date — never local timezone. */
export function parseISODate(value: string): Date {
  const match = ISO_DATE_RE.exec(value);
  if (!match) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

export function addYears(date: Date, years: number): Date {
  return addMonths(date, years * 12);
}

/** Inclusive day count, e.g. 01 Aug -> 20 Aug is 20 days. */
export function daysBetweenInclusive(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
}

export function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

export function isAfter(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime();
}

/** True if [aStart, aEnd] and [bStart, bEnd] share at least one day. */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return !isAfter(aStart, bEnd) && !isAfter(bStart, aEnd);
}

/** Today as a UTC calendar date (midnight), independent of server-local timezone. */
export function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function formatHumanDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
