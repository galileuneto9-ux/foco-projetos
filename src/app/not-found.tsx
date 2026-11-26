import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-lg place-content-center px-4 text-center">
      <h1 className="font-serif text-3xl">Não encontramos esta página.</h1>
      <Link href="/" className="mt-4 underline">
        Voltar ao início
      </Link>
    </main>
  );
}
