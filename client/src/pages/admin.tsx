import { Card, CardContent } from "@/components/ui/card";
import { Users, BookOpen, ShieldCheck, Coins, FolderTree, TrendingUp } from "lucide-react";
import AdminLayout from "@/components/layouts/admin-layout";

export default function AdminPage() {
  const dashboardStats = [
    { label: "Foydalanuvchilar", value: "4", icon: Users, color: "text-primary", bg: "from-primary/10 to-cyan-500/10" },
    { label: "Darslar", value: "5", icon: BookOpen, color: "text-emerald-500", bg: "from-emerald-500/10 to-green-500/10" },
    { label: "Moderatsiya", value: "0", icon: ShieldCheck, color: "text-amber-500", bg: "from-amber-500/10 to-orange-500/10" },
    { label: "Jami tangalar", value: "1,670", icon: Coins, color: "text-violet-400", bg: "from-violet-500/10 to-purple-500/10" },
    { label: "Kategoriyalar", value: "5", icon: FolderTree, color: "text-blue-500", bg: "from-blue-500/10 to-indigo-500/10" },
    { label: "O'sish", value: "+12%", icon: TrendingUp, color: "text-rose-500", bg: "from-rose-500/10 to-pink-500/10" },
  ];

  return (
    <AdminLayout title="Admin paneli" subtitle="Tizim umumiy ko'rinishi">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {dashboardStats.map((stat, i) => (
          <Card key={i} className="glass border-border/50 hover:border-violet-500/20 transition-colors" data-testid={`card-admin-stat-${i}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="glass border-border/50" data-testid="card-admin-activity">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold mb-4">So'nggi faoliyat</h2>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">Faoliyat tarixi tez orada paydo bo'ladi</p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-border/50" data-testid="card-admin-overview">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold mb-4">Tizim holati</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <span className="text-sm">Ma'lumotlar bazasi</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs text-emerald-500">Faol</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <span className="text-sm">AI tizimi</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs text-emerald-500">Faol</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <span className="text-sm">Sessiyalar</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs text-emerald-500">Faol</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
