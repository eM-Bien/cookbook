// Imports recipes (and optionally the weekly plan) from a Notion export.
//
//   npx tsx scripts/import-notion.ts <export folder>            preview only
//   npx tsx scripts/import-notion.ts <export folder> --save     write to the database
//
// Options: --update  overwrite recipes that already exist (matched by name)
//          --plan    also copy planned meals into the calendar
//
// Reads the connection details from .env.local.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { guessCategory } from "../lib/ingredients";
import { validateRecipe } from "../lib/recipe-validation";
import type { Ingredient, MealType, RecipeDraft } from "../lib/types";
import { normalizeUnit } from "../lib/units";

const MEALS: Record<string, MealType> = {
  breakfast: "sniadanie",
  dinner: "obiad",
  lunch: "obiad",
  supper: "kolacja",
};

// Notion names that read better shorter.
const INGREDIENT_NAMES: Record<string, string> = {
  "jajko kurze całe": "Jajko",
  "cebula czerwona": "Cebula",
  "borówki": "Borówki amerykańskie",
  "borówki amerykańskie świeże": "Borówki amerykańskie",
  "borówki amerykańskie (świeże lub mrożone)": "Borówki amerykańskie",
  "borówki amerykańskie, świeże lub mrożone": "Borówki amerykańskie",
  // The household bakes gluten-free: every spelt flour becomes gluten-free flour.
  "mąka orkiszowa pełnoziarnista": "Mąka bezglutenowa",
  "mąka orkiszowa biała": "Mąka bezglutenowa",
  "mąka orkiszowa": "Mąka bezglutenowa",
  "bezglutenowa mąka do wypieku ciast schar": "Mąka bezglutenowa",
  "ser mozzarella (kulka)": "Ser mozzarella kulka light",
  "ser mozzarella kulka": "Ser mozzarella kulka light",
  "ser twarogowy chudy": "Ser twarogowy półtłusty",
  "jogurt skyr": "Jogurt skyr waniliowy",
  skyr: "Jogurt skyr waniliowy",
  "skyr waniliowy fruvita": "Jogurt skyr waniliowy",
  "bulion warzywny po rozrobieniu": "Bulion warzywny w słoiczku",
  "bulion warzywny (po rozrobieniu ze słoiczka)": "Bulion warzywny w słoiczku",
  "passata pomidorowa": "Passata pomidorowa pikantna",
  "yopro jogurt pitny smak wanilia-ciasteczko": "YoPro jogurt pitny smak ciasteczkowy",
  "wanilia (ekstrakt)": "Aromat waniliowy",
  "wanilia esktrakt": "Aromat waniliowy",
  "wanilia ekstrakt": "Aromat waniliowy",
  "ekstrakt waniliowy": "Aromat waniliowy",
};

const TAGS: Record<string, string> = {
  pancakes: "placki",
  oatmeal: "owsianki",
  sandwich: "kanapki",
  tortilla: "tortilla",
  chicken: "kurczak",
  burger: "burgery",
  pasta: "makarony",
  vege: "wege",
  fish: "ryby",
  omelette: "omlety",
  eggs: "jajka",
  toast: "tosty",
};

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const WEIGHT = String.raw`(${NUMBER})\s*(g|ml|kg|l)`;
const MEASURE = String.raw`(?:(${NUMBER})\s*(?:[×x]\s*)?)?([\p{L}]+\.?)`;
const AMOUNTS: { pattern: RegExp; read: (m: RegExpMatchArray) => Amount }[] = [
  {
    // "4 × łyżka (40 g)", "szczypta (0,3 g)"
    pattern: new RegExp(`^${MEASURE}\\s*\\(\\s*${WEIGHT}\\s*\\)$`, "iu"),
    read: (m) => ({ measure: [m[1], m[2]], weight: [m[3], m[4]] }),
  },
  {
    // "90 g (3 kromki)"
    pattern: new RegExp(`^${WEIGHT}\\s*\\(\\s*${MEASURE}\\s*\\)$`, "iu"),
    read: (m) => ({ weight: [m[1], m[2]], measure: [m[3], m[4]] }),
  },
  { pattern: new RegExp(`^${WEIGHT}$`, "i"), read: (m) => ({ weight: [m[1], m[2]] }) },
  { pattern: new RegExp(`^${MEASURE}$`, "iu"), read: (m) => ({ measure: [m[1], m[2]] }) },
  // "2", "2x"
  { pattern: new RegExp(`^(${NUMBER})\\s*[×x]?$`, "i"), read: (m) => ({ measure: [m[1], ""] }) },
];

