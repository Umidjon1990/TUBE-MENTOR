import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { GraduationCap, LogOut, BookOpen, Coins } from "lucide-react";

export default function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold" data-testid="text-brand-name">Tube Mentor AI</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground" data-testid="text-user-name">
              {user?.fullName}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Chiqish
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">
            Xush kelibsiz, {user?.fullName}!
          </h1>
          <p className="text-muted-foreground mt-1">
            Bu sizning shaxsiy boshqaruv panelingiz.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card data-testid="card-role">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <BookOpen className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium text-muted-foreground">Rol</span>
              </div>
              <p className="text-lg font-semibold capitalize">{user?.role}</p>
            </CardContent>
          </Card>
          <Card data-testid="card-coins">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <Coins className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium text-muted-foreground">Tangalar</span>
              </div>
              <p className="text-lg font-semibold">{user?.coins ?? 0}</p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 text-center text-muted-foreground" data-testid="text-dashboard-placeholder">
          <p>Boshqaruv paneli tez orada to'liq ishga tushiriladi.</p>
        </div>
      </main>
    </div>
  );
}
