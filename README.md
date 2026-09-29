# Książka kucharska

Przepisy, plan posiłków na każdy dzień i wspólna lista zakupów dla dwóch osób.

- **Przepisy** — dodawane ręcznie albo wczytywane z linku; serduszko oznacza ulubione.
  Podzielone na śniadania, obiady i kolacje, z dodatkowymi rodzajami (owsianki, wege…).
- **Zdjęcia** — dodawane z telefonu lub komputera przyciskiem aparatu na przepisie; przed
  wysłaniem są zmniejszane. Trafiają do publicznego magazynu `recipe-photos` w Supabase.
- **Kalorie** — na porcję przy przepisie i w sumie na każdy dzień w kalendarzu.
- **Porcje** — zmiana liczby porcji przelicza ilości składników, także miary domowe
  („4 łyżki (40 g)”).
- **Kalendarz** — przepisy przypisane do dni i posiłków, każdy z własną liczbą porcji.
- **Lista zakupów** — sumuje składniki z wybranych dni; odhaczasz to, co już masz.
- **Komentarze** — pod każdym przepisem, podpisane autorem.

Zmiany jednej osoby pojawiają się u drugiej od razu, bez odświeżania strony.

## Uruchomienie po raz pierwszy

Potrzebne: [Node.js](https://nodejs.org) w wersji 22 lub nowszej i darmowe konto na
[supabase.com](https://supabase.com).

### 1. Baza danych

1. W Supabase utwórz nowy projekt (region np. Frankfurt).
2. Otwórz **SQL Editor**, wklej całą zawartość pliku `supabase/schema.sql` i kliknij **Run**.
3. W tym samym edytorze dopisz adresy e-mail obu osób:

   ```sql
   insert into public.allowed_emails (email) values
     ('pierwsza.osoba@example.com'),
     ('druga.osoba@example.com');
   ```

   Tylko osoby z tej listy mogą wejść do aplikacji. Kont nie trzeba zakładać — powstają
   same przy pierwszym logowaniu.

4. Wyłącz samodzielną rejestrację, żeby nikt nie założył konta z pominięciem aplikacji:
   **Authentication → Sign In / Providers → Allow new users to sign up** → wyłącz.

### 2. Połączenie aplikacji z bazą

1. Skopiuj plik `.env.example` jako `.env.local`.
2. W Supabase otwórz **Project Settings → API Keys** i przepisz do `.env.local`:

   | Zmienna | Wartość |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | adres projektu, `https://….supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | klucz *publishable* |
   | `SUPABASE_SECRET_KEY` | klucz *secret* |

   Klucz *secret* daje pełny dostęp do bazy. Jego zmienna nie może mieć przedrostka
   `NEXT_PUBLIC_` — z nim trafiłby do przeglądarki.

### 3. Start

```bash
npm install
npm run dev
```

Aplikacja działa pod adresem, który wypisze terminal (zwykle http://localhost:3000).

## Udostępnienie w internecie

Żeby korzystać z telefonu i z dwóch domów, aplikację trzeba opublikować, np. na
[Vercel](https://vercel.com) (darmowy plan wystarczy):

1. Wyślij repozytorium na GitHub.
2. W Vercel wybierz **Add New → Project** i wskaż repozytorium.
3. W ustawieniach projektu dodaj te same trzy zmienne, co w `.env.local`.

## Jak to jest zbudowane

| Miejsce | Co tam jest |
| --- | --- |
| `app/(app)/` | Strony dostępne po zalogowaniu: kalendarz, przepisy, zakupy, profil |
| `app/(app)/@drawer/` | Przepis otwierany w wysuwanym panelu nad bieżącą stroną |
| `app/login/` | Logowanie samym adresem e-mail |
| `components/` | Elementy wspólne dla kilku stron |
| `lib/ingredients.ts`, `lib/units.ts` | Rozpoznawanie składników („2 łyżki masła”), jednostki, przeliczanie porcji |
| `lib/shopping.ts` | Sumowanie składników na listę zakupów |
| `scripts/import-notion.ts` | Import przepisów i planu tygodnia z eksportu Notion |
| `scripts/attach-photos.ts` | Podpinanie zdjęć do przepisów po nazwie pliku |
| `lib/recipe-import.ts`, `lib/fetch-page.ts` | Wczytywanie przepisu z linku |
| `supabase/schema.sql` | Tabele i reguły dostępu |
| `proxy.ts` | Odsyła niezalogowanych na stronę logowania |

## Logowanie

Do wejścia wystarczy adres e-mail z listy `allowed_emails`. Przy pierwszym logowaniu aplikacja
pyta jeszcze o nazwę, którą podpisuje komentarze. Nie ma haseł ani wiadomości z potwierdzeniem.

To świadomy wybór wygody ponad bezpieczeństwo: **każdy, kto zna adres z listy, może się
zalogować** i zmieniać lub usuwać dane. Po opublikowaniu aplikacji w internecie warto nie
podawać nikomu jej adresu.

Kolejną osobę dodaje się jednym poleceniem w SQL Editorze:

```sql
insert into public.allowed_emails (email) values ('nowa.osoba@example.com');
```

## Import z Notion

Przepisy z eksportu Notion (format **Markdown & CSV**, z włączonym **Include subpages**)
wczytuje skrypt:

```bash
npx tsx scripts/import-notion.ts "ścieżka/do/eksportu"                  # tylko podgląd
npx tsx scripts/import-notion.ts "ścieżka/do/eksportu" --save --plan    # zapis do bazy
```

| Opcja | Działanie |
| --- | --- |
| `--save` | Zapisuje do bazy; bez niej skrypt tylko pokazuje, co rozpoznał |
| `--plan` | Przenosi też zaplanowane posiłki do kalendarza |
| `--update` | Nadpisuje przepisy, które już są w bazie (rozpoznaje je po nazwie) |

Skrypt można uruchamiać wielokrotnie — istniejących przepisów nie dubluje.

## Zdjęcia hurtem

Zdjęcia nazwane tak jak przepisy (np. `Kurczak teriyaki.png`) można podpiąć jednym poleceniem:

```bash
npx tsx scripts/attach-photos.ts "ścieżka/do/folderu"           # tylko podgląd
npx tsx scripts/attach-photos.ts "ścieżka/do/folderu" --save    # wgranie
```

Przepisy, które mają już zdjęcie, są pomijane; `--replace` je podmienia.

## Po aktualizacji aplikacji

Gdy zmienia się plik `supabase/schema.sql`, trzeba go ponownie uruchomić w **SQL Editorze**
Supabase. Skrypt dodaje tylko to, czego brakuje, i nie usuwa danych.

## Dobrze wiedzieć

- **Nazwy składników** są sumowane wtedy, gdy są zapisane tak samo. „mąka” i „mąki” to dla
  listy zakupów dwie osobne pozycje — warto trzymać się jednej formy.
- **Wczytywanie z linku** zawsze wymaga sprawdzenia: część stron podaje składniki bez ilości,
  a niektóre blokują automatyczne pobieranie. Wtedy najszybciej skopiować listę składników
  i użyć przycisku „Wklej kilka naraz”.
- **Nowa lista zakupów** zastępuje poprzednią. „Odśwież z kalendarza” przelicza ilości,
  ale zachowuje odhaczenia i pozycje dopisane ręcznie.
