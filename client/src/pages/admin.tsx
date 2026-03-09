import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Users,
  BookOpen,
  ShieldCheck,
  Coins,
  UserCheck,
  Clock,
  FileText,
  CheckCircle,
  XCircle,
  Trophy,
  Zap,
  Flame,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import AdminLayout from "@/components/layouts/admin-layout";

interface AdminAnalytics {
  totalUsers: number;
  activeUsers: number;
  totalLessons: number;
  pendingLessons: number;
  publishedLessons: number;
  rejectedLessons: number;
  approvedLessons: number;
  draftLessons: number;
  totalCoinsCirculation: number;
  topUsers: {
    id: string;
    fullName: string;
    username: string;
    role: string;
    xp: number;
    level: number;
    coins: number;
    streakDays: number;
  }[];
  roleDistribution: {
    admin: number;
    teacher: number;
    student: number;
  };
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
  testId,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bg: string;
  testId: string;
}) {
  return (
    <Card className="glass border-border/50" data-testid={testId}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div
            className={`w-10 h-10 rounded-xl bg-gradient-to-br ${bg} flex items-center justify-center`}
          >
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        </div>
        <p className="text-2xl font-bold" data-testid={`${testId}-value`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="glass border-border/50">
            <CardContent className="p-5">
              <Skeleton className="w-10 h-10 rounded-xl mb-3" />
              <Skeleton className="h-7 w-16 mb-1" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="glass border-border/50">
          <CardContent className="p-6">
            <Skeleton className="h-5 w-40 mb-4" />
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card className="glass border-border/50">
          <CardContent className="p-6">
            <Skeleton className="h-5 w-40 mb-4" />
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const CHART_COLORS = [
  "hsl(190, 95%, 50%)",
  "hsl(260, 80%, 62%)",
  "hsl(142, 70%, 45%)",
  "hsl(340, 80%, 55%)",
  "hsl(30, 95%, 55%)",
];

export default function AdminPage() {
  const { data, isLoading, isError } = useQuery<AdminAnalytics>({
    queryKey: ["/api/admin/analytics"],
  });

  if (isError) {
    return (
      <AdminLayout title="Admin paneli" subtitle="Tizim umumiy ko'rinishi">
        <div className="text-center py-16 text-destructive" data-testid="error-admin-analytics">
          Analitika ma'lumotlarini yuklashda xatolik yuz berdi.
        </div>
      </AdminLayout>
    );
  }

  if (isLoading || !data) {
    return (
      <AdminLayout title="Admin paneli" subtitle="Tizim umumiy ko'rinishi">
        <LoadingSkeleton />
      </AdminLayout>
    );
  }

  const stats = [
    {
      label: "Jami foydalanuvchilar",
      value: data.totalUsers,
      icon: Users,
      color: "text-primary",
      bg: "from-primary/10 to-cyan-500/10",
      testId: "card-admin-stat-total-users",
    },
    {
      label: "Faol foydalanuvchilar",
      value: data.activeUsers,
      icon: UserCheck,
      color: "text-emerald-500",
      bg: "from-emerald-500/10 to-green-500/10",
      testId: "card-admin-stat-active-users",
    },
    {
      label: "Jami darslar",
      value: data.totalLessons,
      icon: BookOpen,
      color: "text-blue-500",
      bg: "from-blue-500/10 to-indigo-500/10",
      testId: "card-admin-stat-total-lessons",
    },
    {
      label: "Moderatsiyada",
      value: data.pendingLessons,
      icon: ShieldCheck,
      color: "text-amber-500",
      bg: "from-amber-500/10 to-orange-500/10",
      testId: "card-admin-stat-pending",
    },
    {
      label: "Nashr qilingan",
      value: data.publishedLessons,
      icon: CheckCircle,
      color: "text-emerald-500",
      bg: "from-emerald-500/10 to-teal-500/10",
      testId: "card-admin-stat-published",
    },
    {
      label: "Rad etilgan",
      value: data.rejectedLessons,
      icon: XCircle,
      color: "text-rose-500",
      bg: "from-rose-500/10 to-pink-500/10",
      testId: "card-admin-stat-rejected",
    },
    {
      label: "Qoralama",
      value: data.draftLessons,
      icon: FileText,
      color: "text-muted-foreground",
      bg: "from-muted/30 to-muted/10",
      testId: "card-admin-stat-draft",
    },
    {
      label: "Coin aylanmasi",
      value: data.totalCoinsCirculation.toLocaleString(),
      icon: Coins,
      color: "text-violet-400",
      bg: "from-violet-500/10 to-purple-500/10",
      testId: "card-admin-stat-coins",
    },
  ];

  const lessonStatusData = [
    { name: "Nashr", value: data.publishedLessons },
    { name: "Moderatsiya", value: data.pendingLessons },
    { name: "Tasdiqlangan", value: data.approvedLessons },
    { name: "Rad", value: data.rejectedLessons },
    { name: "Qoralama", value: data.draftLessons },
  ].filter((d) => d.value > 0);

  const roleData = [
    { name: "Admin", count: data.roleDistribution.admin },
    { name: "O'qituvchi", count: data.roleDistribution.teacher },
    { name: "Talaba", count: data.roleDistribution.student },
  ];

  return (
    <AdminLayout title="Admin paneli" subtitle="Tizim umumiy ko'rinishi">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <StatCard key={stat.testId} {...stat} />
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card className="glass border-border/50" data-testid="card-admin-lesson-chart">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold mb-4">Dars holati taqsimoti</h2>
            {lessonStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={lessonStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    nameKey="name"
                    stroke="none"
                  >
                    {lessonStatusData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) => (
                      <span className="text-xs text-muted-foreground">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                Darslar topilmadi
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-border/50" data-testid="card-admin-role-chart">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold mb-4">
              Foydalanuvchi rollari
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={roleData} barSize={40}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "13px",
                  }}
                />
                <Bar dataKey="count" name="Soni" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="glass border-border/50" data-testid="card-admin-top-users">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold mb-4">Top foydalanuvchilar</h2>
            {data.topUsers.length > 0 ? (
              <div className="space-y-2">
                {data.topUsers.map((user, index) => {
                  const initials = user.fullName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2);
                  return (
                    <div
                      key={user.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"
                      data-testid={`row-top-user-${index}`}
                    >
                      <span className="text-xs font-bold text-muted-foreground w-5 text-center">
                        {index + 1}
                      </span>
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="bg-gradient-to-br from-violet-500/20 to-purple-500/20 text-xs font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {user.fullName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          @{user.username}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1">
                          <Zap className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs font-medium">{user.xp}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Trophy className="w-3.5 h-3.5 text-violet-400" />
                          <span className="text-xs font-medium">Lv.{user.level}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Flame className="w-3.5 h-3.5 text-orange-500" />
                          <span className="text-xs font-medium">{user.streakDays}</span>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-[10px]" data-testid={`badge-user-role-${index}`}>
                        {user.role}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Foydalanuvchilar topilmadi
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-border/50" data-testid="card-admin-system-health">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold mb-4">Tizim holati</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/30">
                <span className="text-sm">Ma'lumotlar bazasi</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs text-emerald-500">Faol</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/30">
                <span className="text-sm">AI tizimi</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs text-emerald-500">Faol</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/30">
                <span className="text-sm">Sessiyalar</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs text-emerald-500">Faol</span>
                </div>
              </div>
            </div>

            <h2 className="text-base font-semibold mt-6 mb-4">
              <Clock className="w-4 h-4 inline-block mr-1.5 text-muted-foreground" />
              Tezkor statistika
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-lg font-bold" data-testid="text-stat-approved">{data.approvedLessons}</p>
                <p className="text-xs text-muted-foreground">Tasdiqlangan</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-lg font-bold" data-testid="text-stat-active-pct">
                  {data.totalUsers > 0
                    ? Math.round((data.activeUsers / data.totalUsers) * 100)
                    : 0}
                  %
                </p>
                <p className="text-xs text-muted-foreground">Faol foiz</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-lg font-bold" data-testid="text-stat-teachers">{data.roleDistribution.teacher}</p>
                <p className="text-xs text-muted-foreground">O'qituvchilar</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-lg font-bold" data-testid="text-stat-students">{data.roleDistribution.student}</p>
                <p className="text-xs text-muted-foreground">Talabalar</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
