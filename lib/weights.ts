import { daysBetween } from "./dates";

export type WeightEntry = { day: string; kg: number };

export const KG_MIN = 20;
export const KG_MAX = 400;

/** "72,4" or "72.4" → 72.4, rounded to a tenth; null when it is not a weight. */
export function parseKg(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  if (!Number.isFinite(value) || value < KG_MIN || value > KG_MAX) return null;
  return Math.round(value * 10) / 10;
}

export function formatKg(kg: number, withSign = false): string {
  const text = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    Math.abs(kg),
  );
  const sign = kg < 0 ? "−" : withSign && kg > 0 ? "+" : "";
  return `${sign}${text} kg`;
}

export type Trend = {
  /** Last minus first measurement in the period. */
  change: number;
  /** Slope of the fitted line, in kg per week. */
  perWeek: number;
  /** How many days the period covers. */
  days: number;
  verdict: "losing" | "gaining" | "steady";
};

/** Below this the scale's noise is bigger than the change. */
const STEADY_PER_WEEK = 0.1;

export function sortByDay(entries: WeightEntry[]): WeightEntry[] {
  return [...entries].sort((a, b) => a.day.localeCompare(b.day));
}

/** Least-squares line through the measurements: kg = at(day) = intercept + perDay × days since the first. */
export function fitLine(entries: WeightEntry[]): { perDay: number; at: (day: string) => number } | null {
  const sorted = sortByDay(entries);
  if (sorted.length < 2) return null;
  const first = sorted[0].day;
  const xs = sorted.map((entry) => daysBetween(first, entry.day));
  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const meanY = sorted.reduce((sum, entry) => sum + entry.kg, 0) / sorted.length;
  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < xs.length; i++) {
    covariance += (xs[i] - meanX) * (sorted[i].kg - meanY);
    variance += (xs[i] - meanX) ** 2;
  }
  if (variance === 0) return null;
  const perDay = covariance / variance;
  const intercept = meanY - perDay * meanX;
  return { perDay, at: (day) => intercept + perDay * daysBetween(first, day) };
}

/** Are we gaining or losing? Fits a line through the measurements so one odd day does not decide. */
export function weightTrend(entries: WeightEntry[]): Trend | null {
  const line = fitLine(entries);
  if (!line) return null;
  const sorted = sortByDay(entries);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days = daysBetween(first.day, last.day);
  const perWeek = line.perDay * 7;

  return {
    change: Math.round((last.kg - first.kg) * 10) / 10,
    perWeek: Math.round(perWeek * 100) / 100,
    days,
    verdict: perWeek <= -STEADY_PER_WEEK ? "losing" : perWeek >= STEADY_PER_WEEK ? "gaining" : "steady",
  };
}
