import { Button } from "@/components/ui/button";
import { GraduationCap, Heart } from "lucide-react";
import { Link, useLocation } from "wouter";

function PublicNavbar() {
  const [location] = useLocation();
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/40" data-testid="navbar-public">
      <div className="max-w-6xl mx-auto px-3 md:px-6 h-14 md:h-16 flex items-center justify-between gap-2 md:gap-4">
        <Link href="/">
          <div className="flex items-center gap-2.5 cursor-pointer group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary via-cyan-400 to-accent flex items-center justify-center shadow-md shadow-primary/20 group-hover:shadow-lg group-hover:shadow-primary/30 transition-shadow duration-300">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text" data-testid="text-brand-name">TUBE MENTOR</span>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-6" aria-label="Asosiy navigatsiya">
          <Link href="/library" className={`text-sm font-medium transition-colors ${location === "/library" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`} data-testid="link-library">Kutubxona</Link>
          <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-features">Xususiyatlar</a>
        </nav>
        <div className="flex items-center gap-3">
        </div>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="relative border-t border-border/40 bg-card/30 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-3 md:px-6 py-10 md:py-14">
        <div className="grid md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary via-cyan-400 to-accent flex items-center justify-center shadow-md">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight">TUBE MENTOR</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-6">
              YouTube videolaridan professional darsliklar tayyorlang.
              O'qituvchi yaratadi — o'quvchilar foydalanadi.
            </p>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span>Made with</span>
              <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500 mx-0.5" />
              <span>for education</span>
            </div>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm text-foreground">Platforma</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="#features" className="hover:text-primary transition-colors" data-testid="footer-link-features">Xususiyatlar</a></li>
              <li><Link href="/library" className="hover:text-primary transition-colors" data-testid="footer-link-library">Kutubxona</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm text-foreground">Kompaniya</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><span className="hover:text-primary transition-colors cursor-pointer" data-testid="footer-link-about">Biz haqimizda</span></li>
              <li><span className="hover:text-primary transition-colors cursor-pointer" data-testid="footer-link-blog">Blog</span></li>
              <li><span className="hover:text-primary transition-colors cursor-pointer" data-testid="footer-link-contact">Aloqa</span></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/40 mt-10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground" data-testid="text-copyright">
            &copy; 2026 TUBE MENTOR. Barcha huquqlar himoyalangan.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground/60">Powered by AI</span>
          </div>
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
