"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/app", label: "Hoje", exact: true },
  { href: "/app/fila", label: "Fila" },
  { href: "/app/time", label: "Time" },
  { href: "/app/historico", label: "Histórico" },
  { href: "/app/config", label: "Mais" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur" aria-label="Principal">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 items-center justify-center text-xs font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
