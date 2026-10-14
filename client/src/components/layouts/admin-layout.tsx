import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  ShieldCheck,
  Menu,
  X,
  Users,
  BookOpen,
  Wallet,
  FolderTree,
  Database,
  Settings,
  LogOut,
  GraduationCap,
} from "lucide-react";
import { Brand } from "@/components/learning-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
const nav = [
  { href: "/admin", title: "Umumiy", Icon: ShieldCheck },
  { href: "/admin/users", title: "Foydalanuvchilar", Icon: Users },
  { href: "/admin/lessons", title: "Darslar", Icon: BookOpen },
  { href: "/admin/moderation", title: "Kontent tekshiruvi", Icon: ShieldCheck },
  { href: "/admin/coins", title: "Coin boshqaruvi", Icon: Wallet },
  { href: "/admin/categories", title: "Kategoriyalar", Icon: FolderTree },
  { href: "/admin/collections", title: "Kurslar", Icon: BookOpen },
  { href: "/admin/data", title: "Ma’lumotlar", Icon: Database },
  { href: "/admin/settings", title: "Sozlamalar", Icon: Settings },
];
export default function AdminLayout({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const { logout } = useAuth();
  return (
    <div className="admin-app learning-app">
      <header className="app-header">
        <Brand />
        <div className="header-actions">
          <Link className="role-link" href="/studio">
            <GraduationCap size={18} />
            Studiya
          </Link>
          <Button
            variant="outline"
            aria-label={open ? "Menyuni yopish" : "Admin menyusi"}
            aria-expanded={open}
            className="admin-menu-toggle"
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </header>
      <aside
        className={open ? "admin-sidebar open" : "admin-sidebar"}
        aria-label="Admin navigatsiyasi"
      >
        {nav.map(({ href, title, Icon }) => (
          <Link
            className={location === href ? "nav-item active" : "nav-item"}
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            aria-current={location === href ? "page" : undefined}
          >
            <Icon size={20} />
            {title}
          </Link>
        ))}
        <Button
          variant="ghost"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <LogOut size={18} />
          Chiqish
        </Button>
      </aside>
      <main className="admin-main" id="main-content">
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        <div className="legacy-tools">{children}</div>
      </main>
    </div>
  );
}
