import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 3_000_000;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 12_000;

export class FetchPageError extends Error {}

function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  return (
    ip === "::" ||
    ip === "::1" ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe8") ||
    ip.startsWith("fe9") ||
    ip.startsWith("fea") ||
    ip.startsWith("feb")
  );
}

// The address comes from the user and is fetched from our server, so it must
// not be able to reach anything that is only visible from inside the network.
async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new FetchPageError("Adres musi zaczynać się od http:// lub https://.");
  }
  if (url.username || url.password) {
    throw new FetchPageError("Adres nie może zawierać loginu ani hasła.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new FetchPageError("Nie udało się znaleźć tej strony. Sprawdź adres.");
    }
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new FetchPageError("Ten adres nie jest publiczną stroną internetową.");
  }
}

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
}

export async function fetchPage(rawUrl: string): Promise<{ html: string; url: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new FetchPageError("To nie wygląda na poprawny adres strony.");
  }

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicUrl(url);
      // Redirects are followed by hand so every hop gets the same check.
      const response = await fetch(url, {
        redirect: "manual",
        signal,
        cache: "no-store",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; KsiazkaKucharska/1.0)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "pl,en;q=0.8",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => {});
        if (!location) break;
        url = new URL(location, url);
        continue;
      }
      if (response.status === 401 || response.status === 403 || response.status === 429) {
        throw new FetchPageError(
          "Ta strona nie pozwala na automatyczne pobieranie. Wpisz przepis ręcznie — składniki możesz wkleić hurtem.",
        );
      }
      if (response.status === 404) {
        throw new FetchPageError("Pod tym adresem nie ma strony. Sprawdź, czy link jest pełny.");
      }
      if (!response.ok) {
        throw new FetchPageError(`Strona odpowiedziała błędem (${response.status}).`);
      }
      return { html: await readLimited(response), url: url.toString() };
    }
  } catch (error) {
    if (error instanceof FetchPageError) throw error;
    throw new FetchPageError("Nie udało się pobrać strony. Spróbuj ponownie lub wpisz przepis ręcznie.");
  }
  throw new FetchPageError("Strona przekierowuje zbyt wiele razy.");
}
