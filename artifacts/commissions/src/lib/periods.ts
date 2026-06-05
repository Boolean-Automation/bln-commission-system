import type { PeriodType } from "@workspace/api-client-react";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const PERIOD_TYPE_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
];

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** The current period key for a given type, based on today's date. */
export function currentPeriodKey(periodType: PeriodType, now = new Date()): string {
  const year = now.getFullYear();
  if (periodType === "monthly") return `${year}-${pad2(now.getMonth() + 1)}`;
  if (periodType === "quarterly")
    return `${year}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  return `${year}`;
}

/**
 * Build a list of selectable period keys around the current period: a few
 * past periods and a couple ahead, newest first.
 */
export function periodKeyOptions(
  periodType: PeriodType,
  now = new Date(),
): string[] {
  const keys: string[] = [];
  if (periodType === "annual") {
    const year = now.getFullYear();
    for (let y = year + 1; y >= year - 4; y--) keys.push(`${y}`);
    return keys;
  }
  if (periodType === "quarterly") {
    let year = now.getFullYear();
    let q = Math.floor(now.getMonth() / 3) + 1;
    // start two quarters ahead
    q += 2;
    while (q > 4) {
      q -= 4;
      year += 1;
    }
    for (let i = 0; i < 8; i++) {
      keys.push(`${year}-Q${q}`);
      q -= 1;
      if (q < 1) {
        q = 4;
        year -= 1;
      }
    }
    return keys;
  }
  // monthly
  let year = now.getFullYear();
  let m = now.getMonth() + 1 + 1; // one month ahead
  if (m > 12) {
    m -= 12;
    year += 1;
  }
  for (let i = 0; i < 12; i++) {
    keys.push(`${year}-${pad2(m)}`);
    m -= 1;
    if (m < 1) {
      m = 12;
      year -= 1;
    }
  }
  return keys;
}

/** Human-readable label for a period key. */
export function formatPeriodKey(periodType: PeriodType, key: string): string {
  if (periodType === "annual") return key;
  if (periodType === "quarterly") {
    const [year, q] = key.split("-Q");
    return `Q${q} ${year}`;
  }
  const [year, month] = key.split("-");
  const idx = Number(month) - 1;
  return `${MONTH_NAMES[idx] ?? month} ${year}`;
}
