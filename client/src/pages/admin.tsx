import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, LogOut, Users, Shield } from "lucide-react";

export default function AdminPage() {
  const { user, logout } = useAuth();

  const usersQuery = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold" data-testid="text-brand-name">Tube Mentor AI</span>
            <Badge variant="secondary" className="ml-2" data-testid="badge-admin">Admin</Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground" data-testid="text-admin-name">
              {user?.fullName}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              data-testid="button-admin-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Chiqish
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold" data-testid="text-admin-title">
              Admin boshqaruv paneli
            </h1>
          </div>
          <p className="text-muted-foreground">
            Tizim foydalanuvchilarini boshqaring.
          </p>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Foydalanuvchilar</h2>
          </div>

          {usersQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
          ) : usersQuery.data ? (
            <div className="grid gap-3">
              {usersQuery.data.map((u: any) => (
                <Card key={u.id} data-testid={`card-user-${u.username}`}>
                  <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-semibold text-primary">
                          {u.fullName?.charAt(0)?.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">{u.fullName}</p>
                        <p className="text-xs text-muted-foreground">@{u.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {u.role}
                      </Badge>
                      <Badge variant={u.isActive ? "secondary" : "destructive"}>
                        {u.isActive ? "Faol" : "Bloklangan"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-12 text-center text-muted-foreground" data-testid="text-admin-placeholder">
          <p>Admin paneli tez orada to'liq ishga tushiriladi.</p>
        </div>
      </main>
    </div>
  );
}
