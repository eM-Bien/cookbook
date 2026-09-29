import { parseIngredientLine } from "./ingredients";
import type { Ingredient, RecipeDraft } from "./types";

// Reads the schema.org Recipe that most recipe sites embed as JSON-LD. Sites
// without it (many Polish blogs) are read by looking for a "Składniki" heading.

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  deg: "°", frac12: "½", frac14: "¼", frac34: "¾", oacute: "ó", Oacute: "Ó", hellip: "…",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bdquo: "„",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (whole, code: string) => {
    if (code[0] !== "#") return NAMED_ENTITIES[code] ?? whole;
    const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return Number.isInteger(point) && point > 0 && point <= 0x10ffff
      ? String.fromCodePoint(point)
      : whole;
  });
}

function cleanText(value: Json | undefined): string {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return "";
  const withoutTags = value.replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n").replace(/<[^>]*>/g, "");
  return decodeEntities(decodeEntities(withoutTags))
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: Json | undefined): Json[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function hasType(node: JsonObject, type: string): boolean {
  return asArray(node["@type"]).some((t) => t === type);
}

function findRecipe(node: Json, depth = 0): JsonObject | null {
  if (depth > 6) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findRecipe(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(node)) return null;
  if (hasType(node, "Recipe")) return node;
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage"]) {
    const found = node[key] === undefined ? null : findRecipe(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function parseSteps(value: Json | undefined): string[] {
  const steps: string[] = [];
  const visit = (node: Json, depth: number) => {
    if (depth > 4) return;
    if (typeof node === "string") {
      steps.push(...cleanText(node).split("\n"));
    } else if (Array.isArray(node)) {
      node.forEach((child) => visit(child, depth + 1));
    } else if (isObject(node)) {
      if (node.itemListElement !== undefined) visit(node.itemListElement, depth + 1);
      else if (node.text !== undefined) visit(node.text, depth + 1);
      else if (node.name !== undefined) visit(node.name, depth + 1);
    }
  };
  visit(value ?? null, 0);
  return steps.map((s) => s.replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean);
}

function parseServings(value: Json | undefined): number | null {
  for (const candidate of asArray(value)) {
    const match = cleanText(candidate).match(/\d+/);
    const servings = match ? Number(match[0]) : NaN;
    if (servings >= 1 && servings <= 100) return servings;
  }
  return null;
}

/** ISO 8601 duration such as "PT1H30M" to minutes. */
function parseMinutes(value: Json | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+(?:\.\d+)?S)?)?$/i);
  if (!match) return null;
  const minutes = Number(match[1] ?? 0) * 1440 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return minutes > 0 && minutes <= 10000 ? minutes : null;
}

function parseCalories(value: Json | undefined): number | null {
  if (!isObject(value)) return null;
  const calories = Number(cleanText(value.calories).match(/\d+/)?.[0]);
  return calories > 0 && calories <= 10000 ? calories : null;
}

function parseImage(value: Json | undefined, baseUrl: string): string {
  for (const candidate of asArray(value)) {
    const raw = isObject(candidate) ? candidate.url : candidate;
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const url = new URL(decodeEntities(raw.trim()), baseUrl);
      if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
    } catch {
      // Not a usable address; try the next candidate.
    }
  }
  return "";
}

function parseTags(recipe: JsonObject): string[] {
  const raw = [...asArray(recipe.recipeCategory), ...asArray(recipe.keywords)]
    .flatMap((v) => cleanText(v).split(","))
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 30);
  return [...new Set(raw)].slice(0, 8);
}

function fromStructuredData(html: string, pageUrl: string): RecipeDraft | null {
  const scripts = html.matchAll(
    /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const [, body] of scripts) {
    let data: Json;
    try {
      data = JSON.parse(body.trim()) as Json;
    } catch {
      continue;
    }
    const recipe = findRecipe(data);
    if (!recipe) continue;

    const title = cleanText(recipe.name).replace(/\n/g, " ").slice(0, 200);
    const ingredients = asArray(recipe.recipeIngredient ?? recipe.ingredients)
      .flatMap((line) => cleanText(line).split("\n"))
      .map(parseIngredientLine)
      .filter((i): i is Ingredient => i !== null);
    if (!title || ingredients.length === 0) continue;

    const minutes =
      parseMinutes(recipe.totalTime) ??
      (parseMinutes(recipe.prepTime) ?? 0) + (parseMinutes(recipe.cookTime) ?? 0);

    return {
      title,
      description: cleanText(recipe.description).slice(0, 1000),
      servings: parseServings(recipe.recipeYield) ?? 2,
      prep_minutes: minutes > 0 ? minutes : null,
      calories: parseCalories(recipe.nutrition),
      meal_types: [],
      notes: "",
      source_url: pageUrl,
      image_url: parseImage(recipe.image, pageUrl),
      tags: parseTags(recipe),
      steps: parseSteps(recipe.recipeInstructions),
      ingredients,
    };
  }
  return null;
}

