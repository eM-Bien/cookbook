"use client";

import Link from "next/link";
import { VIEWS, VIEW_COOKIE, type CalendarView } from "./views";

export function ViewSwitcher({ view, date }: { view: CalendarView; date: string }) {
  return (
    <nav className="chips" aria-label="Widok kalendarza">
      {VIEWS.map((option) => (
        <Link
          key={option.value}
          href={`/kalendarz?widok=${option.value}&data=${date}`}
          className="chip"
          aria-current={view === option.value ? "true" : undefined}
          onClick={() => {
            document.cookie = `${VIEW_COOKIE}=${option.value}; path=/; max-age=31536000; samesite=lax`;
          }}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
