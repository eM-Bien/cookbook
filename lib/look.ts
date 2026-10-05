// Small visual helpers shared by the recipe, calendar and shopping views.

import type { MealType } from "./types";

export type Tone = "peach" | "green" | "blue" | "pink" | "lilac" | "sand";

const CATEGORY_LOOK: Record<string, { emoji: string; tone: Tone }> = {
  "warzywa i owoce": { emoji: "🥕", tone: "green" },
  "nabiał i jajka": { emoji: "🥛", tone: "blue" },
  "mięso i ryby": { emoji: "🥩", tone: "pink" },
  pieczywo: { emoji: "🥖", tone: "peach" },
  "produkty suche": { emoji: "🌾", tone: "sand" },
  "słoiki i puszki": { emoji: "🫙", tone: "peach" },
  "produkty gotowe": { emoji: "🥫", tone: "lilac" },
  przyprawy: { emoji: "🧂", tone: "lilac" },
  mrożonki: { emoji: "🧊", tone: "blue" },
  napoje: { emoji: "🥤", tone: "peach" },
  inne: { emoji: "🛒", tone: "sand" },
};

export function categoryLook(category: string) {
  return CATEGORY_LOOK[category] ?? CATEGORY_LOOK.inne;
}

export const MEAL_TONE: Record<MealType, Tone> = {
  sniadanie: "peach",
  obiad: "green",
  kolacja: "lilac",
};

// First match wins, so the more telling kinds come first.
const DISH_EMOJI: [string, string][] = [
  ["owsianki", "🥣"],
  ["placki", "🥞"],
  ["burgery", "🍔"],
  ["makarony", "🍝"],
  ["tortilla", "🌯"],
  ["kanapki", "🥪"],
  ["tosty", "🍞"],
  ["omlety", "🍳"],
  ["jajka", "🍳"],
  ["ryby", "🐟"],
  ["kurczak", "🍗"],
  ["zupy", "🍲"],
  ["na słodko", "🍰"],
  ["wege", "🥗"],
];

/** Stands in for a photo when the recipe has none. */
export function dishEmoji(tags: string[] = []): string {
  return DISH_EMOJI.find(([tag]) => tags.includes(tag))?.[1] ?? "🍽️";
}

/**
 * PNG pictures here are dishes photographed from above on a white ground. On
 * the recipe page they are shown whole; ordinary photos fill the frame instead.
 */
export function isCutout(imageUrl: string | null | undefined): boolean {
  return Boolean(imageUrl && /\.png($|\?)/i.test(imageUrl));
}

const TONES: Tone[] = ["peach", "green", "blue", "pink", "lilac", "sand"];

/** A stable colour for a recipe without a photo. */
export function toneFor(text: string): Tone {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)!) % 9973;
  return TONES[hash % TONES.length];
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} godz.` : `${hours} godz. ${rest} min`;
}

export function servingsLabel(count: number): string {
  if (count === 1) return "porcja";
  const lastTwo = count % 100;
  const last = count % 10;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "porcje";
  return "porcji";
}

export function initials(name: string): string {
  return name.trim().slice(0, 1) || "?";
}
