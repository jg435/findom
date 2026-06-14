"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/rules", label: "Rules" },
  { href: "/transactions", label: "Transactions" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-gray-800 bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 flex items-center gap-6 h-14">
        <span className="font-bold text-white tracking-tight">FinDom</span>
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`text-sm ${
              pathname.startsWith(href)
                ? "text-white font-medium"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
