import Link from "next/link";

export default function NotFound() {
  return (
    <main className="centered">
      <div className="card stack">
        <h1>Nie ma takiej strony</h1>
        <p className="muted">Być może przepis został usunięty albo adres jest nieaktualny.</p>
        <Link href="/przepisy" className="btn btn-primary">
          Przejdź do przepisów
        </Link>
      </div>
    </main>
  );
}
