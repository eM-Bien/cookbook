// Attaches photos to recipes in bulk. Each file is named after its recipe,
// e.g. "Kurczak teriyaki.png".
//
//   npx tsx scripts/attach-photos.ts <folder>             preview only
//   npx tsx scripts/attach-photos.ts <folder> --save      upload and attach
//
// Options: --replace  also replace photos that recipes already have
//
// Reads the connection details from .env.local.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "recipe-photos";
const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Makes names comparable: case, accents written two ways and stray spaces do not matter. */
function key(name: string): string {
  return name.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

function readEnv(): Record<string, string | undefined> {
  const text = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  const fromFile = Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
  );
  return { ...fromFile, ...process.env };
}

async function main() {
  const args = process.argv.slice(2);
  const folder = args.find((arg) => !arg.startsWith("--"));
  const save = args.includes("--save");
  const replace = args.includes("--replace");
  if (!folder) {
    console.error("Podaj folder ze zdjęciami.");
    process.exit(1);
  }

  const env = readEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    console.error("W .env.local brakuje NEXT_PUBLIC_SUPABASE_URL albo SUPABASE_SECRET_KEY.");
    process.exit(1);
  }
  const supabase = createClient(
    new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin,
    env.SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      // Older Node.js has no WebSocket; this script never opens a live connection.
      realtime: { transport: class {} as never },
    },
  );

  const recipes = await supabase.from("recipes").select("id, title, image_url");
  if (recipes.error) throw new Error(recipes.error.message);
  const byTitle = new Map(recipes.data.map((recipe) => [key(recipe.title), recipe]));

  const files = readdirSync(folder).filter((name) => TYPES[path.extname(name).toLowerCase()]);
  const plan = files.map((name) => {
    const recipe = byTitle.get(key(path.basename(name, path.extname(name))));
    const status = !recipe ? "brak przepisu" : recipe.image_url && !replace ? "ma już zdjęcie" : "do dodania";
    return { name, recipe, status };
  });

  for (const { name, status } of plan) console.log(`  ${status.padEnd(16)} ${name}`);
  const todo = plan.filter((item) => item.status === "do dodania");
  console.log(`\nZdjęć: ${files.length}, do dodania: ${todo.length}`);

  if (!save) {
    console.log("To był podgląd. Dodaj --save, żeby wgrać zdjęcia.");
    return;
  }

  const bucket = await supabase.storage.createBucket(BUCKET, { public: true });
  if (bucket.error && !/already exists/i.test(bucket.error.message)) {
    throw new Error(bucket.error.message);
  }
  const prefix = supabase.storage.from(BUCKET).getPublicUrl("").data.publicUrl;

  let attached = 0;
  for (const { name, recipe } of todo) {
    const extension = path.extname(name).toLowerCase();
    const stored = `${recipe!.id}${extension}`;
    const upload = await supabase.storage
      .from(BUCKET)
      .upload(stored, readFileSync(path.join(folder, name)), {
        contentType: TYPES[extension],
        upsert: true,
      });
    if (upload.error) {
      console.error(`  ✗ ${name}: ${upload.error.message}`);
      continue;
    }

    // The time stamp makes browsers fetch the new picture instead of a remembered one.
    const address = `${prefix}${stored}?v=${Date.now()}`;
    const linked = await supabase
      .from("recipes")
      .update({ image_url: address })
      .eq("id", recipe!.id);
    if (linked.error) {
      console.error(`  ✗ ${name}: ${linked.error.message}`);
      continue;
    }

    const old = recipe!.image_url as string | null;
    const oldName = old?.startsWith(prefix) ? old.slice(prefix.length).split("?")[0] : null;
    if (oldName && oldName !== stored) await supabase.storage.from(BUCKET).remove([oldName]);
    attached++;
  }
  console.log(`Dodano zdjęć: ${attached}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
