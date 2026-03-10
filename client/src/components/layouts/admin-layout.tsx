import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  GraduationCap,
  Shield,
  Users,
  BookOpen,
  ShieldCheck,
  Coins,
  FolderTree,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  UserCircle,
  Database,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

const adminNavItems = [
  { href: "/admin", label: "Admin paneli", icon: Shield },
  { href: "/admin/users", label: "Foydalanuvchilar", icon: Users },
  { href: "/admin/lessons", label: "Darslar", icon: BookOpen },
  { href: "/admin/moderation", label: "Moderatsiya", icon: ShieldCheck },
  { href: "/admin/coins", label: "Coin boshqaruvi", icon: Coins },
  { href: "/admin/categories", label: "Kategoriyalar", icon: FolderTree },
  { href: "/admin/data", label: "Ma'lumotlar markazi", icon: Database },
  { href: "/admin/settings", label: "Sozlamalar", icon: Settings },
];

function AdminSidebarContent({ currentPath }: { currentPath: string }) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-5">
        <Link href="/admin">
          <div className="flex items-center gap-2.5 cursor-pointer">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight block" data-testid="text-admin-sidebar-brand">Tube Mentor</span>
              <span className="text-[10px] font-medium text-violet-400 tracking-widest uppercase">Admin Panel</span>
            </div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-1" data-testid="nav-admin-sidebar">
        {adminNavItems.map((item) => {
          const isActive = currentPath === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer group ${
                  isActive
                    ? "bg-violet-500/10 text-violet-400 shadow-sm shadow-violet-500/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                data-testid={`nav-admin-item-${item.href.replace(/\//g, "-").slice(1)}`}
              >
                <item.icon className={`w-4.5 h-4.5 ${isActive ? "text-violet-400" : "text-muted-foreground group-hover:text-foreground"}`} />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-violet-400/60" />}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 mt-auto">
        <div className="rounded-lg bg-violet-500/5 border border-violet-500/10 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="w-3.5 h-3.5 text-violet-400" />
            <span>Administrator rejimi</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const initials = user?.fullName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "A";

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden lg:flex w-64 flex-col fixed inset-y-0 left-0 z-40 border-r border-border/50 bg-sidebar" data-testid="sidebar-admin">
        <AdminSidebarContent currentPath={location} />
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-sidebar border-r border-border/50 shadow-2xl">
            <div className="absolute top-4 right-4">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Admin menyuni yopish" data-testid="button-close-admin-mobile-menu">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <AdminSidebarContent currentPath={location} />
          </aside>
        </div>
      )}

      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        <header className="sticky top-0 z-30 glass-strong h-16 flex items-center px-6 gap-4" data-testid="topbar-admin">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Admin menyuni ochish" data-testid="button-open-admin-mobile-menu">
            <Menu className="w-5 h-5" />
          </Button>

          <div className="flex-1 flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight" data-testid="text-admin-page-title">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground hidden sm:block">— {subtitle}</p>}
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="bg-violet-500/10 text-violet-400 border-violet-500/20 text-xs" data-testid="badge-admin-role">
              Admin
            </Badge>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 h-9 px-2" data-testid="button-admin-profile-menu">
                  <Avatar className="w-7 h-7">
                    <AvatarFallback className="bg-gradient-to-br from-violet-500/20 to-purple-500/20 text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline text-sm font-medium">{user?.fullName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.fullName}</p>
                  <p className="text-xs text-muted-foreground">@{user?.username}</p>
                </div>
                <DropdownMenuSeparator />
                <Link href="/admin/settings">
                  <DropdownMenuItem className="cursor-pointer" data-testid="admin-menu-item-settings">
                    <UserCircle className="w-4 h-4 mr-2" />
                    Sozlamalar
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onClick={() => logout.mutate()}
                  disabled={logout.isPending}
                  data-testid="admin-menu-item-logout"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Chiqish
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
