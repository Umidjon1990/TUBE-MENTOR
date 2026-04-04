import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import PublicLayout from "@/components/layouts/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, BookOpen, Star, Clock, ArrowLeft, GraduationCap, FolderOpen, Sparkles } from "lucide-react";
import type { Lesson, Category } from "@shared/schema";

type LessonWithCategory = Lesson & { categoryName?: string | null };

const levelLabels: Record<string, string> = {
  beginner: "Boshlang'ich",
  intermediate: "O'rta",
  advanced: "Yuqori",
};

const levelColors: Record<string, string> = {
  beginner: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  intermediate: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  advanced: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

function LessonCard({ lesson }: { lesson: LessonWithCategory }) {
  return (
    <Link href={`/library/${lesson.id}`}>
      <Card
        className="glass border-border/50 hover:border-primary/30 transition-all duration-300 group cursor-pointer h-full"
        data-testid={`card-lesson-${lesson.id}`}
      >
        {lesson.thumbnailUrl && (
          <div className="relative overflow-hidden rounded-t-md">
            <img
              src={lesson.thumbnailUrl}
              alt={lesson.title}
              className="w-full aspect-video object-cover group-hover:scale-[1.02] transition-transform duration-300"
              data-testid={`img-thumbnail-${lesson.id}`}
            />
            {lesson.isFeatured && (
              <div className="absolute top-2 left-2">
                <Badge className="bg-amber-500/90 text-white border-amber-600/50" data-testid={`badge-featured-${lesson.id}`}>
                  <Star className="w-3 h-3 mr-1" />
                  Tavsiya etilgan
                </Badge>
              </div>
            )}
            <div className="absolute top-2 right-2 flex items-center gap-1">
              {(lesson as any).targetLanguage && (lesson as any).targetLanguage !== "ar" && (
                <Badge className="bg-blue-600/90 text-white border-blue-700/50 uppercase text-[10px]" data-testid={`badge-lang-${lesson.id}`}>
                  {(lesson as any).targetLanguage}
                </Badge>
              )}
              <Badge
                className={levelColors[lesson.level] || ""}
                data-testid={`badge-level-${lesson.id}`}
              >
                {levelLabels[lesson.level] || lesson.level}
              </Badge>
            </div>
          </div>
        )}
        <CardContent className="p-4">
          <h3
            className="font-semibold text-sm line-clamp-2 mb-2 group-hover:text-primary transition-colors"
            data-testid={`text-title-${lesson.id}`}
          >
            {lesson.title}
          </h3>
          {lesson.summaryShort && (
            <p
              className="text-xs text-muted-foreground line-clamp-2 mb-3"
              data-testid={`text-summary-${lesson.id}`}
            >
              {lesson.summaryShort}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            {lesson.publishedAt && (
              <span className="flex items-center gap-1" data-testid={`text-date-${lesson.id}`}>
                <Clock className="w-3 h-3" />
                {new Date(lesson.publishedAt).toLocaleDateString("uz-UZ")}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function PublicCategoryPage() {
  const { id } = useParams<{ id: string }>();
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");

  const { data: categoryData, isLoading: catLoading } = useQuery<Category & { lessonCount: number }>({
    queryKey: ["/api/categories/public", id],
    queryFn: async () => {
      const res = await fetch(`/api/categories/public/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: lessonsData, isLoading: lessonsLoading } = useQuery<{ lessons: LessonWithCategory[]; categories: Category[] }>({
    queryKey: ["/api/lessons/public", "", id, levelFilter, "all"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (id) params.set("category", id);
      if (levelFilter && levelFilter !== "all") params.set("level", levelFilter);
      const qs = params.toString();
      const res = await fetch(`/api/lessons/public${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!id,
  });

  const lessons = lessonsData?.lessons ?? [];
  const filteredLessons = search
    ? lessons.filter(l =>
        l.title.toLowerCase().includes(search.toLowerCase()) ||
        l.summaryShort?.toLowerCase().includes(search.toLowerCase())
      )
    : lessons;

  const isLoading = catLoading || lessonsLoading;

  return (
    <PublicLayout>
      <div className="max-w-6xl mx-auto px-3 md:px-6 py-6 md:py-10">
        <div className="mb-8">
          <Link href="/library">
            <Button variant="ghost" size="sm" className="mb-3 gap-1.5 text-muted-foreground hover:text-foreground" data-testid="button-back-library">
              <ArrowLeft className="w-4 h-4" />
              Kutubxona
            </Button>
          </Link>

          {catLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
          ) : categoryData ? (
            <div className="flex items-start gap-4">
              {(categoryData as any).thumbnailUrl && (
                <div className="w-20 h-14 rounded-xl overflow-hidden shrink-0 border border-border/30 bg-muted/30">
                  <img
                    src={(categoryData as any).thumbnailUrl}
                    alt={categoryData.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold" data-testid="text-category-title">{categoryData.name}</h1>
                  <Badge variant="secondary" className="text-xs">
                    <BookOpen className="w-3 h-3 mr-1" />
                    {lessons.length} dars
                  </Badge>
                </div>
                {categoryData.description && (
                  <p className="text-sm text-muted-foreground" data-testid="text-category-desc">
                    {categoryData.description}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <h1 className="text-2xl font-bold text-muted-foreground">Kategoriya topilmadi</h1>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-8" data-testid="section-category-filters">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Darslarni qidirish..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-category"
            />
          </div>
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-full sm:w-[160px]" data-testid="select-level-category">
              <GraduationCap className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Daraja" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha darajalar</SelectItem>
              <SelectItem value="beginner">Boshlang'ich</SelectItem>
              <SelectItem value="intermediate">O'rta</SelectItem>
              <SelectItem value="advanced">Yuqori</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="glass border-border/50">
                <Skeleton className="w-full aspect-video rounded-t-md" />
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredLessons.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredLessons.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1" data-testid="text-no-lessons">Darslar topilmadi</h3>
            <p className="text-sm text-muted-foreground">
              {search ? "Qidiruv bo'yicha natija yo'q" : "Bu kategoriyada hali darslar yo'q"}
            </p>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
