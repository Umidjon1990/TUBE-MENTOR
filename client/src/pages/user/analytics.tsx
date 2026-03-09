import { useQuery } from "@tanstack/react-query";
import UserLayout from "@/components/layouts/user-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen, Target, Brain, Clock, Flame, Layers,
  StickyNote, Bookmark, Sparkles, Trophy, Star, Zap,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid,
} from "recharts";

interface AnalyticsData {
  totalLessons: number;
  quizAccuracy: number;
  totalQuizzes: number;
  vocabularyLearned: number;
  totalStudyTime: number;
  streakDays: number;
  flashcardCount: number;
  noteCount: number;
  bookmarkCount: number;
  xp: number;
  level: number;
  badges: string[];
  weeklyStudy: number[];
}

const XP_PER_LEVEL = 100;

const dayLabels = ["Du", "Se", "Cho", "Pa", "Ju", "Sha", "Ya"];

function formatStudyTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} daq`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}s ${remainMins}d`;
}

function getBadgeIcon(badge: string) {
  switch (badge) {
    case "first_lesson": return BookOpen;
    case "quiz_master": return Target;
    case "streak_7": return Flame;
    case "vocab_100": return Brain;
    case "study_10h": return Clock;
    default: return Star;
  }
}

function getBadgeLabel(badge: string) {
  switch (badge) {
    case "first_lesson": return "Birinchi dars";
    case "quiz_master": return "Test ustasi";
    case "streak_7": return "7 kunlik streak";
    case "vocab_100": return "100 ta so'z";
    case "study_10h": return "10 soat o'qish";
    default: return badge;
  }
}

function StatCard({ icon: Icon, label, value, accent, testId }: {
  icon: typeof BookOpen;
  label: string;
  value: string | number;
  accent: string;
  testId: string;
}) {
  return (
    <Card className="glass border-border/50" data-testid={testId}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-lg font-bold tracking-tight" data-testid={`${testId}-value`}>{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/user/analytics"],
  });

  if (isLoading) {
    return (
      <UserLayout title="Tahlil" subtitle="O'rganish jarayoningizni kuzating">
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <Skeleton className="h-72 rounded-lg" />
            <Skeleton className="h-72 rounded-lg" />
          </div>
        </div>
      </UserLayout>
    );
  }

  if (!data) return null;

  const xpInCurrentLevel = data.xp % XP_PER_LEVEL;
  const xpProgress = (xpInCurrentLevel / XP_PER_LEVEL) * 100;
  const xpNeeded = XP_PER_LEVEL - xpInCurrentLevel;

  const now = new Date();
  const weeklyData = data.weeklyStudy.map((seconds, i) => {
    const day = new Date(now);
    day.setDate(day.getDate() - (6 - i));
    return {
      day: dayLabels[day.getDay() === 0 ? 6 : day.getDay() - 1],
      minutes: Math.round(seconds / 60),
    };
  });

  const statsCards = [
    { icon: BookOpen, label: "Jami darslar", value: data.totalLessons, accent: "bg-blue-500/10 text-blue-500", testId: "stat-total-lessons" },
    { icon: Target, label: "Test aniqligi", value: `${data.quizAccuracy}%`, accent: "bg-emerald-500/10 text-emerald-500", testId: "stat-quiz-accuracy" },
    { icon: Brain, label: "O'rganilgan so'zlar", value: data.vocabularyLearned, accent: "bg-violet-500/10 text-violet-500", testId: "stat-vocabulary" },
    { icon: Clock, label: "O'qish vaqti", value: formatStudyTime(data.totalStudyTime), accent: "bg-amber-500/10 text-amber-500", testId: "stat-study-time" },
    { icon: Flame, label: "Streak", value: `${data.streakDays} kun`, accent: "bg-orange-500/10 text-orange-500", testId: "stat-streak" },
    { icon: Layers, label: "Kartochkalar", value: data.flashcardCount, accent: "bg-cyan-500/10 text-cyan-500", testId: "stat-flashcards" },
    { icon: StickyNote, label: "Eslatmalar", value: data.noteCount, accent: "bg-pink-500/10 text-pink-500", testId: "stat-notes" },
    { icon: Bookmark, label: "Xatcho'plar", value: data.bookmarkCount, accent: "bg-indigo-500/10 text-indigo-500", testId: "stat-bookmarks" },
  ];

  return (
    <UserLayout title="Tahlil" subtitle="O'rganish jarayoningizni kuzating">
      <div className="space-y-6">
        <Card className="glass border-border/50 overflow-visible" data-testid="card-xp-progress">
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center neon-glow-sm">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-2xl font-bold" data-testid="text-level">Daraja {data.level}</span>
                    <Badge variant="secondary" data-testid="badge-xp">
                      <Sparkles className="w-3 h-3 mr-1" />
                      {data.xp} XP
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Keyingi darajaga {xpNeeded} XP qoldi
                  </p>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <Progress value={xpProgress} className="h-3" data-testid="progress-xp" />
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-[10px] text-muted-foreground">{xpInCurrentLevel} XP</span>
                  <span className="text-[10px] text-muted-foreground">{XP_PER_LEVEL} XP</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="grid-stats">
          {statsCards.map((card) => (
            <StatCard key={card.testId} {...card} />
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="glass border-border/50" data-testid="card-weekly-study">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-semibold">Haftalik o'qish</CardTitle>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                      width={32}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(value: number) => [`${value} daqiqa`, "O'qish vaqti"]}
                    />
                    <Bar
                      dataKey="minutes"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="glass border-border/50" data-testid="card-accuracy-trend">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-semibold">O'qish faolligi</CardTitle>
              <Target className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                      width={32}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(value: number) => [`${value} daqiqa`, "Faollik"]}
                    />
                    <defs>
                      <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="minutes"
                      stroke="hsl(var(--accent))"
                      strokeWidth={2}
                      fill="url(#areaGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {data.badges.length > 0 && (
          <Card className="glass border-border/50" data-testid="card-badges">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-semibold">Yutuqlar</CardTitle>
              <Trophy className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex flex-wrap gap-3">
                {data.badges.map((badge) => {
                  const BadgeIcon = getBadgeIcon(badge);
                  return (
                    <div
                      key={badge}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/50"
                      data-testid={`badge-achievement-${badge}`}
                    >
                      <div className="w-8 h-8 rounded-md bg-gradient-to-br from-amber-500/20 to-yellow-500/20 flex items-center justify-center">
                        <BadgeIcon className="w-4 h-4 text-amber-500" />
                      </div>
                      <span className="text-sm font-medium">{getBadgeLabel(badge)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {data.badges.length === 0 && (
          <Card className="glass border-border/50" data-testid="card-badges-empty">
            <CardContent className="p-6">
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-14 h-14 rounded-lg bg-muted/50 flex items-center justify-center mb-4">
                  <Trophy className="w-7 h-7 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-semibold mb-1">Hali yutuqlar yo'q</h3>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Darslarni o'rganing, testlarni yeching va kartochkalarni ko'rib chiqing - yutuqlar qo'lga kiriting!
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </UserLayout>
  );
}
