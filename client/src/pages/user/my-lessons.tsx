import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import UserLayout from "@/components/layouts/user-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  BookOpen, Search, PlusCircle, PlayCircle,
  Calendar, ArrowUpDown, Filter, Wand2, Trash2
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Lesson } from "@shared/schema";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  pending: { label: "Kutilmoqda", variant: "secondary", color: "text-orange-400" },
  approved: { label: "Tasdiqlangan", variant: "default", color: "text-emerald-500" },
  rejected: { label: "Rad etilgan", variant: "destructive", color: "text-red-400" },
  published: { label: "E'lon qilingan", variant: "outline", color: "text-primary" },
  draft: { label: "Qoralama", variant: "secondary", color: "text-muted-foreground" },
};

const levelLabels: Record<string, string> = {
  beginner: "Boshlang'ich",
  intermediate: "O'rta",
  advanced: "Yuqori",
};

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("uz-UZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function MyLessonsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const { toast } = useToast();

  const { data: lessons, isLoading, error } = useQuery<Lesson[]>({
    queryKey: ["/api/user/lessons"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/user/lessons/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/lessons"] });
      toast({ title: "Dars o'chirildi", description: "Dars muvaffaqiyatli o'chirildi." });
    },
    onError: () => {
      toast({ title: "Xatolik", description: "Darsni o'chirishda xatolik yuz berdi.", variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    if (!lessons) return [];
    let result = [...lessons];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l => l.title.toLowerCase().includes(q));
    }

    if (statusFilter !== "all") {
      result = result.filter(l => l.status === statusFilter);
    }

    result.sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return sortOrder === "newest" ? bTime - aTime : aTime - bTime;
    });

    return result;
  }, [lessons, search, statusFilter, sortOrder]);

  const statusCounts = useMemo(() => {
    if (!lessons) return {};
    const counts: Record<string, number> = {};
    lessons.forEach(l => {
      counts[l.status] = (counts[l.status] || 0) + 1;
    });
    return counts;
  }, [lessons]);

  if (error) {
    return (
      <UserLayout title="Mening darslarim" subtitle="Barcha darslaringiz bir joyda">
        <Card className="glass border-destructive/30">
          <CardContent className="p-8 text-center">
            <BookOpen className="w-10 h-10 text-destructive mx-auto mb-3" />
            <p className="text-sm text-destructive">Darslarni yuklashda xatolik yuz berdi</p>
          </CardContent>
        </Card>
      </UserLayout>
    );
  }

  return (
    <UserLayout title="Mening darslarim" subtitle="Barcha darslaringiz bir joyda">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap gap-2">
          {Object.entries(statusConfig).map(([key, cfg]) => {
            const count = statusCounts[key] || 0;
            if (count === 0 && key !== "pending") return null;
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  statusFilter === key
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50"
                }`}
                data-testid={`filter-status-${key}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${statusFilter === key ? "bg-primary" : "bg-muted-foreground/40"}`} />
                {cfg.label} ({count})
              </button>
            );
          })}
          {statusFilter !== "all" && (
            <button
              onClick={() => setStatusFilter("all")}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50 transition-all"
              data-testid="filter-status-clear"
            >
              <Filter className="w-3 h-3" /> Barchasi ({lessons?.length || 0})
            </button>
          )}
        </div>

        <Link href="/lessons/create">
          <Button size="sm" className="gap-1.5" data-testid="button-create-lesson">
            <PlusCircle className="w-4 h-4" /> Yangi dars
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Dars nomi bo'yicha qidirish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted/30 border-border/50"
            data-testid="input-search-lessons"
          />
        </div>
        <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "newest" | "oldest")}>
          <SelectTrigger className="w-[180px] bg-muted/30 border-border/50" data-testid="select-sort-order">
            <ArrowUpDown className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Eng yangi</SelectItem>
            <SelectItem value="oldest">Eng eski</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="glass border-border/50">
              <CardContent className="p-0">
                <Skeleton className="h-36 w-full rounded-t-lg" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-6 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((lesson) => {
            const st = statusConfig[lesson.status] ?? statusConfig.draft;
            return (
              <Card
                key={lesson.id}
                className="glass border-border/50 overflow-hidden hover:border-primary/30 transition-colors group"
                data-testid={`card-lesson-${lesson.id}`}
              >
                <CardContent className="p-0">
                  <div className="relative">
                    {lesson.thumbnailUrl ? (
                      <img
                        src={lesson.thumbnailUrl}
                        alt={lesson.title}
                        className="w-full h-36 object-cover"
                      />
                    ) : (
                      <div className="w-full h-36 bg-gradient-to-br from-muted/50 to-muted/30 flex items-center justify-center">
                        <PlayCircle className="w-10 h-10 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/30 transition-all opacity-0 group-hover:opacity-100"
                            data-testid={`button-delete-lesson-${lesson.id}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Darsni o'chirish</AlertDialogTitle>
                            <AlertDialogDescription>
                              "{lesson.title}" darsini o'chirishni xohlaysizmi? Bu amalni ortga qaytarib bo'lmaydi.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(lesson.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              data-testid={`button-confirm-delete-${lesson.id}`}
                            >
                              O'chirish
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                    </div>
                    {lesson.level && (
                      <div className="absolute bottom-2 left-2">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-black/60 text-white backdrop-blur-sm">
                          {levelLabels[lesson.level] ?? lesson.level}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <Link href={lesson.summaryShort ? `/lessons/${lesson.id}` : (lesson.status === "pending" ? `/lessons/${lesson.id}/process` : "#")}>
                      <h3 className="text-sm font-semibold truncate mb-1 group-hover:text-primary transition-colors cursor-pointer">
                        {lesson.title}
                      </h3>
                    </Link>
                    {lesson.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{lesson.description}</p>
                    )}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(lesson.createdAt)}
                      </div>
                      {lesson.status === "pending" && !lesson.summaryShort ? (
                        <Link href={`/lessons/${lesson.id}/process`}>
                          <span className="text-primary hover:underline flex items-center gap-1 cursor-pointer" data-testid={`link-process-${lesson.id}`}>
                            <Wand2 className="w-3 h-3" /> Davom etish
                          </span>
                        </Link>
                      ) : lesson.youtubeUrl ? (
                        <a
                          href={lesson.youtubeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-red-400 hover:text-red-300 flex items-center gap-1"
                          data-testid={`link-youtube-${lesson.id}`}
                        >
                          YouTube ↗
                        </a>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="glass border-border/50" data-testid="card-no-lessons">
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/10 to-cyan-500/10 flex items-center justify-center mb-6">
                <BookOpen className="w-10 h-10 text-primary" />
              </div>
              {lessons && lessons.length > 0 ? (
                <>
                  <h2 className="text-xl font-semibold mb-2">Natija topilmadi</h2>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Qidiruv yoki filter bo'yicha darslar topilmadi. Boshqa parametrlarni sinab ko'ring.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold mb-2">Darslar ro'yxati</h2>
                  <p className="text-sm text-muted-foreground max-w-md mb-6">
                    Bu yerda siz yaratgan darslar ko'rsatiladi.
                    Yangi dars yaratish uchun quyidagi tugmani bosing.
                  </p>
                  <Link href="/lessons/create">
                    <Button className="gap-1.5" data-testid="button-create-first-lesson">
                      <PlusCircle className="w-4 h-4" /> Dars yaratish
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </UserLayout>
  );
}
