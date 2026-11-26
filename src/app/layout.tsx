import type { Metadata } from "next";
import { Figtree, Fraunces } from "next/font/google";
import "./globals.css";

const sans = Figtree({ subsets: ["latin"], variable: "--font-sans" });
const serif = Fraunces({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Foco nos Projetos",
  description: "Terminar o que você começou e acompanhar o time, com no máximo três projetos ativos.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${serif.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
