import type { TeamPerson } from "@/server/team-snapshot";

export function TeamColumn({ people, ranked }: { people: TeamPerson[]; ranked: TeamPerson[] }) {
  return (
    <div className="flex h-full flex-col gap-8 bg-creme p-5">
      <section className="grid gap-4">
        <h2 className="font-serif text-2xl">Time</h2>
        <ul className="grid gap-4">
          {people.map((person) => (
            <li key={person.userId} className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-papel text-sm text-suave">
                {person.initials}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{person.name}</span>
                <span className="block truncate text-sm text-suave">{person.line}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="grid gap-2">
        <h2 className="font-serif text-xl">Placar da semana</h2>
        <ol className="grid gap-1">
          {ranked.map((person) => (
            <li key={person.userId} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">
                {person.initials} {person.name}
              </span>
              <span className="tabular-nums text-suave">{person.points}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
