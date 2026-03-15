import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import UserLayout from "@/components/layouts/user-layout";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, BookOpen, Play, Clock, ArrowRight, Languages } from "lucide-react";

interface DictResult {
  word: string;
  normalized: string;
  translationUz: string;
  translationAr: string;
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

export default function SmartDictionaryPage() {
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
    queryKey: ["/api/user/dictionary/search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];
      const res = await fetch(`/api/user/dictionary/search?q=${encodeURIComponent(debouncedQuery)}`);
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
    <UserLayout title="Smart Lug'at">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-dictionary-title">
            <Languages className="w-7 h-7 text-primary" />
            Smart Lug'at
          </h1>
          <p className="text-sm text-muted-foreground">
            Barcha darslaringiz ichidan so'z qidiring — inglizcha, arabcha yoki o'zbekcha
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="So'z kiriting... (inglizcha, arabcha yoki o'zbekcha)"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 h-12 text-base bg-card border-border/50"
            dir="auto"
            data-testid="input-dictionary-search"
          />
        </div>

        {!debouncedQuery && (
          <div className="text-center py-16 space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
              <Search className="w-8 h-8 text-primary/50" />
            </div>
            <p className="text-muted-foreground text-sm">
              Arabcha yoki o'zbekcha so'z yozing — barcha darslaringizdan topiladi
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
          <div className="text-center py-16 space-y-3">
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
            <p className="text-xs text-muted-foreground">
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
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 h-8 gap-1 text-primary opacity-60 group-hover:opacity-100 transition-opacity"
                          onClick={() => navigate(`/lessons/${item.lessonId}?t=${Math.floor(item.startTime)}`)}
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
    </UserLayout>
  );
}
