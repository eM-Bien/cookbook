"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const CLOSE_MS = 200;

/**
 * A panel over the current page: slides in from the left on wide screens and
 * from the bottom on phones. Closing it goes back to the page underneath.
 */
export function Drawer({ label, children }: { label: string; children: React.ReactNode }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const leaving = useRef(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const close = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    setClosing(true);
    // Lets the slide-out finish before the drawer disappears.
    setTimeout(() => router.back(), CLOSE_MS);
  }, [router]);

  return (
    <dialog
      ref={dialog}
      className={closing ? "drawer is-closing" : "drawer"}
      aria-label={label}
      onCancel={(event) => {
        // Escape inside a dialog opened from the drawer closes only that dialog.
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("[data-drawer-close]")) return close();
        if (target !== event.currentTarget) return;
        // A click on the dialog element itself is either its edge or the backdrop.
        const box = event.currentTarget.getBoundingClientRect();
        const inside =
          event.clientX >= box.left &&
          event.clientX <= box.right &&
          event.clientY >= box.top &&
          event.clientY <= box.bottom;
        if (!inside) close();
      }}
    >
      <div className="drawer-handle" aria-hidden="true" />
      <div className="drawer-body">{children}</div>
    </dialog>
  );
}
