"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="empty">
      <h2>Coś poszło nie tak</h2>
      <p>Nie udało się wczytać tej strony. Sprawdź połączenie z internetem i spróbuj ponownie.</p>
      <button type="button" className="btn btn-primary" onClick={reset}>
        Spróbuj ponownie
      </button>
    </div>
  );
}
