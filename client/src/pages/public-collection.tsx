import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import PublicLayout from "@/components/layouts/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, BookOpen, FolderOpen, GraduationCap,
  Play, CheckCircle, User
} from "lucide-react";
import type { Lesson, Collection } from "@shared/schema";

type CollectionWithLessons = Collection & {
  lessons: (Lesson & { orderIndex: number; completionPercent: number })[];
  lessonCount: number;
  creatorName: string;
};

const levelLabels: Record<string, string> = {
  beginner: "Boshlang'ich",
  intermediate: "O'rta",
  advanced: "Yuqori",
};

const levelColors: Record<string, string> = {
  beginner: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  intermediate: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  advanced: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

export default function PublicCollectionPage() {
  const [, params] = useRoute("/library/collection/:id");
  const collectionId = params?.id;

  const { data: collection, isLoading } = useQuery<CollectionWithLessons>({
    queryKey: ["/api/collections/public", collectionId],
    queryFn: async () => {
      const res = await fetch(`/api/collections/public/${collectionId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!collectionId,
  });

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="max-w-4xl mx-auto px-3 md:px-6 py-6 md:py-10">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-4 w-96 mb-8" />
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </PublicLayout>
    );
  }

  if (!collection) {
    return (
      <PublicLayout>
        <div className="max-w-4xl mx-auto px-3 md:px-6 py-20 text-center">
          <FolderOpen className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Papka topilmadi</h2>
          <Link href="/library">
            <Button variant="outline" className="mt-4 gap-2">
              <ArrowLeft className="w-4 h-4" />
              Kutubxonaga qaytish
            </Button>
          </Link>
        </div>
      </PublicLayout>
    );
  }

  const totalLessons = collection.lessons.length;
  const completedLessons = collection.lessons.filter(l => l.completionPercent >= 80).length;
  const overallProgress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto px-3 md:px-6 py-6 md:py-10">
        <Link href="/library">
          <Button variant="ghost" size="sm" className="mb-4 gap-1.5 text-muted-foreground hover:text-foreground" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
            Kutubxona
          </Button>
        </Link>

        <div className="relative mb-8 p-6 md:p-8 rounded-2xl overflow-hidden" data-testid="collection-header">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-cyan-500/10 to-violet-500/15" />
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-primary/20 to-transparent rounded-bl-full" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-violet-500/15 to-transparent rounded-tr-full" />

          <div className="relative z-10">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/30 to-violet-500/30 flex items-center justify-center shrink-0 border border-primary/20 overflow-hidden"
                style={{ boxShadow: "0 0 20px hsl(var(--primary) / 0.3)" }}
              >
                {collection.coverImage ? (
                  <img src={collection.coverImage} alt={collection.name} className="w-full h-full object-cover" />
                ) : (
                  <FolderOpen className="w-8 h-8 text-primary" />
                )}
              </div>
              <div className="flex-1">
                <h1 className="text-2xl md:text-3xl font-bold mb-1" data-testid="text-collection-name"
                  style={{ textShadow: "0 0 20px hsl(var(--primary) / 0.3)" }}
                >
                  {collection.name}
                </h1>
                {collection.description && (
                  <p className="text-sm text-muted-foreground mb-3">{collection.description}</p>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge className={levelColors[collection.level] || ""}>
                    <GraduationCap className="w-3 h-3 mr-1" />
                    {levelLabels[collection.level] || collection.level}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {collection.targetLanguage === "ar" ? "Arab tili" : "Ingliz tili"}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    {totalLessons} ta dars
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {collection.creatorName}
                  </span>
                </div>
              </div>
            </div>

            {totalLessons > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Umumiy progress</span>
                  <span className="font-medium text-primary">{overallProgress}%</span>
                </div>
                <Progress value={overallProgress} className="h-2" />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3" data-testid="lessons-list">
          {collection.lessons.map((lesson, idx) => (
            <Link key={lesson.id} href={`/library/${lesson.id}`}>
              <Card
                className="glass border-border/50 hover:border-primary/30 transition-all duration-300 group cursor-pointer"
                data-testid={`lesson-card-${lesson.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center shrink-0 border border-primary/20">
                      {lesson.completionPercent >= 80 ? (
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <span className="text-sm font-bold text-primary">{idx + 1}</span>
                      )}
                    </div>
                    {lesson.thumbnailUrl && (
                      <img src={lesson.thumbnailUrl} alt="" className="w-24 h-14 rounded-lg object-cover shrink-0 group-hover:scale-[1.02] transition-transform" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm group-hover:text-primary transition-colors truncate" data-testid={`text-lesson-title-${lesson.id}`}>
                        {lesson.title}
                      </h3>
                      {lesson.summaryShort && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{lesson.summaryShort}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {levelLabels[lesson.level] || lesson.level}
                        </Badge>
                        {lesson.completionPercent > 0 && lesson.completionPercent < 80 && (
                          <span className="text-[10px] text-muted-foreground">{Math.round(lesson.completionPercent)}% tugallangan</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <Play className="w-4 h-4 text-primary ml-0.5" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}

          {collection.lessons.length === 0 && (
            <Card className="glass border-border/50">
              <CardContent className="p-12 text-center">
                <BookOpen className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Darslar yo'q</h3>
                <p className="text-sm text-muted-foreground">Bu papkaga hali darslar qo'shilmagan.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
