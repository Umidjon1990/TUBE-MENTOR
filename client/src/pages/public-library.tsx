import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import PublicLayout from "@/components/layouts/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, BookOpen, Star, Clock, GraduationCap, Sparkles, ArrowLeft, Filter, FolderOpen, Languages, ArrowRight, Play } from "lucide-react";
import type { Lesson, Category, Collection } from "@shared/schema";
import { SUPPORTED_LANGUAGES } from "@shared/languages";

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

type CollectionWithMeta = Collection & { lessonCount: number; creatorName: string; completionPercent: number };

function Collection3DCard({ collection, index }: { collection: CollectionWithMeta; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -8;
    const rotateY = ((x - centerX) / centerX) * 8;
    cardRef.current.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!cardRef.current) return;
    cardRef.current.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
  }, []);

  return (
    <Link href={`/library/collection/${collection.id}`}>
      <div
        ref={cardRef}
        className="collection-card-enter cursor-pointer"
        style={{
          animationDelay: `${index * 100}ms`,
          transformStyle: "preserve-3d",
          transition: "transform 0.15s ease-out, box-shadow 0.3s ease",
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        data-testid={`card-collection-3d-${collection.id}`}
      >
        <div
          className="relative rounded-2xl overflow-hidden border border-border/30 group"
          style={{
            background: "linear-gradient(135deg, hsl(var(--card) / 0.7), hsl(var(--card) / 0.4))",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            style={{
              background: "radial-gradient(circle at 50% 50%, hsl(var(--primary) / 0.12), transparent 70%)",
            }}
          />
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-40 pointer-events-none"
            style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.25), transparent 70%)" }}
          />
          <div className="absolute -bottom-8 -left-8 w-28 h-28 rounded-full opacity-30 pointer-events-none"
            style={{ background: "radial-gradient(circle, hsl(260 80% 62% / 0.2), transparent 70%)" }}
          />

          {collection.coverImage && (
            <div className="relative w-full h-44 overflow-hidden rounded-t-2xl">
              <img
                src={collection.coverImage}
                alt={collection.name}
                className="w-full h-full object-contain bg-black/30"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-card/80 via-transparent to-transparent" />
            </div>
          )}

          <div className={`relative ${collection.coverImage ? 'px-5 pb-5 -mt-4' : 'p-5'}`}>
            <div className={`flex items-start gap-3.5 mb-3 ${collection.coverImage ? 'pt-1' : ''}`}>
              {!collection.coverImage && (
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 border border-primary/20 overflow-hidden"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--primary) / 0.25), hsl(260 80% 62% / 0.2))",
                    boxShadow: "0 0 16px hsl(var(--primary) / 0.25), inset 0 0 12px hsl(var(--primary) / 0.1)",
                  }}
                >
                  <FolderOpen className="w-7 h-7 text-primary" style={{ filter: "drop-shadow(0 0 6px hsl(var(--primary) / 0.5))" }} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3
                  className="font-bold text-base line-clamp-1 group-hover:text-primary transition-colors duration-300"
                  data-testid={`text-collection-name-${collection.id}`}
                >
                  {collection.name}
                </h3>
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge
                    className={`text-[10px] px-1.5 py-0 ${levelColors[collection.level] || ""}`}
                  >
                    {levelLabels[collection.level] || collection.level}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {collection.targetLanguage === "ar" ? "Arab" : "English"}
                  </Badge>
                </div>
              </div>
            </div>

            {collection.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{collection.description}</p>
            )}

            <div className="mb-3">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                <span className="flex items-center gap-1">
                  <BookOpen className="w-3 h-3" />
                  {collection.lessonCount} dars
                </span>
                <span>
                  {collection.completionPercent > 0
                    ? `${collection.completionPercent}%`
                    : collection.lessonCount > 0 ? "Boshlash" : "Bo'sh"}
                </span>
              </div>
              <div className="h-1 rounded-full overflow-hidden bg-muted/50">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(collection.completionPercent, collection.lessonCount > 0 ? 2 : 0)}%`,
                    background: collection.completionPercent === 100
                      ? "linear-gradient(90deg, hsl(142 76% 56%), hsl(142 76% 46%))"
                      : "linear-gradient(90deg, hsl(var(--primary)), hsl(190 95% 60%))",
                    boxShadow: `0 0 8px ${collection.completionPercent === 100 ? "hsl(142 76% 56% / 0.4)" : "hsl(var(--primary) / 0.4)"}`,
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--primary)), hsl(190 95% 60%))",
                  boxShadow: "0 0 12px hsl(var(--primary) / 0.4)",
                }}
              >
                <Play className="w-3.5 h-3.5 text-primary-foreground ml-0.5" />
              </div>
            </div>
          </div>

          <div
            className="absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{
              background: "linear-gradient(90deg, transparent, hsl(var(--primary) / 0.6), hsl(260 80% 62% / 0.4), transparent)",
            }}
          />
        </div>
      </div>
    </Link>
  );
}

function CollectionsSection({ langFilter }: { langFilter: string }) {
  const { data: publicCollections = [], isLoading } = useQuery<CollectionWithMeta[]>({
    queryKey: ["/api/collections/public", langFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (langFilter && langFilter !== "all") params.set("targetLanguage", langFilter);
      const qs = params.toString();
      const res = await fetch(`/api/collections/public${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <section className="mb-12" data-testid="section-collections-loading">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }

  if (publicCollections.length === 0) return null;

  return (
    <section className="mb-12" data-testid="section-collections">
      <div className="flex items-center gap-2 mb-6">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, hsl(var(--primary) / 0.2), hsl(260 80% 62% / 0.15))",
            boxShadow: "0 0 12px hsl(var(--primary) / 0.15)",
          }}
        >
          <FolderOpen className="w-5 h-5 text-primary" style={{ filter: "drop-shadow(0 0 4px hsl(var(--primary) / 0.5))" }} />
        </div>
        <div>
          <h2 className="text-lg font-bold" data-testid="text-collections-title"
            style={{ textShadow: "0 0 16px hsl(var(--primary) / 0.2)" }}
          >
            Podcast papkalar
          </h2>
          <p className="text-xs text-muted-foreground">Tartibli darslar to'plami</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {publicCollections.map((collection, idx) => (
          <Collection3DCard key={collection.id} collection={collection} index={idx} />
        ))}
      </div>
    </section>
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
  const initialLang = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("lang") || "all"
    : "all";

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [langFilter, setLangFilter] = useState<string>(["ar", "en"].includes(initialLang) ? initialLang : "all");

  const { data, isLoading, isError } = useQuery<{ lessons: LessonWithCategory[]; categories: Category[] }>({
    queryKey: ["/api/lessons/public", search, categoryFilter, levelFilter, langFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryFilter && categoryFilter !== "all") params.set("category", categoryFilter);
      if (levelFilter && levelFilter !== "all") params.set("level", levelFilter);
      if (langFilter && langFilter !== "all") params.set("targetLanguage", langFilter);
      const qs = params.toString();
      const res = await fetch(`/api/lessons/public${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const lessons = data?.lessons ?? [];
  const categories = data?.categories ?? [];
  const hasFilters = search || categoryFilter !== "all" || levelFilter !== "all" || langFilter !== "all";
  const hasNonLangFilters = search || categoryFilter !== "all" || levelFilter !== "all";

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
            <div className="flex-1">
              <h1 className="text-2xl font-bold" data-testid="text-library-title">
                {langFilter === "en" ? "Ingliz tili darslari" : langFilter === "ar" ? "Arab tili darslari" : "Darslar kutubxonasi"}
              </h1>
              <p className="text-sm text-muted-foreground" data-testid="text-library-subtitle">
                {langFilter === "en"
                  ? "Ingliz tili bo'yicha barcha darslarni ko'ring va o'rganing"
                  : langFilter === "ar"
                    ? "Arab tili bo'yicha barcha darslarni ko'ring va o'rganing"
                    : "Barcha e'lon qilingan darslarni ko'ring va o'rganing"}
              </p>
            </div>
          </div>
        </div>

        {langFilter !== "all" && (
          <Link href={`/smart-dictionary?lang=${langFilter}`}>
            <div
              className="mb-8 p-4 md:p-5 rounded-xl border border-primary/25 bg-gradient-to-r from-primary/8 via-cyan-500/6 to-violet-500/8 cursor-pointer group hover:border-primary/50 transition-all duration-300 relative overflow-hidden"
              style={{ boxShadow: "0 0 24px hsl(var(--primary) / 0.12), 0 0 48px hsl(var(--primary) / 0.06)" }}
              data-testid="banner-smart-dictionary"
            >
              <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-primary/10 to-transparent rounded-bl-full" />
              <div className="absolute bottom-0 left-0 w-20 h-20 bg-gradient-to-tr from-cyan-400/8 to-transparent rounded-tr-full" />
              <div className="flex items-center gap-4 relative z-10">
                <div
                  className="w-14 h-14 shrink-0 rounded-xl bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center"
                  style={{ boxShadow: "0 0 20px hsl(var(--primary) / 0.5), 0 0 40px hsl(var(--primary) / 0.25)" }}
                >
                  <Search className="w-7 h-7 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3
                      className="text-lg font-bold text-primary"
                      style={{ textShadow: "0 0 16px hsl(var(--primary) / 0.4)" }}
                    >
                      Smart Lug'at
                    </h3>
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                      <Sparkles className="w-3 h-3 mr-0.5" />
                      AI
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {langFilter === "en" ? "Inglizcha" : "Arabcha"} so'zlarni qidiring — tarjima, kontekst va videodagi aniq joyini toping
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-primary group-hover:gap-2.5 transition-all shrink-0">
                  Ochish
                  <ArrowRight className="w-4.5 h-4.5" />
                </div>
              </div>
            </div>
          </Link>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mb-8" data-testid="section-filters">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={langFilter === "en" ? "Inglizcha darslarni qidirish..." : langFilter === "ar" ? "Arabcha darslarni qidirish..." : "Darslarni qidirish..."}
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
              <SelectItem value="uncategorized">Kategoriyasiz</SelectItem>
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
          <Select value={langFilter} onValueChange={setLangFilter}>
            <SelectTrigger className="w-full sm:w-[160px]" data-testid="select-language">
              <Languages className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Til" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha tillar</SelectItem>
              {SUPPORTED_LANGUAGES.map(lang => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
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
                setLangFilter("all");
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
            {!hasNonLangFilters && <CollectionsSection langFilter={langFilter} />}
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
                      {langFilter === "en" ? "Inglizcha darslar topilmadi" : langFilter === "ar" ? "Arabcha darslar topilmadi" : "Darslar topilmadi"}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {hasFilters
                        ? "Qidiruv so'rovingiz bo'yicha darslar topilmadi. Filtrlarni o'zgartirib ko'ring."
                        : langFilter !== "all"
                          ? `Hozircha ${langFilter === "en" ? "ingliz" : "arab"} tilida e'lon qilingan darslar yo'q.`
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
