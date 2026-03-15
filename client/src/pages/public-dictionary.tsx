import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import PublicLayout from "@/components/layouts/public-layout";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, BookOpen, Play, Clock, ArrowRight, ArrowLeft, Languages, Volume2 } from "lucide-react";

interface DictResult {
  word: string;
  normalized: string;
  translationUz: string;
  translationAr: string;
  contextualMeaning?: string;
  sentence: string;
  sentenceTranslation: string;
  lessonId: number;
  lessonTitle: string;
  sentenceIndex: number;
  startTime: number;
  isVocab?: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function isArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

export default function PublicDictionaryPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [, navigate] = useLocation();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(value.trim());
    }, 300);
  }, []);

  const { data: results = [], isLoading } = useQuery<DictResult[]>({
    queryKey: ["/api/dictionary/public/search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];
      const res = await fetch(`/api/dictionary/public/search?q=${encodeURIComponent(debouncedQuery)}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: debouncedQuery.length >= 2,
  });

  const grouped = results.reduce<Record<string, DictResult[]>>((acc, r) => {
    const key = (r.normalized || r.word).toLowerCase();
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto px-3 md:px-6 py-6 md:py-10 space-y-6">
        <Link href="/library">
          <Button variant="ghost" size="sm" className="mb-1 gap-1.5 text-muted-foreground hover:text-foreground" data-testid="button-back-library">
            <ArrowLeft className="w-4 h-4" />
            Kutubxonaga qaytish
          </Button>
        </Link>
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-400/20 flex items-center justify-center">
            <Languages className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-public-dictionary-title">
            Smart Lug'at
          </h1>
          <p className="text-sm md:text-base text-muted-foreground max-w-lg mx-auto">
            Barcha darslar ichidan so'z qidiring — arabcha yoki o'zbekcha. Videodagi aniq joyini toping.
          </p>
        </div>

        <div className="relative max-w-2xl mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="So'z kiriting... (arabcha yoki o'zbekcha)"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 h-12 text-base bg-card border-border/50"
            dir="auto"
            autoFocus
            data-testid="input-public-dictionary-search"
          />
        </div>

        {!debouncedQuery && (
          <div className="text-center py-12 space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
              <Search className="w-8 h-8 text-primary/50" />
            </div>
            <p className="text-muted-foreground text-sm">
              Kamida 2 ta harf yozing — barcha e'lon qilingan darslardan qidiriladi
            </p>
          </div>
        )}

        {isLoading && debouncedQuery && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="bg-card/50 border-border/30">
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-64" />
                  <Skeleton className="h-4 w-48" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {debouncedQuery && !isLoading && results.length === 0 && (
          <div className="text-center py-12 space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground text-sm">
              "{debouncedQuery}" bo'yicha natija topilmadi
            </p>
          </div>
        )}

        {!isLoading && Object.entries(grouped).length > 0 && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground" data-testid="text-results-count">
              {results.length} ta natija topildi
            </p>
            {Object.entries(grouped).map(([key, items]) => (
              <Card key={key} className="bg-card/80 border-border/30 overflow-hidden hover:border-primary/20 transition-colors">
                <CardContent className="p-0">
                  <div className="p-4 border-b border-border/20 flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span
                          className="text-xl font-bold text-primary"
                          style={{ fontFamily: isArabic(items[0].word) ? "'Noto Naskh Arabic', 'Amiri', serif" : "inherit" }}
                          dir={isArabic(items[0].word) ? "rtl" : "ltr"}
                          data-testid={`text-dict-word-${key}`}
                        >
                          {items[0].word}
                        </span>
                        {items[0].translationUz && (
                          <span className="text-base text-foreground/80" data-testid={`text-dict-translation-${key}`}>
                            — {items[0].translationUz}
                          </span>
                        )}
                      </div>
                      {items[0].translationAr && items[0].translationAr !== items[0].word && (
                        <p className="text-sm text-muted-foreground" dir="rtl" style={{ fontFamily: "'Noto Naskh Arabic', 'Amiri', serif" }}>
                          {items[0].translationAr}
                        </p>
                      )}
                      {items[0].contextualMeaning && (
                        <p className="text-xs text-muted-foreground/70 italic">
                          {items[0].contextualMeaning}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {items.length} marta
                    </Badge>
                  </div>

                  <div className="divide-y divide-border/10">
                    {items.map((item, idx) => (
                      <div
                        key={`${item.lessonId}-${item.sentenceIndex}-${idx}`}
                        className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-muted/30 transition-colors group"
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          {item.sentence && (
                            <p
                              className="text-sm text-foreground/90 leading-relaxed"
                              dir={isArabic(item.sentence) ? "rtl" : "ltr"}
                              style={{ fontFamily: isArabic(item.sentence) ? "'Noto Naskh Arabic', 'Amiri', serif" : "inherit" }}
                              data-testid={`text-dict-sentence-${key}-${idx}`}
                            >
                              {item.sentence}
                            </p>
                          )}
                          {item.sentenceTranslation && (
                            <p className="text-xs text-muted-foreground" data-testid={`text-dict-sentence-tr-${key}-${idx}`}>
                              {item.sentenceTranslation}
                            </p>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px] h-5 gap-1">
                              <BookOpen className="w-3 h-3" />
                              {item.lessonTitle}
                            </Badge>
                            {item.startTime > 0 && (
                              <Badge variant="outline" className="text-[10px] h-5 gap-1">
                                <Clock className="w-3 h-3" />
                                {formatTime(item.startTime)}
                              </Badge>
                            )}
                            {item.isVocab && (
                              <Badge variant="outline" className="text-[10px] h-5 gap-1 border-violet-500/30 text-violet-400">
                                <Volume2 className="w-3 h-3" />
                                Lug'at
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 h-8 gap-1 text-primary opacity-60 group-hover:opacity-100 transition-opacity"
                          onClick={() => navigate(`/library/${item.lessonId}?t=${Math.floor(item.startTime)}`)}
                          data-testid={`button-dict-goto-${key}-${idx}`}
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline text-xs">Ko'rish</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
