"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

const LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/kalendarz", label: "Kalendarz", icon: "calendar" },
  { href: "/przepisy", label: "Przepisy", icon: "book" },
  { href: "/zakupy", label: "Zakupy", icon: "cart" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="nav-links" aria-label="Główne">
      {LINKS.map(({ href, label, icon }) => (
        <Link
          key={href}
          href={href}
          className="nav-link"
          aria-current={
            pathname.startsWith(href) || (href === "/przepisy" && pathname === "/nowy-przepis")
              ? "page"
              : undefined
          }
        >
          <Icon name={icon} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
