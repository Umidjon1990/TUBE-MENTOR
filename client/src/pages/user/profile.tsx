import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import UserLayout from "@/components/layouts/user-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Coins, Calendar, Shield, Zap, Flame, Trophy, BookOpen, Target, Star, Award, Upload, Cookie, CheckCircle2, Trash2, ExternalLink, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const badgeLabels: Record<string, { label: string; icon: typeof Star; color: string }> = {
  first_lesson: { label: "Birinchi dars", icon: BookOpen, color: "text-cyan-400" },
  quiz_master: { label: "Test ustasi", icon: Target, color: "text-amber-400" },
  streak_7: { label: "7 kunlik streak", icon: Flame, color: "text-orange-400" },
  streak_30: { label: "30 kunlik streak", icon: Flame, color: "text-red-500" },
  xp_500: { label: "500 XP", icon: Zap, color: "text-violet-400" },
  xp_1000: { label: "1000 XP", icon: Zap, color: "text-violet-500" },
  level_5: { label: "5-daraja", icon: Shield, color: "text-emerald-400" },
  level_10: { label: "10-daraja", icon: Trophy, color: "text-amber-500" },
};

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

  const xp = user?.xp ?? 0;
  const level = user?.level ?? 1;
  const streakDays = user?.streakDays ?? 0;
  const badges = (user?.badges as string[]) ?? [];
  const xpInLevel = xp - (level - 1) * 100;
  const xpProgress = Math.min(100, (xpInLevel / 100) * 100);

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
                  <Badge variant="secondary" className="gap-1.5 border-violet-500/30" data-testid="badge-profile-level">
                    <Zap className="w-3 h-3 text-violet-400" />
                    Daraja {level}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid sm:grid-cols-3 gap-4">
          <Card className="glass border-border/50" data-testid="card-profile-xp">
            <CardContent className="p-5 text-center">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 flex items-center justify-center mx-auto mb-2">
                <Zap className="w-5 h-5 text-violet-400" />
              </div>
              <p className="text-2xl font-bold">{xp}</p>
              <p className="text-xs text-muted-foreground">XP</p>
              <div className="mt-2 space-y-1">
                <Progress value={xpProgress} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground">{xpInLevel}/100 keyingi darajagacha</p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass border-border/50" data-testid="card-profile-streak">
            <CardContent className="p-5 text-center">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center mx-auto mb-2">
                <Flame className={`w-5 h-5 ${streakDays > 0 ? "text-orange-400" : "text-muted-foreground/40"}`} />
              </div>
              <p className="text-2xl font-bold">{streakDays}</p>
              <p className="text-xs text-muted-foreground">Kunlik streak</p>
            </CardContent>
          </Card>

          <Card className="glass border-border/50" data-testid="card-profile-badges-count">
            <CardContent className="p-5 text-center">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 flex items-center justify-center mx-auto mb-2">
                <Award className="w-5 h-5 text-amber-400" />
              </div>
              <p className="text-2xl font-bold">{badges.length}</p>
              <p className="text-xs text-muted-foreground">Yutuqlar</p>
            </CardContent>
          </Card>
        </div>

        {badges.length > 0 && (
          <Card className="glass border-border/50" data-testid="card-profile-badges">
            <CardContent className="p-6">
              <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" /> Yutuqlar
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {badges.map((badge) => {
                  const info = badgeLabels[badge] || { label: badge, icon: Star, color: "text-muted-foreground" };
                  const Icon = info.icon;
                  return (
                    <div
                      key={badge}
                      className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/30"
                      data-testid={`badge-${badge}`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/10 to-yellow-500/10 flex items-center justify-center flex-shrink-0">
                        <Icon className={`w-4 h-4 ${info.color}`} />
                      </div>
                      <span className="text-xs font-medium">{info.label}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

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
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Oxirgi o'qish sanasi</p>
                  <p className="text-sm font-medium">
                    {user?.lastStudyDate || "Hali o'qilmagan"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {(user?.role === "admin" || user?.role === "teacher") && (
          <YouTubeCookieSection />
        )}
      </div>
    </UserLayout>
  );
}

function YouTubeCookieSection() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: cookieStatus, refetch } = useQuery<{ exists: boolean; updatedAt?: string; size?: number }>({
    queryKey: ["/api/youtube-cookies/status"],
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/youtube-cookies");
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Cookie o'chirildi" });
    },
  });

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("cookies", file);

      const res = await fetch("/api/upload/youtube-cookies", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();

      if (res.ok) {
        toast({ title: "Cookie yuklandi!", description: data.message });
        refetch();
      } else {
        toast({ title: "Xatolik", description: data.message, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Xatolik", description: err?.message || "Yuklashda xatolik", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Card className="glass border-amber-500/20" data-testid="card-youtube-cookies">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Cookie className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold">YouTube Cookie</h3>
            <p className="text-xs text-muted-foreground">Whisper transkripsiya uchun kerak</p>
          </div>
          {cookieStatus?.exists && (
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
              <CheckCircle2 className="w-3 h-3" /> Faol
            </Badge>
          )}
        </div>

        {!cookieStatus?.exists && (
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                YouTube video audio'sini yuklab olish uchun cookie fayl kerak.
                Bu YouTube'ning bot himoyasini chetlab o'tish uchun zarur.
              </p>
            </div>
          </div>
        )}

        <div className="rounded-lg bg-muted/20 border border-border/30 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Cookie olish yo'riqnomasi:</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Chrome brauzerda YouTube'ga kiring</li>
            <li>
              <a
                href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                "Get cookies.txt LOCALLY" kengaytmasini o'rnating
                <ExternalLink className="w-3 h-3" />
              </a>
            </li>
            <li>YouTube sahifasida kengaytmani bosib "Export" qiling</li>
            <li>Yuklab olingan faylni pastga yuklang</li>
          </ol>
        </div>

        {cookieStatus?.exists && cookieStatus.updatedAt && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Yuklangan: {new Date(cookieStatus.updatedAt).toLocaleDateString("uz-UZ", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        )}

        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            onChange={handleFileUpload}
            className="hidden"
            data-testid="input-cookie-file"
          />
          <Button
            variant="outline"
            className="flex-1 gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            data-testid="button-upload-cookie"
          >
            <Upload className="w-4 h-4" />
            {uploading ? "Yuklanmoqda..." : cookieStatus?.exists ? "Yangilash" : "Cookie yuklash"}
          </Button>
          {cookieStatus?.exists && (
            <Button
              variant="outline"
              size="icon"
              className="border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => deleteMutation.mutate()}
              data-testid="button-delete-cookie"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
