import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import PublicLayout from "@/components/layouts/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, BookOpen, Star, Clock, GraduationCap, Sparkles, ArrowLeft, Filter, FolderOpen } from "lucide-react";
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
            <Badge
              className={`absolute top-2 right-2 ${levelColors[lesson.level] || ""}`}
              data-testid={`badge-level-${lesson.id}`}
            >
              {levelLabels[lesson.level] || lesson.level}
            </Badge>
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
            {lesson.categoryName && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0" data-testid={`badge-category-${lesson.id}`}>
                <FolderOpen className="w-2.5 h-2.5 mr-0.5" />
                {lesson.categoryName}
              </Badge>
            )}
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

function LessonCardSkeleton() {
  return (
    <Card className="glass border-border/50">
      <Skeleton className="w-full aspect-video rounded-t-md" />
      <CardContent className="p-4 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/2" />
      </CardContent>
    </Card>
  );
}

function FeaturedSection({ lessons }: { lessons: LessonWithCategory[] }) {
  const featured = lessons.filter((l) => l.isFeatured);
  if (featured.length === 0) return null;

  return (
    <section className="mb-12" data-testid="section-featured">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <h2 className="text-lg font-bold" data-testid="text-featured-title">Tavsiya etilgan darslar</h2>
          <p className="text-xs text-muted-foreground">Eng yaxshi tanlangan darslar</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {featured.slice(0, 4).map((lesson) => (
          <LessonCard key={lesson.id} lesson={lesson} />
        ))}
      </div>
    </section>
  );
}

export default function PublicLibrary() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");

  const queryParams = new URLSearchParams();
  if (search) queryParams.set("search", search);
  if (categoryFilter && categoryFilter !== "all") queryParams.set("category", categoryFilter);
  if (levelFilter && levelFilter !== "all") queryParams.set("level", levelFilter);

  const queryString = queryParams.toString();
  const apiUrl = `/api/lessons/public${queryString ? `?${queryString}` : ""}`;

  const { data, isLoading, isError } = useQuery<{ lessons: LessonWithCategory[]; categories: Category[] }>({
    queryKey: ["/api/lessons/public", search, categoryFilter, levelFilter],
    queryFn: async () => {
      const res = await fetch(apiUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const lessons = data?.lessons ?? [];
  const categories = data?.categories ?? [];
  const hasFilters = search || categoryFilter !== "all" || levelFilter !== "all";

  return (
    <PublicLayout>
      <div className="max-w-6xl mx-auto px-3 md:px-6 py-6 md:py-10">
        <div className="mb-8">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-3 gap-1.5 text-muted-foreground hover:text-foreground" data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4" />
              Bosh sahifa
            </Button>
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-library-title">Darslar kutubxonasi</h1>
              <p className="text-sm text-muted-foreground" data-testid="text-library-subtitle">
                Barcha e'lon qilingan darslarni ko'ring va o'rganing
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-8" data-testid="section-filters">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Darslarni qidirish..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-category">
              <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Kategoriya" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha kategoriyalar</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={String(cat.id)} data-testid={`option-category-${cat.id}`}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-full sm:w-[160px]" data-testid="select-level">
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
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setCategoryFilter("all");
                setLevelFilter("all");
              }}
              data-testid="button-clear-filters"
            >
              Tozalash
            </Button>
          )}
        </div>

        {isError ? (
          <div className="text-center py-16" data-testid="error-state">
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-7 h-7 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Xatolik yuz berdi</h3>
            <p className="text-sm text-muted-foreground mb-4">Darslarni yuklashda xatolik. Qaytadan urinib ko'ring.</p>
            <Button variant="outline" onClick={() => window.location.reload()} data-testid="button-retry">
              Qayta yuklash
            </Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-8">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <LessonCardSkeleton key={i} />
              ))}
            </div>
          </div>
        ) : (
          <>
            {!hasFilters && <FeaturedSection lessons={lessons} />}

            <section data-testid="section-all-lessons">
              <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold" data-testid="text-all-lessons-title">
                      {hasFilters ? "Qidiruv natijalari" : "Barcha darslar"}
                    </h2>
                    <p className="text-xs text-muted-foreground" data-testid="text-lessons-count">
                      {lessons.length} ta dars topildi
                    </p>
                  </div>
                </div>
              </div>

              {lessons.length === 0 ? (
                <Card className="glass border-border/50">
                  <CardContent className="p-12 text-center">
                    <BookOpen className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2" data-testid="text-no-results">
                      Darslar topilmadi
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {hasFilters
                        ? "Qidiruv so'rovingiz bo'yicha darslar topilmadi. Filtrlarni o'zgartirib ko'ring."
                        : "Hozircha e'lon qilingan darslar yo'q."}
                    </p>
                    {hasFilters && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearch("");
                          setCategoryFilter("all");
                          setLevelFilter("all");
                        }}
                        data-testid="button-clear-filters-empty"
                      >
                        Filtrlarni tozalash
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {lessons.map((lesson) => (
                    <LessonCard key={lesson.id} lesson={lesson} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

      </div>
    </PublicLayout>
  );
}