type Amount = { weight?: [string, string]; measure?: [string | undefined, string] };
type Parsed = {
  draft: RecipeDraft;
  warnings: string[];
  file: string;
  /** A picture pasted into the Notion page, as a file next to the export. */
  photo: string | null;
};

const PHOTO_BUCKET = "recipe-photos";
const PHOTO_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function toNumber(text: string | undefined): number {
  return text === undefined ? 1 : Number(text.replace(",", "."));
}

function readAmount(text: string, warnings: string[], name: string): Partial<Ingredient> {
  const cleaned = text.replace(/\bok\.\s*/gi, "").replace(/\s+/g, " ").trim();
  for (const { pattern, read } of AMOUNTS) {
    const match = cleaned.match(pattern);
    if (!match) continue;
    const { weight, measure } = read(match);

    const measureUnit = measure ? normalizeUnit(measure[1]) : null;
    if (measure && measure[1] && !measureUnit) {
      // A word that is not a unit means the pattern matched by accident.
      if (!weight) continue;
      warnings.push(`${name}: nieznana miara „${measure[1]}”, zostają same gramy`);
    }
    const household =
      measure && (measureUnit || !measure[1])
        ? { quantity: toNumber(measure[0]), unit: measureUnit }
        : null;

    if (weight) {
      return {
        quantity: toNumber(weight[0]),
        unit: normalizeUnit(weight[1]),
        alt_quantity: household?.quantity ?? null,
        alt_unit: household?.unit ?? null,
      };
    }
    if (household) return { quantity: household.quantity, unit: household.unit };
  }
  if (cleaned) warnings.push(`${name}: nie rozpoznano ilości „${cleaned}”`);
  return { quantity: null, unit: null };
}

