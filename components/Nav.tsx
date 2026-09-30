"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard", icon: "▚" },
  { href: "/contacts", label: "Contacts", icon: "◉" },
  { href: "/campaigns", label: "Campaigns", icon: "✉" },
  { href: "/research", label: "GitHub Research", icon: "⌕" },
  { href: "/suppression", label: "Suppression", icon: "⊘" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {links.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span className="w-5 text-center text-base">{l.icon}</span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
