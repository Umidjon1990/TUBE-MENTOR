import { Button } from "@/components/ui/button";
import { GraduationCap } from "lucide-react";
import { Link } from "wouter";

function PublicNavbar() {
  return (
    <header className="sticky top-0 z-50 glass-strong" data-testid="navbar-public">
      <div className="max-w-6xl mx-auto px-3 md:px-6 h-14 md:h-16 flex items-center justify-between gap-2 md:gap-4">
        <Link href="/">
          <div className="flex items-center gap-2.5 cursor-pointer group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center neon-glow-sm">
              <GraduationCap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight" data-testid="text-brand-name">TUBE MENTOR</span>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-6" aria-label="Asosiy navigatsiya">
          <Link href="/library" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-library">Kutubxona</Link>
          <Link href="/smart-dictionary" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-dictionary">Lug'at</Link>
          <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-features">Xususiyatlar</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="outline" size="sm" className="border-primary/30 hover:border-primary/60 hover:bg-primary/5" data-testid="button-login">
              Kirish
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="border-t border-border/50">
      <div className="max-w-6xl mx-auto px-3 md:px-6 py-8 md:py-12">
        <div className="grid md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center">
                <GraduationCap className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold tracking-tight">TUBE MENTOR</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              YouTube videolaridan professional darsliklar tayyorlang.
              O'qituvchi yaratadi — o'quvchilar foydalanadi.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-3 text-sm">Platforma</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#features" className="hover:text-foreground transition-colors">Xususiyatlar</a></li>
              <li><Link href="/library" className="hover:text-foreground transition-colors">Kutubxona</Link></li>
              <li><Link href="/smart-dictionary" className="hover:text-foreground transition-colors">Smart Lug'at</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-3 text-sm">Kompaniya</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><span className="hover:text-foreground transition-colors">Biz haqimizda</span></li>
              <li><span className="hover:text-foreground transition-colors">Blog</span></li>
              <li><span className="hover:text-foreground transition-colors">Aloqa</span></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/50 mt-8 pt-8 text-center">
          <p className="text-sm text-muted-foreground" data-testid="text-copyright">
            &copy; 2026 TUBE MENTOR. Barcha huquqlar himoyalangan.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar />
      <main>{children}</main>
      <PublicFooter />
    </div>
  );
}
