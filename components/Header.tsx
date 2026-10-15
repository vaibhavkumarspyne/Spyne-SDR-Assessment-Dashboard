import Link from "next/link";
import type { User } from "@/db/schema";
import { logout } from "@/app/actions";

const ADMIN_TABS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/tests", label: "Tests" },
  { href: "/admin/bank", label: "Test bank" },
  { href: "/admin/users", label: "Users" },
];

export default function Header({ user, active }: { user: User; active: string }) {
  const tabs =
    user.role === "admin"
      ? ADMIN_TABS
      : [
          { href: "/tests", label: "Tests" },
          { href: `/history/${user.id}`, label: "My history" },
        ];
  return (
    <>
      <header className="top">
        <div>
          <h1><Link href="/">SDR Certification Board</Link></h1>
          <p className="sub">Spyne SDR training. Weekly tests, results and go-live readiness.</p>
        </div>
        <div className="who">
          <span>{user.name || user.email}</span>
          <span className="role">{user.role}</span>
          <form action={logout} className="inline">
            <button className="btn ghost sm">Sign out</button>
          </form>
        </div>
      </header>
      <nav className="tabs">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className="tab" aria-current={active === t.href ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
