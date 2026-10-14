import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  BookOpen,
  Home,
  Bookmark,
  UserRound,
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  GraduationCap,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/learning-api";
import { WalletBadge } from "@/components/commerce-wallet";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="TUBE MENTOR bosh sahifa">
      <span className="brand-mark">
        <BookOpen size={21} />
      </span>
      <span>
        TUBE <strong>MENTOR</strong>
      </span>
    </Link>
  );
}
const navigation = [
  { href: "/today", title: "Bugun", Icon: Home },
  { href: "/courses", title: "Darslar", Icon: BookOpen },
  { href: "/words", title: "Lug‘atim", Icon: Bookmark },
  { href: "/wallet", title: "Coin", Icon: Wallet },
  { href: "/profile", title: "Profil", Icon: UserRound },
];
export function LearningShell({
  children,
  title,
  back,
  studio = false,
}: {
  children: ReactNode;
  title?: string;
  back?: string;
  studio?: boolean;
}) {
  const [location] = useLocation();
  const { user } = useAuth();
  const nav = studio
    ? [
        { href: "/studio", title: "Darslarim", Icon: GraduationCap },
        { href: "/studio/courses", title: "Kurslar", Icon: BookOpen },
        { href: "/profile", title: "Profil", Icon: UserRound },
      ]
    : navigation;
  const isActive = (href: string) =>
    location === href ||
    (href === "/courses" &&
      (location.startsWith("/learn/") || location.startsWith("/courses/"))) ||
    (href === "/studio" &&
      (location.startsWith("/studio/lessons/") ||
        location === "/studio/new")) ||
    (href === "/studio/courses" && location.startsWith("/studio/courses/"));
  return (
    <div className="learning-app">
      <header className="app-header">
        <Brand />
        <div className="header-actions">
          {user?.role === "admin" && (
            <Link href="/admin" className="role-link">
              <ShieldCheck size={18} /> Admin
            </Link>
          )}
          {user && user.role !== "admin" && <WalletBadge />}
          {!user ? (
            <Link href="/login" className="role-link">
              Kirish
            </Link>
          ) : (
            <Link
              href="/profile"
              className="user-avatar"
              aria-label="Profilni ochish"
            >
              {user.fullName.slice(0, 1)}
            </Link>
          )}
        </div>
      </header>
      <aside className="learning-sidebar">
        <p>{studio ? "O‘qituvchi studiyasi" : "Sizning o‘quv yo‘lingiz"}</p>
        {nav.map(({ href, title, Icon }) => (
          <Link
            key={href}
            href={href}
            className={isActive(href) ? "nav-item active" : "nav-item"}
          >
            <Icon size={21} />
            {title}
          </Link>
        ))}
        {studio && (
          <Link href="/today" className="nav-item">
            <Home size={21} /> O‘quvchi ko‘rinishi
          </Link>
        )}
        {!studio && user && <Link href="/support" className="quiet-link">Yordam va murojaatlar</Link>}
      </aside>
      <main id="main-content" className="learning-main">
        {title && (
          <div className="page-heading">
            {back && (
              <Link href={back} className="icon-action" aria-label="Ortga">
                <ArrowLeft size={22} />
              </Link>
            )}
            <h1>{title}</h1>
          </div>
        )}
        {children}
      </main>
      <nav aria-label="Asosiy navigatsiya" className="learning-bottom-nav">
        {nav.map(({ href, title, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={active ? "active" : ""}
            >
              <Icon size={23} />
              <span>{title}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`learning-panel ${className}`}>{children}</section>
  );
}
export function Loading() {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="animate-spin" size={28} />
      <span>Yuklanmoqda…</span>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <Panel>
      <div role="alert" className="error-state">
        <h2>Hozir ochib bo‘lmadi</h2>
        <p>{errorText(error)}</p>
        {retry && <Button onClick={retry}>Qayta urinish</Button>}
      </div>
    </Panel>
  );
}
export function EmptyState({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <Panel className="empty-state">
      <BookOpen size={34} />
      <h2>{title}</h2>
      <p>{description}</p>
      {href && (
        <Link href={href} className="primary-link">
          {action || "Darslarni ochish"}
          <ArrowRight size={18} />
        </Link>
      )}
    </Panel>
  );
}
export function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, Math.max(0, value))}
    >
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