function plain(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*+|__/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function parseRecipe(markdown: string, file: string, folder = ""): Parsed | null {
  const lines = markdown.split(/\r?\n/);

  const picture = markdown.match(/!\[[^\]]*\]\((?!https?:)([^)]+)\)/)?.[1];
  const photo = picture ? path.join(folder, decodeURIComponent(picture)) : null;
  const title = plain(lines[0]?.replace(/^#\s*/, "") ?? "");
  if (!title) return null;

  const warnings: string[] = [];
  const mealTypes: MealType[] = [];
  const tags: string[] = [];
  let calories: number | null = null;
  let servings = 1;
  const ingredients: Ingredient[] = [];
  const steps: string[] = [];
  const notes: string[] = [];

  let section: "start" | "ingredients" | "steps" | "macro" | "notes" = "start";
  let group: string | null = null;
  let seenSteps = false;

  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (!line || /^-{3,}$/.test(line) || /^!\[/.test(line)) continue;

    if (section === "start") {
      // "Składniki:" with nothing after it is a heading, not the Notion property.
      const property = line.match(/^(Rodzaj|Kalorie|Składniki|Text):\s+(\S.*)$/);
      if (property) {
        if (property[1] === "Kalorie") calories = Number(property[2].match(/\d+/)?.[0]) || null;
        if (property[1] === "Rodzaj") {
          for (const value of property[2].split(",").map((v) => v.trim().toLowerCase())) {
            if (MEALS[value]) mealTypes.push(MEALS[value]);
            else if (TAGS[value]) tags.push(TAGS[value]);
            else if (value) tags.push(value);
          }
        }
        continue;
      }
    }

    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);

    if (!bullet && !numbered) {
      const heading = plain(line.replace(/^#+\s*/, "")).replace(/[:?!]+$/, "").trim();
      const portions = heading.match(/(\d+)\s*porcj/i);
      if (portions) servings = Number(portions[1]);

      if (/^(składniki|ingredients)/i.test(heading)) {
        section = "ingredients";
        group = null;
      } else if (/^(jak to zrobić|instructions|przygotowanie|wykonanie|sposób)/i.test(heading)) {
        section = "steps";
        seenSteps = true;
      } else if (/^makro/i.test(heading)) {
        section = "macro";
      } else if (/^wskazówk/i.test(heading)) {
        section = "notes";
      } else if (/^przepis na \d+ porcj/i.test(heading)) {
        // Only states the number of servings.
      } else if (section === "steps") {
        steps.push(plain(line));
      } else if (section === "notes") {
        notes.push(plain(line));
      } else if (heading.length <= 60 && !seenSteps) {
        // A short line among the ingredients names a part of the recipe.
        section = "ingredients";
        group = heading;
      } else {
        warnings.push(`pominięto: „${plain(line).slice(0, 60)}”`);
      }
      continue;
    }

    const text = plain((bullet ?? numbered)![1]);
    if (!text || section === "macro") continue;

    if (numbered) {
      if (section === "notes") notes.push(text);
      else steps.push(text);
      continue;
    }

    const parts = text.split(/\s+[–—-]\s+/);
    const looksLikeIngredient = parts.length >= 2 && parts[0].length <= 80;
    if (section === "notes" || (section === "steps" && !looksLikeIngredient)) {
      (section === "notes" ? notes : steps).push(text);
      continue;
    }
    if (section !== "ingredients" && !looksLikeIngredient) {
      notes.push(text);
      continue;
    }

    const rawName = parts[0].trim();
    const name = INGREDIENT_NAMES[rawName.toLowerCase()] ?? capitalize(rawName);
    ingredients.push({
      name,
      quantity: null,
      unit: null,
      ...readAmount(parts.slice(1).join(" – "), warnings, name),
      category: guessCategory(name),
      group_name: group,
    });
  }

  if (mealTypes.length === 0) warnings.push("brak posiłku (śniadanie / obiad / kolacja)");
  if (steps.length === 0) warnings.push("brak kroków przygotowania");

  return {
    file,
    warnings,
    photo: photo && PHOTO_TYPES[path.extname(photo).toLowerCase()] ? photo : null,
    draft: {
      title,
      description: "",
      servings,
      prep_minutes: null,
      calories,
      source_url: "",
      image_url: "",
      tags: [...new Set(tags)],
      steps,
      thermomix_steps: [],
      meal_types: [...new Set(mealTypes)],
      notes: notes.join("\n"),
      ingredients,
    },
  };
}

// ---------------------------------------------------------------- files

function findFiles(folder: string, wanted: (name: string) => boolean): string[] {
  const found: string[] = [];
  for (const name of readdirSync(folder)) {
    const full = path.join(folder, name);
    if (statSync(full).isDirectory()) found.push(...findFiles(full, wanted));
    else if (wanted(name)) found.push(full);
  }
  return found;
}

function readCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [[]];
  let cell = "";
  let quoted = false;
  const body = text.replace(/^﻿/, "");
  const endCell = () => {
    rows.at(-1)!.push(cell);
    cell = "";
  };
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (quoted) {
      if (char === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") endCell();
    else if (char === "\n") {
      endCell();
      rows.push([]);
    } else if (char !== "\r") cell += char;
  }
  endCell();
  const [header, ...rest] = rows.filter((row) => row.some((value) => value !== ""));
  return rest.map((row) => Object.fromEntries(header.map((key, i) => [key.trim(), row[i] ?? ""])));
}

type PlannedMeal = { date: string; title: string };

function readPlan(folder: string): PlannedMeal[] {
  const file = findFiles(folder, (name) => /^My Weekly Meals.*_all\.csv$/i.test(name))[0];
  if (!file) return [];
  const planned: PlannedMeal[] = [];
  for (const row of readCsv(readFileSync(file, "utf8"))) {
    // Filled-in days are named "Czwartek — Owsianka sernikowa"; the rest are empty templates.
    const title = row.Name?.split(/\s+—\s+/)[1]?.trim();
    const date = new Date(`${row.Date} UTC`);
    if (!title || Number.isNaN(date.getTime())) continue;
    planned.push({ date: date.toISOString().slice(0, 10), title });
  }
  return planned;
}

/** Gives each meal of a day a different slot, preferring what the recipe is tagged for. */
function assignMeals(recipes: { title: string; meal_types: MealType[] }[]): MealType[] {
  const slots: MealType[] = ["sniadanie", "obiad", "kolacja"];
  let best: MealType[] = recipes.map((_, i) => slots[i % slots.length]);
  let bestScore = -1;

  const visit = (index: number, used: MealType[], score: number) => {
    if (index === recipes.length) {
      if (score > bestScore) {
        bestScore = score;
        best = [...used];
      }
      return;
    }
    for (const slot of slots) {
      if (used.includes(slot) && recipes.length <= slots.length) continue;
      const fits = recipes[index].meal_types.includes(slot) ? 1 : 0;
      visit(index + 1, [...used, slot], score + fits);
    }
  };
  visit(0, [], 0);
  return best;
}

// --------------------------------------------------------------- photos

/** Stores the pictures in the project's file storage and links them to the recipes. */
async function uploadPhotos(
  supabase: SupabaseClient,
  photos: Parsed[],
  idByTitle: Map<string, string>,
) {
  if (photos.length === 0) return;

  const bucket = await supabase.storage.createBucket(PHOTO_BUCKET, {
    public: true,
    fileSizeLimit: "5MB",
    allowedMimeTypes: Object.values(PHOTO_TYPES),
  });
  if (bucket.error && !/already exists/i.test(bucket.error.message)) {
    console.error(`  ✗ zdjęcia: ${bucket.error.message}`);
    return;
  }

  const ids = photos
    .map(({ draft }) => idByTitle.get(draft.title.toLowerCase()))
    .filter((id): id is string => Boolean(id));
  const current = await supabase.from("recipes").select("id, image_url").in("id", ids);
  if (current.error) throw new Error(current.error.message);
  const hasPhoto = new Set(current.data.filter((row) => row.image_url).map((row) => row.id));

  let uploaded = 0;
  for (const { draft, photo } of photos) {
    const id = idByTitle.get(draft.title.toLowerCase());
    // A picture chosen in the app wins over the one from Notion.
    if (!id || !photo || hasPhoto.has(id)) continue;

    const extension = path.extname(photo).toLowerCase();
    const name = `${id}${extension}`;
    const stored = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(name, readFileSync(photo), { contentType: PHOTO_TYPES[extension], upsert: true });
    if (stored.error) {
      console.error(`  ✗ ${draft.title}: ${stored.error.message}`);
      continue;
    }
    const address = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(name).data.publicUrl;
    const linked = await supabase.from("recipes").update({ image_url: address }).eq("id", id);
    if (linked.error) console.error(`  ✗ ${draft.title}: ${linked.error.message}`);
    else uploaded++;
  }
  console.log(`Dodano zdjęć: ${uploaded}`);
}

// ----------------------------------------------------------------- main

function readEnv(): Record<string, string | undefined> {
  const text = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  const fromFile = Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
  );
  // Variables set for this run win over the file.
  return { ...fromFile, ...process.env };
}

async function main() {
  const args = process.argv.slice(2);
  const folder = args.find((arg) => !arg.startsWith("--"));
  const save = args.includes("--save");
  const update = args.includes("--update");
  const withPlan = args.includes("--plan");
  if (!folder) {
    console.error("Podaj folder z eksportem z Notion.");
    process.exit(1);
  }

  const parsed: Parsed[] = [];
  const skipped: string[] = [];
  for (const file of findFiles(folder, (name) => name.endsWith(".md"))) {
    const markdown = readFileSync(file, "utf8");
    if (!/^(Rodzaj|Kalorie):/m.test(markdown)) continue;
    const recipe = parseRecipe(markdown, path.basename(file), path.dirname(file));
    const checked = recipe && validateRecipe(recipe.draft);
    if (!recipe || !checked || !checked.ok) {
      skipped.push(`${path.basename(file)} — ${checked && !checked.ok ? checked.error : "brak nazwy"}`);
      continue;
    }
    parsed.push({ ...recipe, draft: checked.draft });
  }
  parsed.sort((a, b) => a.draft.title.localeCompare(b.draft.title, "pl"));

  const plan = withPlan ? readPlan(folder) : [];

  console.log(`Przepisy do zaimportowania: ${parsed.length}`);
  for (const { draft, warnings } of parsed) {
    const meals = draft.meal_types.join("+") || "—";
    console.log(
      `  ${draft.title.slice(0, 58).padEnd(58)} ${String(draft.calories ?? "—").padStart(4)} kcal  ` +
        `${String(draft.ingredients.length).padStart(2)} skł.  ${String(draft.steps.length).padStart(2)} kr.  ${meals}`,
    );
    for (const warning of warnings) console.log(`      ! ${warning}`);
  }
  if (skipped.length > 0) {
    console.log(`\nPominięte (${skipped.length}):`);
    for (const line of skipped) console.log(`  ${line}`);
  }
  const photos = parsed.filter((recipe) => recipe.photo && existsSync(recipe.photo));
  console.log(`\nZdjęcia w eksporcie: ${photos.length}`);
  if (withPlan) console.log(`Posiłki w planie: ${plan.length}`);

  if (!save) {
    console.log("\nTo był podgląd. Dodaj --save, żeby zapisać do bazy.");
    return;
  }

  const env = readEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    console.error("\nW .env.local brakuje NEXT_PUBLIC_SUPABASE_URL albo SUPABASE_SECRET_KEY.");
    process.exit(1);
  }
  const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin;
  const supabase = createClient(url, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Older Node.js has no WebSocket; the import never opens a live connection.
    realtime: { transport: class {} as never },
  });

  const existing = await supabase.from("recipes").select("id, title, image_url");
  if (existing.error) {
    console.error(
      `\nBaza nie jest gotowa: ${existing.error.message}\nUruchom najpierw supabase/schema.sql w SQL Editorze.`,
    );
    process.exit(1);
  }
  const idByTitle = new Map(existing.data.map((row) => [row.title.toLowerCase(), row.id as string]));
  const imageById = new Map(
    existing.data.map((row) => [row.id as string, row.image_url as string | null]),
  );

  let added = 0;
  let updated = 0;
  let left = 0;
  for (const { draft } of parsed) {
    const id = idByTitle.get(draft.title.toLowerCase()) ?? null;
    if (id && !update) {
      left++;
      continue;
    }
    const { ingredients, ...recipe } = draft;
    // The export carries no picture address; keep the one the recipe already has.
    recipe.image_url = (id && imageById.get(id)) || "";
    const result = await supabase.rpc("save_recipe", {
      p_id: id,
      p_recipe: recipe,
      p_ingredients: ingredients,
    });
    if (result.error) {
      console.error(`  ✗ ${draft.title}: ${result.error.message}`);
      continue;
    }
    idByTitle.set(draft.title.toLowerCase(), result.data as string);
    if (id) updated++;
    else added++;
  }
  console.log(`\nDodano: ${added}, zaktualizowano: ${updated}, już były: ${left}`);

  await uploadPhotos(supabase, photos, idByTitle);

  if (!withPlan || plan.length === 0) return;

  const mealsByTitle = new Map(parsed.map(({ draft }) => [draft.title.toLowerCase(), draft]));
  const dates = [...new Set(plan.map((meal) => meal.date))].sort();
  const present = await supabase
    .from("meal_plan")
    .select("plan_date, recipe_id")
    .gte("plan_date", dates[0])
    .lte("plan_date", dates.at(-1)!);
  if (present.error) throw new Error(present.error.message);
  const taken = new Set(present.data.map((row) => `${row.plan_date}|${row.recipe_id}`));

  let planned = 0;
  for (const date of dates) {
    const meals = plan
      .filter((meal) => meal.date === date)
      .map((meal) => mealsByTitle.get(meal.title.toLowerCase()))
      .filter((draft): draft is RecipeDraft => {
        if (!draft) console.error(`  ✗ ${date}: brak przepisu z planu`);
        return Boolean(draft);
      });
    const slots = assignMeals(meals);

    for (const [index, draft] of meals.entries()) {
      const recipeId = idByTitle.get(draft.title.toLowerCase());
      if (!recipeId || taken.has(`${date}|${recipeId}`)) continue;
      const result = await supabase.from("meal_plan").insert({
        plan_date: date,
        meal_type: slots[index],
        recipe_id: recipeId,
        servings: draft.servings,
      });
      if (result.error) console.error(`  ✗ ${date} ${draft.title}: ${result.error.message}`);
      else planned++;
    }
  }
  console.log(`Wpisano do kalendarza: ${planned}`);
}

// Other scripts import the parser; only a direct run starts the import.
if (path.basename(process.argv[1] ?? "").startsWith("import-notion")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
