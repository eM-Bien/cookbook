export function SetupNotice({ reason }: { reason: "env" | "schema" | "update" }) {
  return (
    <main className="centered">
      <div className="card wide stack">
        <h1>{reason === "update" ? "Baza wymaga aktualizacji" : "Jeszcze chwila konfiguracji"}</h1>
        {reason === "env" && (
          <>
            <p className="muted">
              Aplikacja nie wie jeszcze, z którą bazą Supabase ma się połączyć.
            </p>
            <ol className="steps-list">
              <li>
                Załóż darmowy projekt na <strong>supabase.com</strong>.
              </li>
              <li>
                W projekcie otwórz <strong>Project Settings → API Keys</strong> i skopiuj adres
                projektu, klucz <em>publishable</em> oraz klucz <em>secret</em>.
              </li>
              <li>
                Skopiuj plik <code>.env.example</code> jako <code>.env.local</code> i wklej tam
                wszystkie trzy wartości.
              </li>
              <li>
                Zatrzymaj i uruchom ponownie <code>npm run dev</code>.
              </li>
            </ol>
          </>
        )}
        {reason === "schema" && (
          <>
            <p className="muted">
              Połączenie z Supabase działa, ale w bazie nie ma jeszcze tabel aplikacji.
            </p>
            <ol className="steps-list">
              <li>
                W Supabase otwórz <strong>SQL Editor</strong>.
              </li>
              <li>
                Wklej całą zawartość pliku <code>supabase/schema.sql</code> i kliknij{" "}
                <strong>Run</strong>.
              </li>
              <li>
                Dopisz swoje adresy e-mail do tabeli <code>allowed_emails</code> (instrukcja jest na
                końcu tego pliku).
              </li>
              <li>Odśwież tę stronę.</li>
            </ol>
          </>
        )}
        {reason === "update" && (
          <>
            <p className="muted">
              Aplikacja jest nowsza niż baza danych — brakuje w niej kilku kolumn. Twoje dane są
              bezpieczne, aktualizacja niczego nie usuwa.
            </p>
            <ol className="steps-list">
              <li>
                W Supabase otwórz <strong>SQL Editor</strong>.
              </li>
              <li>
                Wklej całą zawartość pliku <code>supabase/schema.sql</code> i kliknij{" "}
                <strong>Run</strong>.
              </li>
              <li>Odśwież tę stronę.</li>
            </ol>
          </>
        )}
        <p className="muted small">Pełna instrukcja krok po kroku jest w pliku README.md.</p>
      </div>
    </main>
  );
}
