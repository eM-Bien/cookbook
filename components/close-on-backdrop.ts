import type { MouseEvent } from "react";

/**
 * Closes a dialog when the dimmed area around it is clicked. The browser
 * reports such a click as a click on the dialog itself, outside its box.
 */
export function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
  const dialog = event.currentTarget;
  if (event.target !== dialog) return;

  const box = dialog.getBoundingClientRect();
  const inside =
    event.clientX >= box.left &&
    event.clientX <= box.right &&
    event.clientY >= box.top &&
    event.clientY <= box.bottom;
  if (!inside) dialog.close();
}