const INGREDIENTS_HEADING =
  /<(h[1-6]|p|span|strong|b|u|div)\b[^>]*>(?:\s*<(?!\/)[^>]+>)*\s*Składniki(?![\p{L}])[^<]{0,80}</giu;
const STEPS_HEADING = /^(przygotowanie|wykonanie|sposób (przygotowania|wykonania)|przepis)(?![\p{L}])/iu;
const BLOCK = /<(li|p|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi;

function metaContent(html: string, property: string): string {
  const tag = html.match(
    new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${property}["'][^>]*>`, "i"),
  )?.[0];
  const content = tag?.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return cleanText(content?.[1] ?? content?.[2] ?? "");
}

function pageTitle(html: string): string {
  const raw =
    metaContent(html, "og:title") ||
    cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  // "Naleśniki - Moje Wypieki" → "Naleśniki"
  const withoutSite = raw.replace(/\s+[-–—|]\s+[^-–—|]*$/, "");
  return (withoutSite.length >= 3 ? withoutSite : raw).replace(/\n/g, " ").slice(0, 200);
}

function looksLikeIngredients(items: Ingredient[]): boolean {
  const measured = items.filter((item) => item.quantity !== null).length;
  return items.length >= 2 && measured / items.length >= 0.4;
}

function fromPageText(html: string, pageUrl: string): RecipeDraft | null {
  const title = pageTitle(html);
  if (!title) return null;

  for (const heading of html.matchAll(INGREDIENTS_HEADING)) {
    const start = heading.index + heading[0].length;
    const ingredients: Ingredient[] = [];
    const steps: string[] = [];
    let inSteps = false;
    let stepKind = "";

    for (const [, tag, inner] of html.slice(start, start + 30000).matchAll(BLOCK)) {
      const text = cleanText(inner).replace(/\n/g, " ");
      if (!text) continue;
      const kind = tag.toLowerCase();

      if (kind.startsWith("h")) {
        if (STEPS_HEADING.test(text)) inSteps = true;
        else if (inSteps) break;
        continue;
      }
      if (!inSteps && kind === "p") {
        // Prose right after the list is the method, on sites without a heading for it.
        if (ingredients.length >= 2 && text.length > 120) inSteps = true;
        else continue;
      }
      if (inSteps) {
        // The method is either a list or paragraphs; a switch means it has ended.
        stepKind ||= kind;
        if (kind !== stepKind) break;
        const isStep = text.length > 30 && !/^(źródło|smacznego)/i.test(text);
        if (isStep && steps.length < 40) steps.push(text);
        continue;
      }
      const ingredient = ingredients.length < 60 ? parseIngredientLine(text) : null;
      if (ingredient) ingredients.push(ingredient);
    }

    if (!looksLikeIngredients(ingredients)) continue;

    const nearby = cleanText(html.slice(Math.max(0, heading.index - 400), start + 200));
    const servings = Number(nearby.match(/(\d+)\s*(?:porcj|osob|os\.)/i)?.[1]);

    return {
      title,
      description: metaContent(html, "og:description").slice(0, 1000),
      servings: servings >= 1 && servings <= 100 ? servings : 2,
      prep_minutes: null,
      calories: null,
      meal_types: [],
      notes: "",
      source_url: pageUrl,
      image_url: parseImage(metaContent(html, "og:image"), pageUrl),
      tags: [],
      steps,
      ingredients,
    };
  }
  return null;
}

export function extractRecipe(html: string, pageUrl: string): RecipeDraft | null {
  return fromStructuredData(html, pageUrl) ?? fromPageText(html, pageUrl);
}
