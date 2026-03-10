import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import UserLayout from "@/components/layouts/user-layout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Youtube, Coins, AlertTriangle, Check, Loader2,
  Sparkles, ChevronRight, ExternalLink, X
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Category, Tag } from "@shared/schema";

const LESSON_COST = 10;

const levelOptions = [
  { value: "beginner", label: "Boshlang'ich" },
  { value: "intermediate", label: "O'rta" },
  { value: "advanced", label: "Yuqori" },
];

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|embed\/|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match?.[1] ?? null;
}

function isValidYoutubeUrl(url: string): boolean {
  const pattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}/;
  return pattern.test(url);
}

export default function CreateLessonPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("beginner");
  const [categoryId, setCategoryId] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<number[]>([]);

  const videoId = extractVideoId(youtubeUrl);
  const isValidUrl = youtubeUrl.length > 0 && isValidYoutubeUrl(youtubeUrl);
  const hasEnoughCoins = (user?.coins ?? 0) >= LESSON_COST;

  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: tags } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        youtubeUrl,
        level,
      };
      if (title.trim()) body.title = title.trim();
      if (categoryId) body.categoryId = parseInt(categoryId);
      if (selectedTags.length > 0) body.tagIds = selectedTags;

      const res = await apiRequest("POST", "/api/user/lessons", body);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/lessons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Dars yaratildi!",
        description: `"${data.lesson.title}" muvaffaqiyatli yaratildi. Yangi balans: ${data.newBalance} coin`,
      });
      setLocation(`/lessons/${data.lesson.id}/process`);
    },
    onError: (error: Error) => {
      const msg = error.message.includes(":") ? error.message.split(":").slice(1).join(":").trim() : error.message;
      let parsed = msg;
      try {
        parsed = JSON.parse(msg).message;
      } catch {}
      toast({
        title: "Xatolik",
        description: parsed,
        variant: "destructive",
      });
    },
  });

  const toggleTag = (tagId: number) => {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  return (
    <UserLayout title="Dars yaratish" subtitle="YouTube videosidan yangi dars yarating">
      <div className="max-w-2xl space-y-6">
        <Card className="glass border-border/50" data-testid="card-coin-info">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 flex items-center justify-center">
                  <Coins className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Coin balansi</p>
                  <p className="text-2xl font-bold" data-testid="text-coin-balance">{user?.coins ?? 0}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Dars narxi</p>
                <p className="text-lg font-semibold text-primary" data-testid="text-lesson-cost">{LESSON_COST} coin</p>
              </div>
            </div>
            {!hasEnoughCoins && (
              <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20" data-testid="alert-insufficient-coins">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                <p className="text-xs text-destructive">
                  Bu amal uchun coin yetarli emas. Kamida {LESSON_COST} coin kerak.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-border/50" data-testid="card-create-lesson-form">
          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="youtube-url" className="text-sm font-medium">
                YouTube havolasi <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
                <Input
                  id="youtube-url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  className="pl-9 bg-muted/30 border-border/50"
                  data-testid="input-youtube-url"
                />
                {youtubeUrl.length > 0 && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {isValidUrl ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-orange-400" />
                    )}
                  </div>
                )}
              </div>
              {youtubeUrl.length > 0 && !isValidUrl && (
                <p className="text-xs text-orange-400">Noto'g'ri YouTube havolasi</p>
              )}
            </div>

            {videoId && (
              <div className="rounded-lg overflow-hidden border border-border/50 bg-muted/20" data-testid="card-video-preview">
                <img
                  src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                  alt="Video thumbnail"
                  className="w-full h-48 object-cover"
                />
                <div className="p-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Video ID: {videoId}</span>
                  <a
                    href={youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                    data-testid="link-preview-youtube"
                  >
                    YouTube'da ochish <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm font-medium">
                Dars nomi <span className="text-muted-foreground text-xs">(ixtiyoriy)</span>
              </Label>
              <Input
                id="title"
                placeholder="Avtomatik nom beriladi..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-muted/30 border-border/50"
                data-testid="input-lesson-title"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Daraja <span className="text-destructive">*</span>
                </Label>
                <Select value={level} onValueChange={setLevel}>
                  <SelectTrigger className="bg-muted/30 border-border/50" data-testid="select-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {levelOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Kategoriya <span className="text-muted-foreground text-xs">(ixtiyoriy)</span>
                </Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="bg-muted/30 border-border/50" data-testid="select-category">
                    <SelectValue placeholder="Tanlang..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map(cat => (
                      <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {tags && tags.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Teglar <span className="text-muted-foreground text-xs">(ixtiyoriy)</span>
                </Label>
                <div className="flex flex-wrap gap-2" data-testid="tag-selector">
                  {tags.map(tag => {
                    const isSelected = selectedTags.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                          isSelected
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50"
                        }`}
                        data-testid={`tag-${tag.id}`}
                      >
                        {tag.name}
                        {isSelected && <X className="w-3 h-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-border/30">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span>Dars yaratish</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-sm font-semibold">{LESSON_COST} coin</span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Qoldiq: {Math.max(0, (user?.coins ?? 0) - LESSON_COST)} coin
                  </span>
                </div>
              </div>

              <Button
                className="w-full gap-2"
                size="lg"
                disabled={!isValidUrl || !hasEnoughCoins || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                data-testid="button-submit-lesson"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Yaratilmoqda...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Dars yaratish ({LESSON_COST} coin)
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </UserLayout>
  );
}
