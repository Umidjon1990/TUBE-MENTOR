import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen, Coins, BarChart3, Clock, TrendingUp,
  PlayCircle, PlusCircle, Layers, Hourglass, Globe,
  ArrowRight, ArrowUpRight, ArrowDownRight, AlertCircle
} from "lucide-react";
import { Link } from "wouter";
import UserLayout from "@/components/layouts/user-layout";
import type { Lesson, CoinTransaction } from "@shared/schema";

interface DashboardData {
  coins: number;
  lessonCount: number;
  flashcardCount: number;
  pendingCount: number;
  totalStudyTime: number;
  learnedWords: number;
  recentLessons: Lesson[];
  recentTransactions: CoinTransaction[];
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Kutilmoqda", variant: "secondary" },
  approved: { label: "Tasdiqlangan", variant: "default" },
  rejected: { label: "Rad etilgan", variant: "destructive" },
  published: { label: "E'lon qilingan", variant: "outline" },
  draft: { label: "Qoralama", variant: "secondary" },
};

function formatStudyTime(seconds: number): string {
  if (seconds < 60) return `${seconds} son`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} daq`;
  return `${(seconds / 3600).toFixed(1)} soat`;
}

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("uz-UZ", { day: "numeric", month: "short" });
}

export default function DashboardPage() {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["/api/user/dashboard"],
  });

  const stats = [
    { label: "Coin balansi", value: String(data?.coins ?? user?.coins ?? 0), icon: Coins, color: "text-amber-500", bg: "from-amber-500/10 to-orange-500/10" },
    { label: "Mening darslarim", value: String(data?.lessonCount ?? 0), icon: BookOpen, color: "text-primary", bg: "from-primary/10 to-cyan-500/10" },
    { label: "Saqlangan kartochkalar", value: String(data?.flashcardCount ?? 0), icon: Layers, color: "text-emerald-500", bg: "from-emerald-500/10 to-green-500/10" },
    { label: "O'rganilgan so'zlar", value: String(data?.learnedWords ?? 0), icon: TrendingUp, color: "text-violet-500", bg: "from-violet-500/10 to-purple-500/10" },
    { label: "Pending darslar", value: String(data?.pendingCount ?? 0), icon: Hourglass, color: "text-orange-400", bg: "from-orange-400/10 to-amber-500/10" },
    { label: "O'qish vaqti", value: formatStudyTime(data?.totalStudyTime ?? 0), icon: Clock, color: "text-sky-400", bg: "from-sky-400/10 to-blue-500/10" },
  ];

  if (error) {
    return (
      <UserLayout title={`Xush kelibsiz, ${user?.fullName}!`} subtitle="Boshqaruv paneli">
        <Card className="glass border-destructive/30">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
            <p className="text-sm text-destructive">Ma'lumotlarni yuklashda xatolik yuz berdi</p>
          </CardContent>
        </Card>
      </UserLayout>
    );
  }

  return (
    <UserLayout title={`Xush kelibsiz, ${user?.fullName}!`} subtitle="Boshqaruv paneli">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {stats.map((stat, i) => (
          <Card key={i} className="glass border-border/50" data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s/g, "-")}`}>
            <CardContent className="p-5">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <Skeleton className="h-7 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.bg} flex items-center justify-center`}>
                      <stat.icon className={`w-5 h-5 ${stat.color}`} />
                    </div>
                    <BarChart3 className="w-4 h-4 text-muted-foreground/40" />
                  </div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass border-border/50" data-testid="card-recent-lessons">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold">So'nggi darslar</h2>
                <Link href="/lessons">
                  <Button variant="ghost" size="sm" className="text-xs gap-1" data-testid="link-all-lessons">
                    Barchasi <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                </div>
              ) : data?.recentLessons && data.recentLessons.length > 0 ? (
                <div className="space-y-2">
                  {data.recentLessons.map((lesson) => {
                    const st = statusLabels[lesson.status] ?? statusLabels.draft;
                    return (
                      <div
                        key={lesson.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/30 hover:bg-muted/50 transition-colors"
                        data-testid={`lesson-row-${lesson.id}`}
                      >
                        {lesson.thumbnailUrl ? (
                          <img src={lesson.thumbnailUrl} alt="" className="w-16 h-10 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-16 h-10 rounded bg-muted/50 flex items-center justify-center flex-shrink-0">
                            <PlayCircle className="w-5 h-5 text-muted-foreground/50" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{lesson.title}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(lesson.createdAt)}</p>
                        </div>
                        <Badge variant={st.variant} className="text-[10px] flex-shrink-0">{st.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-cyan-500/10 flex items-center justify-center mb-4">
                    <PlayCircle className="w-8 h-8 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">Hali darslar mavjud emas</p>
                  <p className="text-xs text-muted-foreground mb-4">Yangi dars yaratish uchun "Dars yaratish" bo'limiga o'ting</p>
                  <Link href="/lessons/create">
                    <Button size="sm" className="gap-1.5" data-testid="button-create-first-lesson">
                      <PlusCircle className="w-4 h-4" /> Dars yaratish
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass border-border/50" data-testid="card-public-recommendations">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold">Public darslar tavsiyasi</h2>
                <Globe className="w-4 h-4 text-muted-foreground/40" />
              </div>
              <PublicLessonsWidget />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="glass border-border/50" data-testid="card-activity">
            <CardContent className="p-6">
              <h2 className="text-base font-semibold mb-4">Oxirgi faoliyat</h2>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
                </div>
              ) : data?.recentTransactions && data.recentTransactions.length > 0 ? (
                <div className="space-y-2">
                  {data.recentTransactions.map((tx) => (
                    <div key={tx.id} className="flex items-center gap-3 py-2" data-testid={`activity-row-${tx.id}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        tx.amount > 0
                          ? "bg-emerald-500/10"
                          : "bg-red-500/10"
                      }`}>
                        {tx.amount > 0 ? (
                          <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <ArrowDownRight className="w-4 h-4 text-red-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate">{tx.description || tx.type}</p>
                        <p className="text-[10px] text-muted-foreground">{formatDate(tx.createdAt)}</p>
                      </div>
                      <span className={`text-xs font-semibold ${tx.amount > 0 ? "text-emerald-500" : "text-red-400"}`}>
                        {tx.amount > 0 ? "+" : ""}{tx.amount}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Faoliyat mavjud emas</p>
              )}
            </CardContent>
          </Card>

          <Card className="glass border-border/50" data-testid="card-quick-actions">
            <CardContent className="p-6">
              <h2 className="text-base font-semibold mb-4">Tezkor amallar</h2>
              <div className="space-y-2">
                <Link href="/lessons/create">
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm" data-testid="button-quick-create">
                    <PlusCircle className="w-4 h-4 text-primary" /> Yangi dars yaratish
                  </Button>
                </Link>
                <Link href="/lessons">
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm" data-testid="button-quick-lessons">
                    <BookOpen className="w-4 h-4 text-primary" /> Darslarimni ko'rish
                  </Button>
                </Link>
                <Link href="/flashcards">
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm" data-testid="button-quick-flashcards">
                    <Layers className="w-4 h-4 text-emerald-500" /> Kartochkalar
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </UserLayout>
  );
}

function PublicLessonsWidget() {
  const { data: publicLessons, isLoading } = useQuery<Lesson[]>({
    queryKey: ["/api/lessons/public"],
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </div>
    );
  }

  if (!publicLessons || publicLessons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Globe className="w-8 h-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">Hozircha ommaviy darslar mavjud emas</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {publicLessons.slice(0, 4).map((lesson) => (
        <div
          key={lesson.id}
          className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/30 hover:bg-muted/50 transition-colors"
          data-testid={`public-lesson-${lesson.id}`}
        >
          {lesson.thumbnailUrl ? (
            <img src={lesson.thumbnailUrl} alt="" className="w-14 h-9 rounded object-cover flex-shrink-0" />
          ) : (
            <div className="w-14 h-9 rounded bg-muted/50 flex items-center justify-center flex-shrink-0">
              <PlayCircle className="w-4 h-4 text-muted-foreground/50" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{lesson.title}</p>
            <p className="text-[10px] text-muted-foreground">{lesson.level}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
