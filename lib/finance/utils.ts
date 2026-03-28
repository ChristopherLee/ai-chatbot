import {
  addMonths,
  eachMonthOfInterval,
  format,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";

export function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function toMonthKey(date: string | Date) {
  if (typeof date === "string") {
    return date.slice(0, 7);
  }

  return format(date, "yyyy-MM");
}

export function monthKeyToDate(monthKey: string) {
  return parseISO(`${monthKey}-01`);
}

export function getMonthLabel(monthKey: string) {
  return format(monthKeyToDate(monthKey), "MMM yyyy");
}

export function getTrailingStartMonth(maxDate: string, monthCount: number) {
  return format(
    subMonths(startOfMonth(parseISO(maxDate)), monthCount - 1),
    "yyyy-MM"
  );
}

export function getMonthKeysBetween(startMonth: string, endMonth: string) {
  const start = monthKeyToDate(startMonth);
  const end = monthKeyToDate(endMonth);

  return eachMonthOfInterval({ start, end }).map((month) =>
    format(month, "yyyy-MM")
  );
}

export function formatMonthForTitle(date: string) {
  return format(parseISO(date), "MMM yyyy");
}

export function safeLower(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

export function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

const MONTH_NAMES = new Map<string, number>([
  ["january", 1],
  ["february", 2],
  ["march", 3],
  ["april", 4],
  ["may", 5],
  ["june", 6],
  ["july", 7],
  ["august", 8],
  ["september", 9],
  ["october", 10],
  ["november", 11],
  ["december", 12],
  ["jan", 1],
  ["feb", 2],
  ["mar", 3],
  ["apr", 4],
  ["jun", 6],
  ["jul", 7],
  ["aug", 8],
  ["sep", 9],
  ["sept", 9],
  ["oct", 10],
  ["nov", 11],
  ["dec", 12],
]);

export function resolveEffectiveMonthFromName({
  monthName,
  referenceDate,
}: {
  monthName: string;
  referenceDate: string;
}) {
  const targetMonth = MONTH_NAMES.get(monthName.toLowerCase());

  if (!targetMonth) {
    return null;
  }

  const reference = parseISO(referenceDate);
  const referenceMonth = reference.getMonth() + 1;
  let year = reference.getFullYear();

  if (targetMonth < referenceMonth) {
    year += 1;
  }

  return `${year}-${String(targetMonth).padStart(2, "0")}`;
}

export function getFutureMonth(referenceMonth: string, offset: number) {
  return format(addMonths(monthKeyToDate(referenceMonth), offset), "yyyy-MM");
}
