import type { Metadata } from "next";
import { Fraunces, Nunito_Sans } from "next/font/google";
import { RecoveryListener } from "@/components/recovery-listener";
import "./globals.css";

const sans = Nunito_Sans({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-sans" });
const serif = Fraunces({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Foco nos Projetos",
  description: "Terminar o que você começou e acompanhar o time, com no máximo três projetos ativos.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${serif.variable} h-full`}>
      <body className="min-h-full antialiased">
        <RecoveryListener />
        {children}
      </body>
    </html>
  );
}
