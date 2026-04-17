import type { Metadata } from "next";
import "./globals.css";
import Nav from "./components/Nav";

export const metadata: Metadata = { title: "Pointer Imóveis — Central de Automação & IA" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="min-h-screen flex flex-col">
          <Nav />
          <main className="flex-1 px-6 py-7 max-w-7xl mx-auto w-full">{children}</main>
        </div>
      </body>
    </html>
  );
}
