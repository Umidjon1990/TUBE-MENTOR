import UserLayout from "@/components/layouts/user-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Coins, Calendar, Shield } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function ProfilePage() {
  const { user } = useAuth();

  const initials = user?.fullName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  const roleLabels: Record<string, string> = {
    admin: "Administrator",
    teacher: "O'qituvchi",
    student: "O'quvchi",
  };

  return (
    <UserLayout title="Profil" subtitle="Shaxsiy ma'lumotlaringiz">
      <div className="max-w-2xl space-y-6">
        <Card className="glass border-border/50" data-testid="card-profile-info">
          <CardContent className="p-8">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <Avatar className="w-20 h-20">
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20 text-2xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-xl font-bold" data-testid="text-profile-name">{user?.fullName}</h2>
                <p className="text-sm text-muted-foreground mb-3" data-testid="text-profile-username">@{user?.username}</p>
                <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                  <Badge variant="secondary" className="gap-1.5" data-testid="badge-profile-role">
                    <Shield className="w-3 h-3" />
                    {roleLabels[user?.role || "student"]}
                  </Badge>
                  <Badge variant="secondary" className="gap-1.5" data-testid="badge-profile-coins">
                    <Coins className="w-3 h-3 text-amber-500" />
                    {user?.coins ?? 0} tanga
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-border/50" data-testid="card-profile-details">
          <CardContent className="p-8">
            <h3 className="text-base font-semibold mb-4">Qo'shimcha ma'lumotlar</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Ro'yxatdan o'tgan sana</p>
                  <p className="text-sm font-medium">
                    {user?.createdAt ? new Date(user.createdAt).toLocaleDateString("uz-UZ", { year: "numeric", month: "long", day: "numeric" }) : "—"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </UserLayout>
  );
}
