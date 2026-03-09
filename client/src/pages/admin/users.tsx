import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";
import AdminLayout from "@/components/layouts/admin-layout";

export default function AdminUsersPage() {
  const usersQuery = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
  });

  const roleLabels: Record<string, string> = {
    admin: "Admin",
    teacher: "O'qituvchi",
    student: "O'quvchi",
  };

  const roleBadgeStyles: Record<string, string> = {
    admin: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    teacher: "bg-primary/10 text-primary border-primary/20",
    student: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  };

  return (
    <AdminLayout title="Foydalanuvchilar" subtitle="Tizim foydalanuvchilarini boshqaring">
      {usersQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="glass border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : usersQuery.data ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{usersQuery.data.length} foydalanuvchi</span>
          </div>

          {usersQuery.data.map((u: any) => {
            const initials = u.fullName
              ?.split(" ")
              .map((n: string) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2) || "?";

            return (
              <Card key={u.id} className="glass border-border/50 hover:border-violet-500/20 transition-colors" data-testid={`card-user-${u.username}`}>
                <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20 text-xs font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{u.fullName}</p>
                      <p className="text-xs text-muted-foreground">@{u.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={roleBadgeStyles[u.role] || ""}>
                      {roleLabels[u.role] || u.role}
                    </Badge>
                    <Badge variant={u.isActive ? "secondary" : "destructive"} className={u.isActive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : ""}>
                      {u.isActive ? "Faol" : "Bloklangan"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </AdminLayout>
  );
}
