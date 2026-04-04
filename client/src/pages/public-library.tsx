import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import PublicLayout from "@/components/layouts/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, ArrowLeft, FolderOpen, Languages, Sparkles, ArrowRight, Play, Search } from "lucide-react";
import type { Collection } from "@shared/schema";
import { SUPPORTED_LANGUAGES } from "@shared/languages";

type CategoryWithMeta = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  thumbnailUrl: string | null;
  lessonCount: number;
  languages: string[];
};

type CollectionWithMeta = Collection & { lessonCount: number; creatorName: string; completionPercent: number };

const langLabels: Record<string, string> = {
  ar: "Arabcha",
  en: "Inglizcha",
};

function CategoryFolderCard({ category, index }: { category: CategoryWithMeta; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -6;
    const rotateY = ((x - centerX) / centerX) * 6;
    cardRef.current.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!cardRef.current) return;
    cardRef.current.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
  }, []);

  return (
    <Link href={`/library/category/${category.id}`}>
      <div
        ref={cardRef}
        className="cursor-pointer"
        style={{
          animationDelay: `${index * 80}ms`,
          transformStyle: "preserve-3d",
          transition: "transform 0.15s ease-out, box-shadow 0.3s ease",
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        data-testid={`card-folder-${category.id}`}
      >
        <div className="relative rounded-2xl overflow-hidden border border-border/30 group">
          {category.thumbnailUrl ? (
            <div className="relative w-full aspect-video overflow-hidden">
              <img
                src={category.thumbnailUrl}
                alt={category.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                data-testid={`img-folder-${category.id}`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h3
                  className="font-bold text-lg text-white line-clamp-1 mb-1"
                  style={{ textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                  data-testid={`text-folder-name-${category.id}`}
                >
                  {category.name}
                </h3>
                <div className="flex items-center gap-2">
                  <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm text-xs">
                    <BookOpen className="w-3 h-3 mr-1" />
                    {category.lessonCount} dars
                  </Badge>
                  {category.languages.map(lang => (
                    <Badge key={lang} className="bg-primary/80 text-white border-primary/50 backdrop-blur-sm text-[10px] uppercase">
                      {lang}
                    </Badge>
                  ))}
                </div>
              </div>
              <div
                className="absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--primary)), hsl(190 95% 60%))",
                  boxShadow: "0 0 16px hsl(var(--primary) / 0.5)",
                }}
              >
                <ArrowRight className="w-4 h-4 text-primary-foreground" />
              </div>
            </div>
          ) : (
            <div
              className="relative w-full aspect-video overflow-hidden flex flex-col items-center justify-center"
              style={{
                background: "linear-gradient(135deg, hsl(var(--card) / 0.9), hsl(var(--card) / 0.5))",
              }}
            >
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: "radial-gradient(circle at 50% 50%, hsl(var(--primary) / 0.12), transparent 70%)",
                }}
              />
              <div
                className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-40 pointer-events-none"
                style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.25), transparent 70%)" }}
              />
              <div
                className="absolute -bottom-8 -left-8 w-28 h-28 rounded-full opacity-30 pointer-events-none"
                style={{ background: "radial-gradient(circle, hsl(260 80% 62% / 0.2), transparent 70%)" }}
              />
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3 border border-primary/20"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--primary) / 0.25), hsl(260 80% 62% / 0.2))",
                  boxShadow: "0 0 24px hsl(var(--primary) / 0.3), inset 0 0 16px hsl(var(--primary) / 0.1)",
                }}
              >
                <FolderOpen className="w-8 h-8 text-primary" style={{ filter: "drop-shadow(0 0 6px hsl(var(--primary) / 0.5))" }} />
              </div>
              <h3
                className="font-bold text-lg line-clamp-1 group-hover:text-primary transition-colors duration-300 relative z-10 px-4 text-center"
                data-testid={`text-folder-name-${category.id}`}
              >
                {category.name}
              </h3>
              <div className="flex items-center gap-2 mt-2 relative z-10">
                <Badge variant="secondary" className="text-xs">
                  <BookOpen className="w-3 h-3 mr-1" />
                  {category.lessonCount} dars
                </Badge>
                {category.languages.map(lang => (
                  <Badge key={lang} className="bg-primary/15 text-primary border-primary/25 text-[10px] uppercase">
                    {lang}
                  </Badge>
                ))}
              </div>
              <div
                className="absolute bottom-3 right-3 w-9 h-9 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--primary)), hsl(190 95% 60%))",
                  boxShadow: "0 0 12px hsl(var(--primary) / 0.4)",
                }}
              >
                <ArrowRight className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
            </div>
          )}
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

function CategoryCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden border border-border/30">
      <Skeleton className="w-full aspect-video" />
    </div>
  );
}

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

  return (
    <Link href={`/library/collection/${collection.id}`}>
      <div
        ref={cardRef}
        className="cursor-pointer"
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
                  <Badge className={`text-[10px] px-1.5 py-0 ${levelColors[collection.level] || ""}`}>
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

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <BookOpen className="w-3 h-3" />
                {collection.lessonCount} dars
              </span>
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

export default function PublicLibrary() {
  const initialLang = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("lang") || "all"
    : "all";

  const [langFilter, setLangFilter] = useState<string>(["ar", "en"].includes(initialLang) ? initialLang : "all");

  const { data: categories = [], isLoading: catLoading } = useQuery<CategoryWithMeta[]>({
    queryKey: ["/api/categories/public", langFilter],
    queryFn: async () => {
      const res = await fetch(`/api/categories/public`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      const all: CategoryWithMeta[] = await res.json();
      if (langFilter && langFilter !== "all") {
        return all.filter(c => c.languages.includes(langFilter));
      }
      return all;
    },
  });

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
                    : "Kategoriyani tanlang va o'rganishni boshlang"}
              </p>
            </div>
            <Select value={langFilter} onValueChange={setLangFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-language">
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
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          </Link>
        )}

        <CollectionsSection langFilter={langFilter} />

        <section data-testid="section-categories">
          <div className="flex items-center gap-2 mb-6">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary) / 0.2), hsl(190 95% 60% / 0.15))",
                boxShadow: "0 0 12px hsl(var(--primary) / 0.15)",
              }}
            >
              <FolderOpen className="w-5 h-5 text-primary" style={{ filter: "drop-shadow(0 0 4px hsl(var(--primary) / 0.5))" }} />
            </div>
            <div>
              <h2 className="text-lg font-bold" data-testid="text-categories-title"
                style={{ textShadow: "0 0 16px hsl(var(--primary) / 0.2)" }}
              >
                Kategoriyalar
              </h2>
              <p className="text-xs text-muted-foreground">Papkani tanlang va darslarni ko'ring</p>
            </div>
          </div>

          {catLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <CategoryCardSkeleton key={i} />
              ))}
            </div>
          ) : categories.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {categories.map((cat, idx) => (
                <CategoryFolderCard key={cat.id} category={cat} index={idx} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-1" data-testid="text-no-categories">Kategoriyalar topilmadi</h3>
              <p className="text-sm text-muted-foreground">
                {langFilter !== "all" ? "Bu til bo'yicha kategoriyalar yo'q" : "Hali kategoriyalar yaratilmagan"}
              </p>
            </div>
          )}
        </section>
      </div>
    </PublicLayout>
  );
}
