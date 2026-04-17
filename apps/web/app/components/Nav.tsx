"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/campaigns", label: "Campanhas" },
  { href: "/leads", label: "Leads" },
  { href: "/corretores", label: "Corretores" },
  { href: "/configuracoes", label: "Configurações" },
];

export default function Nav() {
  const path = usePathname();

  if (path === "/login") return null;

  return (
    <nav className="bg-white border-b border-gray-200 px-6 sticky top-0 z-10" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div className="flex items-center justify-between h-14">

        {/* Logo + Links */}
        <div className="flex items-center gap-8">
          <Link href="/" className="shrink-0">
            <img
              src="https://www.pointerimoveis.net.br/assets/img/logos/logo.webp"
              alt="Pointer Imóveis"
              className="h-8 w-auto object-contain"
            />
          </Link>

          <div className="flex items-center gap-1">
            {links.map((l) => {
              const active = l.href === "/"
                ? path === "/"
                : path.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`relative px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                    active
                      ? "text-blue-600 bg-blue-50"
                      : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                  }`}
                >
                  {l.label}
                  {active && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-600 rounded-full" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Status badge */}
          <div className="hidden sm:flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-green-700">IA Ativa</span>
          </div>

          {/* Logout */}
          <button
            onClick={async () => {
              await fetch("/api/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-100 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sair
          </button>
        </div>
      </div>
    </nav>
  );
}
