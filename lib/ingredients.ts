import type { Category, Ingredient } from "./types";
import { IMPLICIT_ONE_UNITS, normalizeUnit } from "./units";

const UNICODE_FRACTIONS: Record<string, string> = {
  "½": "1/2",
  "⅓": "1/3",
  "⅔": "2/3",
  "¼": "1/4",
  "¾": "3/4",
  "⅛": "1/8",
};

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const LEADING_QUANTITY = new RegExp(
  String.raw`^(?:(\d+)\s+(?:i\s+)?(\d+)\s*/\s*(\d+)|(\d+)\s*/\s*(\d+)|(${NUMBER})\s*[-–]\s*(${NUMBER})|(${NUMBER}))\s*`,
);
const TRAILING_QUANTITY = new RegExp(
  String.raw`^(.+?)\s*[:\-–,]?\s+(${NUMBER})\s*([\p{L}.]+)?$`,
  "u",
);

function toNumber(text: string): number {
  return Number(text.replace(",", "."));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function cleanName(text: string): string {
  return text
    .replace(/^[\s,.:\-–]+/, "")
    .replace(/[\s,.:\-–]+$/, "")
    .replace(/\s+/g, " ");
}

/** First word of `text` as a unit, if it is one. */
function takeUnit(text: string): { unit: string | null; rest: string } {
  const match = text.match(/^([\p{L}]+\.?)(?=\s|$)\s*(.*)$/u);
  if (!match) return { unit: null, rest: text };
  const unit = normalizeUnit(match[1]);
  // A bare unit with nothing after it ("2 l") is more likely a name fragment.
  if (!unit || !match[2]) return { unit: null, rest: text };
  return { unit, rest: match[2] };
}

// Checked in order; the first category with a matching fragment wins, so more
// specific entries ("papryka słodka", "bułka tarta") come before general ones.
// A fragment matches the beginning of a word; one ending with a space must
// match the whole word, which keeps "wino" from claiming "winogrona".
const CATEGORY_HINTS: [Category, string[]][] = [
  // Exceptions first: names that a later, broader fragment would misplace.
  ["nabiał i jajka", ["jogurt", "kvarg", "skyr", "yopro", "serek", "pudding", "burrat"]],
  [
    "produkty suche",
    ["konserwow", "pomidory z puszki", "pomidorów z puszki", "pomidory suszone", "pomidorów suszonych"],
  ],
  [
    "warzywa i owoce",
    [
      "papryczk", "świeże lub mrożone", "świeży lub mrożony", "świeża lub mrożona", "skórka z",
      "skórki z",
    ],
  ],
  [
    "przyprawy",
    [
      "bazylia suszona", "bazylii suszonej", "kumin", "wanilia ", "wanilii ", "ekstrakt wanili",
      "aromat wanili",
      "papryka słodka", "papryka ostra", "papryka wędzona", "papryka mielona", "papryki słodkiej",
      "papryki ostrej", "papryki wędzonej", "papryki mielonej", "sól ", "soli ", "pieprz", "oregano",
      "tymian", "cynamon", "kurkum", "kmin", "ziele angielskie", "ziela angielskiego",
      "liść laurow", "liści laurow", "liście laurow", "majeran", "curry", "gałk", "goździk",
      "kolendra mielona", "kolendry mielonej", "czosnek granulowany", "czosnku granulowanego",
      "chili", "przypraw", "kardamon", "imbir mielony", "imbiru mielonego",
      "zioła prowansalskie", "ziół prowansalskich",
    ],
  ],
  [
    "produkty suche",
    [
      "bułka tarta", "bułki tartej", "mąk", "cukier", "cukr", "ryż", "makaron", "kasz", "płatk",
      "olej", "oliw", "ocet", "octu", "sos ", "sosu ", "koncentrat", "passat", "fasola ", "fasoli ",
      "ciecierzyc", "soczewic", "orzech", "migdał", "drożdż", "proszek do pieczenia",
      "proszku do pieczenia", "soda ", "sody ", "miód", "miodu", "kakao", "czekolad", "rodzyn",
      "bulion", "musztard", "ketchup", "majonez", "pomidory w puszce", "pomidorów w puszce",
      "mleko kokosowe", "mleka kokosowego", "mleczko kokosowe", "mleczka kokosowego", "masło orzechowe",
      "masła orzechowego", "sezam", "pestki", "pestek", "skrobi", "dżem", "kapary", "nutell",
      "tahini", "syrop", "nasiona", "erytr", "puder", "odżywk", "pasta pistacjow", "pesto",
      "chrzan", "hummus", "wafle", "budyń", "cukier wanili", "cukru wanili",
    ],
  ],
  ["mrożonki", ["mrożon", "hortex"]],
  [
    "mięso i ryby",
    [
      "kurczak", "piersi", "pierś", "udk", "udek", "wołow", "wieprz", "schab", "boczek", "boczku",
      "szynk", "kiełbas", "łosoś", "łososi", "dorsz", "tuńczyk", "mielon", "indyk", "krewet",
      "karkówk", "polędwic", "żeber", "śledz", "śledź", "makrel", "mięso", "mięsa", "filet",
      "pstrąg", "kabanos",
    ],
  ],
  [
    "nabiał i jajka",
    [
      "mlek", "masł", "śmietan", "jogurt", "twaróg", "twarog", "jaj", "kefir", "maślank",
      "mozzarell", "parmezan", "feta ", "fety ", "ser ", "sera ", "serek", "serka", "mascarpone",
      "ricott", "camembert",
    ],
  ],
  ["pieczywo", ["chleb", "bułk", "bułek", "tortill", "bagiet", "pita ", "pity ", "tost"]],
  [
    "napoje",
    ["sok ", "soku ", "woda gazowana", "wody gazowanej", "wino ", "wina ", "piwo ", "piwa "],
  ],
  [
    "warzywa i owoce",
    [
      "pomidor", "cebul", "czosn", "marchew", "marchw", "ziemniak", "papryk", "ogór", "sałat",
      "jabł", "cytryn", "limonk", "banan", "pietrusz", "koper", "kopru", "szczypior", "bazyli",
      "kolendr", "mięt", "por ", "pora ", "pory ", "seler", "cukini", "bakłażan", "brokuł",
      "kalafior", "kapust", "szpinak", "rukol", "burak", "dyni", "pieczark", "grzyb", "awokado",
      "imbir", "pomarańcz", "truskaw", "malin", "borów", "jagod", "gruszk", "śliwk", "rzodkiew",
      "fasolk", "szparag", "groszek", "groszku", "kukurydz", "batat", "natk", "jarmuż",
      "winogron", "mango", "ananas", "kiwi", "mandaryn", "rabarbar", "roszponk", "brzoskwin",
      "wiśni", "porzeczk", "kiełki", "kiełków",
    ],
  ],
];

export function guessCategory(name: string): Category {
  const haystack = ` ${name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
  for (const [category, fragments] of CATEGORY_HINTS) {
    if (fragments.some((f) => haystack.includes(` ${f}`))) return category;
  }
  return "inne";
}

/** Turns "2 łyżki masła", "1/2 szklanki mleka" or "mąka - 500 g" into parts. */
export function parseIngredientLine(line: string): Ingredient | null {
  let text = line.replace(/^[\s•*\-–·▢□]+/, "").trim();
  for (const [symbol, fraction] of Object.entries(UNICODE_FRACTIONS)) {
    // "1½" means one and a half, so keep the whole number separate.
    text = text.replaceAll(symbol, ` ${fraction}`);
  }
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return null;

  let quantity: number | null = null;
  let unit: string | null = null;
  let name = text;

  const leading = text.match(LEADING_QUANTITY);
  if (leading) {
    const [all, whole, wholeNum, wholeDen, num, den, rangeFrom, rangeTo, plain] = leading;
    if (whole) quantity = Number(whole) + Number(wholeNum) / Number(wholeDen);
    else if (num) quantity = Number(num) / Number(den);
    // For a range, buy enough for the upper end.
    else if (rangeFrom) quantity = Math.max(toNumber(rangeFrom), toNumber(rangeTo));
    else quantity = toNumber(plain);

    const afterQuantity = takeUnit(text.slice(all.length));
    unit = afterQuantity.unit;
    name = afterQuantity.rest;
  } else {
    const firstWord = takeUnit(text);
    if (firstWord.unit && IMPLICIT_ONE_UNITS.has(firstWord.unit)) {
      quantity = 1;
      unit = firstWord.unit;
      name = firstWord.rest;
    } else {
      const trailing = text.match(TRAILING_QUANTITY);
      const trailingUnit = trailing?.[3] ? normalizeUnit(trailing[3]) : null;
      // Without a recognised unit a trailing number is too ambiguous ("mąka typ 650").
      if (trailing && trailingUnit) {
        quantity = toNumber(trailing[2]);
        unit = trailingUnit;
        name = trailing[1];
      }
    }
  }

  if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) quantity = null;
  name = cleanName(name);
  if (!name) return null;

  return {
    name: name.slice(0, 200),
    quantity: quantity === null ? null : round(quantity),
    unit,
    category: guessCategory(name),
  };
}

export function parseIngredientLines(text: string): Ingredient[] {
  return text
    .split(/\r?\n/)
    .map(parseIngredientLine)
    .filter((i): i is Ingredient => i !== null);
}

export function scaleQuantity(
  quantity: number | null,
  recipeServings: number,
  wantedServings: number,
): number | null {
  if (quantity === null) return null;
  if (recipeServings <= 0) return quantity;
  return round((quantity * wantedServings) / recipeServings);
}
