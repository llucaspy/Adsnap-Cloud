import type { Metadata } from "next";
import { JetBrains_Mono, DM_Sans } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { NexusChat } from "@/components/NexusChat";
import { ScrollEffects } from "@/components/ScrollEffects";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap"
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Adsnap v2",
  description: "Automação de Captura de Mídia",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${jetbrainsMono.variable} ${dmSans.variable} font-sans flex min-h-screen`} style={{ fontFamily: 'var(--font-body)' }}>
        <ScrollEffects />
        <Sidebar />
        <main className="flex-1 overflow-auto" style={{ background: 'var(--bg-primary)' }}>
          <div className="max-w-[1600px] mx-auto p-8 lg:p-12">
            {children}
          </div>
        </main>
        <NexusChat />
      </body>
    </html>
  );
}
