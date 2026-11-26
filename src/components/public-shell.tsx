import Link from "next/link";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-8">
      <Link href="/" className="font-serif text-2xl text-primary">
        Foco
      </Link>
      <div className="mt-8">{children}</div>
    </div>
  );
}
