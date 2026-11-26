"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/app", label: "Painel", exact: true },
  { href: "/app/hoje", label: "Hoje" },
  { href: "/app/fila", label: "Fila" },
  { href: "/app/tarefas", label: "Tarefas" },
  { href: "/app/time", label: "Time" },
  { href: "/app/historico", label: "Histórico" },
  { href: "/app/config", label: "Mais" },
];

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="grid gap-1">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`min-h-11 border-b-2 px-1 py-2 text-base ${active ? "border-oliva text-tinta" : "border-transparent text-suave"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  name,
  team,
  children,
}: {
  name: string;
  team: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-papel text-tinta">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[220px] flex-col justify-between bg-creme px-5 py-6 min-[1100px]:flex">
        <div>
          <p className="font-serif text-4xl text-oliva">Foco</p>
          <div className="mt-8">
            <NavList pathname={pathname} />
          </div>
        </div>
        <p className="truncate text-sm text-suave">{name}</p>
      </aside>
      {open ? (
        <div className="fixed inset-0 z-40 min-[1100px]:hidden">
          <button type="button" className="absolute inset-0 bg-tinta/30" aria-label="Fechar menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[220px] flex-col justify-between bg-creme px-5 py-6">
            <div>
              <p className="font-serif text-4xl text-oliva">Foco</p>
              <div className="mt-8">
                <NavList pathname={pathname} onNavigate={() => setOpen(false)} />
              </div>
            </div>
            <p className="truncate text-sm text-suave">{name}</p>
          </aside>
        </div>
      ) : null}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-borda bg-creme px-4 py-3 min-[1100px]:hidden">
        <button type="button" className="min-h-11 px-2" aria-label="Abrir menu" onClick={() => setOpen(true)}>
          Menu
        </button>
        <p className="font-serif text-2xl text-oliva">Foco</p>
        <span className="w-11" />
      </header>
      <div className="min-[1100px]:pl-[244px] min-[1100px]:pr-[284px]">
        <main className="mx-auto w-full max-w-3xl px-4 py-6 min-[1100px]:px-6 min-[1100px]:py-8">{children}</main>
      </div>
      <aside className="fixed inset-y-0 right-0 hidden w-[260px] overflow-y-auto border-l border-borda bg-creme min-[1100px]:block">
        {team}
      </aside>
    </div>
  );
}
