/**
 * Pre-defined team names. Wrap-up teams recur by weekday (1=Mon .. 7=Sun for display;
 * we store dayOfWeek 1=Mon, 2=Tue, ..., 0=Sun to match Date.getDay() where 0=Sun, 1=Mon).
 */

export const DEFAULT_REGULAR_TEAM_NAMES = [
  "Tafheem",
  "Pre-collection",
  "Thaal return 1st floor",
  "Thaal return 2nd floor",
  "To-go packing and mumineen distribution",
  "Safra marado",
  "Safra bairao",
  "Saturday madrasah jaman",
  "Friday namaz distribution",
  "Sadaqa meals",
] as const;

/** dayOfWeek: 0=Sunday, 1=Monday, ..., 6=Saturday (matches Date.getDay()) */
export const WRAP_UP_DAY_NAMES: { dayOfWeek: number; name: string }[] = [
  { dayOfWeek: 0, name: "Sunday Wrap-up" },
  { dayOfWeek: 1, name: "Monday Wrap-up" },
  { dayOfWeek: 2, name: "Tuesday Wrap-up" },
  { dayOfWeek: 3, name: "Wednesday Wrap-up" },
  { dayOfWeek: 4, name: "Thursday Wrap-up" },
  { dayOfWeek: 5, name: "Friday Wrap-up" },
  { dayOfWeek: 6, name: "Saturday Wrap-up" },
];

/** Returns weekdays (0-6) that appear in the date range [from, to] (inclusive). */
export function getWeekdaysInRange(dateFrom: Date, dateTo: Date): number[] {
  const set = new Set<number>();
  const from = new Date(dateFrom);
  from.setHours(0, 0, 0, 0);
  const to = new Date(dateTo);
  to.setHours(23, 59, 59, 999);
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    set.add(d.getDay());
  }
  return Array.from(set).sort((a, b) => a - b);
}
