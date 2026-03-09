import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Coins, BarChart3, Clock, TrendingUp, PlayCircle } from "lucide-react";
import UserLayout from "@/components/layouts/user-layout";

export default function DashboardPage() {
  const { user } = useAuth();

  const stats = [
    { label: "Jami darslar", value: "0", icon: BookOpen, color: "text-primary", bg: "from-primary/10 to-cyan-500/10" },
    { label: "Tangalar", value: String(user?.coins ?? 0), icon: Coins, color: "text-amber-500", bg: "from-amber-500/10 to-orange-500/10" },
    { label: "O'rganilgan so'zlar", value: "0", icon: TrendingUp, color: "text-emerald-500", bg: "from-emerald-500/10 to-green-500/10" },
    { label: "O'qish vaqti", value: "0 soat", icon: Clock, color: "text-violet-500", bg: "from-violet-500/10 to-purple-500/10" },
  ];

  return (
    <UserLayout title={`Xush kelibsiz, ${user?.fullName}!`} subtitle="Boshqaruv paneli">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, i) => (
          <Card key={i} className="glass border-border/50" data-testid={`card-stat-${i}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <BarChart3 className="w-4 h-4 text-muted-foreground/40" />
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="glass border-border/50" data-testid="card-recent-lessons">
            <CardContent className="p-6">
              <h2 className="text-base font-semibold mb-4">So'nggi darslar</h2>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-cyan-500/10 flex items-center justify-center mb-4">
                  <PlayCircle className="w-8 h-8 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground mb-1">Hali darslar mavjud emas</p>
                <p className="text-xs text-muted-foreground">Yangi dars yaratish uchun "Dars yaratish" bo'limiga o'ting</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="glass border-border/50" data-testid="card-progress">
            <CardContent className="p-6">
              <h2 className="text-base font-semibold mb-4">Rivojlanish</h2>
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/10 to-violet-500/10 flex items-center justify-center mb-4">
                  <TrendingUp className="w-8 h-8 text-accent" />
                </div>
                <p className="text-sm text-muted-foreground">Statistika tez orada paydo bo'ladi</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </UserLayout>
  );
}
