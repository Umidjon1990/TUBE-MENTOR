import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  GraduationCap,
  LayoutDashboard,
  PlusCircle,
  BookOpen,
  Layers,
  StickyNote,
  BarChart3,
  UserCircle,
  LogOut,
  Menu,
  X,
  Coins,
  Search,
  ChevronRight,
  Flame,
  Zap,
  BookmarkCheck,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

const userNavItems = [
  { href: "/dashboard", label: "Boshqaruv paneli", icon: LayoutDashboard },
  { href: "/lessons/create", label: "Dars yaratish", icon: PlusCircle },
  { href: "/lessons", label: "Mening darslarim", icon: BookOpen },
  { href: "/saved-words", label: "Mening so'zlarim", icon: BookmarkCheck },
  { href: "/dictionary", label: "Smart Lug'at", icon: Search },
  { href: "/flashcards", label: "Kartochkalar", icon: Layers },
  { href: "/notes", label: "Eslatmalar", icon: StickyNote },
  { href: "/analytics", label: "Tahlil", icon: BarChart3 },
  { href: "/profile", label: "Profil", icon: UserCircle },
];

function SidebarContent({ currentPath }: { currentPath: string }) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-5">
        <Link href="/dashboard">
          <div className="flex items-center gap-2.5 cursor-pointer">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center neon-glow-sm">
              <GraduationCap className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight block" data-testid="text-sidebar-brand">Tube Mentor</span>
              <span className="text-[10px] font-medium text-primary tracking-widest uppercase">AI Platform</span>
            </div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-1" data-testid="nav-user-sidebar">
        {userNavItems.map((item) => {
          const isActive = currentPath === item.href || (item.href !== "/dashboard" && currentPath.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer group ${
                  isActive
                    ? "bg-primary/10 text-primary neon-glow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                data-testid={`nav-item-${item.href.replace(/\//g, "-").slice(1)}`}
              >
                <item.icon className={`w-4.5 h-4.5 ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-primary/60" />}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 mt-auto">
        <div className="rounded-lg glass p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>AI tizimi faol</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UserLayout({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const initials = user?.fullName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden lg:flex w-64 flex-col fixed inset-y-0 left-0 z-40 border-r border-border/50 bg-sidebar" data-testid="sidebar-user">
        <SidebarContent currentPath={location} />
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-sidebar border-r border-border/50 shadow-2xl">
            <div className="absolute top-4 right-4">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Menyuni yopish" data-testid="button-close-mobile-menu">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <SidebarContent currentPath={location} />
          </aside>
        </div>
      )}

      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        <header className="sticky top-0 z-30 glass-strong h-16 flex items-center px-6 gap-4" data-testid="topbar-user">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Menyuni ochish" data-testid="button-open-mobile-menu">
            <Menu className="w-5 h-5" />
          </Button>

          <div className="flex-1">
            <h1 className="text-lg font-semibold tracking-tight" data-testid="text-page-title">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border/50">
              <Flame className={`w-3.5 h-3.5 ${(user?.streakDays ?? 0) > 0 ? "text-orange-400" : "text-muted-foreground/40"}`} />
              <span className="text-xs font-semibold" data-testid="text-user-streak">{user?.streakDays ?? 0}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border/50">
              <Zap className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-xs font-semibold" data-testid="text-user-level">LV{user?.level ?? 1}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border/50">
              <Coins className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-semibold" data-testid="text-user-coins">{user?.coins ?? 0}</span>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 h-9 px-2" data-testid="button-profile-menu">
                  <Avatar className="w-7 h-7">
                    <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20 text-xs font-semibold">
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
                <Link href="/profile">
                  <DropdownMenuItem className="cursor-pointer" data-testid="menu-item-profile">
                    <UserCircle className="w-4 h-4 mr-2" />
                    Profil
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onClick={() => logout.mutate()}
                  disabled={logout.isPending}
                  data-testid="menu-item-logout"
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
