type Dimension = "mass" | "volume";

type UnitDef = {
  /** Polish forms: 1 łyżka, 2 łyżki, 5 łyżek, 1,5 łyżki */
  forms: [one: string, few: string, many: string, fraction: string];
  aliases: string[];
  base?: { dimension: Dimension; factor: number };
};

function abbr(symbol: string): UnitDef["forms"] {
  return [symbol, symbol, symbol, symbol];
}

const UNIT_DEFS: Record<string, UnitDef> = {
  g: {
    forms: abbr("g"),
    aliases: ["gr", "gram", "gramy", "gramów", "grama", "grams"],
    base: { dimension: "mass", factor: 1 },
  },
  dag: {
    forms: abbr("dag"),
    aliases: ["dkg", "deko", "dekagram", "dekagramy", "dekagramów"],
    base: { dimension: "mass", factor: 10 },
  },
  kg: {
    forms: abbr("kg"),
    aliases: ["kilo", "kilogram", "kilogramy", "kilogramów", "kilograma"],
    base: { dimension: "mass", factor: 1000 },
  },
  ml: {
    forms: abbr("ml"),
    aliases: ["mililitr", "mililitry", "mililitrów", "mililitra"],
    base: { dimension: "volume", factor: 1 },
  },
  l: {
    forms: abbr("l"),
    aliases: ["litr", "litry", "litrów", "litra"],
    base: { dimension: "volume", factor: 1000 },
  },
  łyżka: {
    forms: ["łyżka", "łyżki", "łyżek", "łyżki"],
    aliases: ["łyżkę", "łyżką", "tbsp", "tablespoon", "tablespoons"],
  },
  łyżeczka: {
    forms: ["łyżeczka", "łyżeczki", "łyżeczek", "łyżeczki"],
    aliases: ["łyżeczkę", "łyżeczką", "tsp", "teaspoon", "teaspoons"],
  },
  szklanka: {
    forms: ["szklanka", "szklanki", "szklanek", "szklanki"],
    aliases: ["szklankę", "szklanką", "szkl", "cup", "cups"],
  },
  "szt.": {
    forms: abbr("szt."),
    aliases: ["szt", "sztuka", "sztuki", "sztuk", "sztukę"],
  },
  ząbek: {
    forms: ["ząbek", "ząbki", "ząbków", "ząbka"],
    aliases: [],
  },
  pęczek: {
    forms: ["pęczek", "pęczki", "pęczków", "pęczka"],
    aliases: [],
  },
  opakowanie: {
    forms: ["opakowanie", "opakowania", "opakowań", "opakowania"],
    aliases: ["op", "opak", "paczka", "paczki", "paczek", "paczkę"],
  },
  puszka: {
    forms: ["puszka", "puszki", "puszek", "puszki"],
    aliases: ["puszkę"],
  },
  słoik: {
    forms: ["słoik", "słoiki", "słoików", "słoika"],
    aliases: [],
  },
  plaster: {
    forms: ["plaster", "plastry", "plastrów", "plastra"],
    aliases: ["plasterek", "plasterki", "plasterków", "plasterka"],
  },
  kostka: {
    forms: ["kostka", "kostki", "kostek", "kostki"],
    aliases: ["kostkę"],
  },
  szczypta: {
    forms: ["szczypta", "szczypty", "szczypt", "szczypty"],
    aliases: ["szczyptę", "szczyptą"],
  },
  garść: {
    forms: ["garść", "garście", "garści", "garści"],
    aliases: [],
  },
  kromka: {
    forms: ["kromka", "kromki", "kromek", "kromki"],
    aliases: ["kromkę"],
  },
  łodyga: {
    forms: ["łodyga", "łodygi", "łodyg", "łodygi"],
    aliases: ["łodygę"],
  },
  porcja: {
    forms: ["porcja", "porcje", "porcji", "porcji"],
    aliases: ["porcję"],
  },
};

const ALIAS_TO_UNIT = new Map<string, string>();
for (const [unit, def] of Object.entries(UNIT_DEFS)) {
  for (const form of [unit, ...def.forms, ...def.aliases]) {
    ALIAS_TO_UNIT.set(form.toLowerCase().replace(/\.$/, ""), unit);
  }
}

export const UNITS = Object.keys(UNIT_DEFS);

/** Units that mean "one of" even without a number in front ("szczypta soli"). */
export const IMPLICIT_ONE_UNITS = new Set(["szczypta", "garść", "pęczek"]);

export function normalizeUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return ALIAS_TO_UNIT.get(raw.trim().toLowerCase().replace(/\.$/, "")) ?? null;
}

/**
 * Quantities that can be added together share a dimension: grams with
 * kilograms, or any unit with itself.
 */
export function toBase(
  quantity: number | null,
  unit: string | null,
): { quantity: number | null; unit: string | null; dimension: string } {
  const def = unit ? UNIT_DEFS[unit] : undefined;
  if (quantity === null) return { quantity: null, unit: null, dimension: "none" };
  if (def?.base) {
    return {
      quantity: quantity * def.base.factor,
      unit: def.base.dimension === "mass" ? "g" : "ml",
      dimension: def.base.dimension,
    };
  }
  return { quantity, unit, dimension: unit ?? "count" };
}

export function formatQuantity(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString("pl-PL", { maximumFractionDigits: 2, useGrouping: false });
}

function unitForm(unit: string, quantity: number): string {
  const def = UNIT_DEFS[unit];
  if (!def) return unit;
  const [one, few, many, fraction] = def.forms;
  if (!Number.isInteger(quantity)) return fraction;
  if (quantity === 1) return one;
  const lastTwo = quantity % 100;
  const last = quantity % 10;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
}

/** "1,5 kg", "2 łyżki", "3" — empty string when there is no quantity. */
export function formatAmount(quantity: number | null, unit: string | null): string {
  if (quantity === null) return "";
  let value = Math.round(quantity * 100) / 100;
  let shown = unit;
  if (unit === "g" && value >= 1000) {
    value = Math.round(value / 10) / 100;
    shown = "kg";
  } else if (unit === "ml" && value >= 1000) {
    value = Math.round(value / 10) / 100;
    shown = "l";
  }
  const number = formatQuantity(value);
  return shown ? `${number} ${unitForm(shown, value)}` : number;
}

/** "4 łyżki (40 g)" when both a household measure and a weight are known. */
export function formatAmounts(
  quantity: number | null,
  unit: string | null,
  altQuantity: number | null | undefined,
  altUnit: string | null | undefined,
): string {
  const main = formatAmount(quantity, unit);
  const alt = formatAmount(altQuantity ?? null, altUnit ?? null);
  return main && alt ? `${alt} (${main})` : main || alt;
}
