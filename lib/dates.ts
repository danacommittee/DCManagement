/** Returns YYYY-MM-DD for today (call when needed for fresh value) */
export function today(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Returns all dates (YYYY-MM-DD) in range [dateFrom, dateTo] inclusive */
export function getDatesInRange(dateFrom: string, dateTo: string): string[] {
  const from = new Date(dateFrom);
  from.setHours(0, 0, 0, 0);
  const to = new Date(dateTo);
  to.setHours(0, 0, 0, 0);
  const out: string[] = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
