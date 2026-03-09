import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import UserLayout from "@/components/layouts/user-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpen, Search, Trash2, Check, X, Filter,
  BookmarkCheck, ArrowRight, Volume2, Sparkles,
} from "lucide-react";
import type { SavedWord, Lesson } from "@shared/schema";

export default function SavedWordsPage() {
  const [search, setSearch] = useState("");
  const [filterLesson, setFilterLesson] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const { toast } = useToast();

  const { data: words = [], isLoading } = useQuery<SavedWord[]>({
    queryKey: ["/api/user/saved-words"],
  });

  const { data: lessons = [] } = useQuery<Lesson[]>({
    queryKey: ["/api/user/lessons"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/user/saved-words/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/saved-words"] });
      toast({ title: "O'chirildi", description: "So'z ro'yxatdan o'chirildi" });
    },
  });

  const toggleLearnedMutation = useMutation({
    mutationFn: async ({ id, isLearned }: { id: number; isLearned: boolean }) => {
      await apiRequest("PATCH", `/api/user/saved-words/${id}`, { isLearned });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/saved-words"] });
    },
  });

  const filteredWords = useMemo(() => {
    let result = [...words];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(w =>
        w.word.toLowerCase().includes(q) ||
        w.translationUz?.toLowerCase().includes(q) ||
        w.translationAr?.toLowerCase().includes(q)
      );
    }
    if (filterLesson !== "all") {
      result = result.filter(w => w.lessonId === parseInt(filterLesson));
    }
    if (filterStatus === "learned") {
      result = result.filter(w => w.isLearned);
    } else if (filterStatus === "new") {
      result = result.filter(w => !w.isLearned);
    }
    return result;
  }, [words, search, filterLesson, filterStatus]);

  const lessonOptions = useMemo(() => {
    const ids = new Set(words.map(w => w.lessonId));
    return lessons.filter(l => ids.has(l.id));
  }, [words, lessons]);

  const learnedCount = words.filter(w => w.isLearned).length;
  const newCount = words.filter(w => !w.isLearned).length;

  if (isLoading) {
    return (
      <UserLayout title="Mening so'zlarim" subtitle="Saqlangan so'zlar ro'yxati">
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout title="Mening so'zlarim" subtitle="Saqlangan so'zlar ro'yxati">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Card className="glass border-border/50" data-testid="card-total-words">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{words.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Jami so'zlar</p>
            </CardContent>
          </Card>
          <Card className="glass border-border/50" data-testid="card-new-words">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{newCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Yangi</p>
            </CardContent>
          </Card>
          <Card className="glass border-border/50" data-testid="card-learned-words">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-emerald-500">{learnedCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Yod olingan</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="So'z qidirish..."
              className="pl-9 glass border-border/50"
              data-testid="input-search-words"
            />
          </div>
          <Select value={filterLesson} onValueChange={setFilterLesson}>
            <SelectTrigger className="w-full sm:w-48 glass border-border/50" data-testid="select-filter-lesson">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Barcha darslar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha darslar</SelectItem>
              {lessonOptions.map(l => (
                <SelectItem key={l.id} value={String(l.id)}>{l.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-36 glass border-border/50" data-testid="select-filter-status">
              <SelectValue placeholder="Barchasi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barchasi</SelectItem>
              <SelectItem value="new">Yangi</SelectItem>
              <SelectItem value="learned">Yod olingan</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filteredWords.length === 0 ? (
          <Card className="glass border-border/50" data-testid="card-empty-words">
            <CardContent className="p-8">
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-cyan-500/10 flex items-center justify-center mb-4">
                  <BookOpen className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-1">
                  {words.length === 0 ? "Hali so'z saqlanmagan" : "Natija topilmadi"}
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {words.length === 0
                    ? "Dars videosidagi subtitrlarda so'zlarni bosib, ularni bu yerga saqlashingiz mumkin."
                    : "Qidiruv yoki filterni o'zgartiring."
                  }
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredWords.map((word) => {
              const lesson = lessons.find(l => l.id === word.lessonId);
              return (
                <Card
                  key={word.id}
                  className={`glass border-border/50 transition-all ${
                    word.isLearned ? "opacity-70" : ""
                  }`}
                  data-testid={`card-word-${word.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-base font-bold" data-testid={`text-word-${word.id}`}>
                            {word.word}
                          </h4>
                          {word.partOfSpeech && (
                            <Badge variant="secondary" className="text-[10px]">{word.partOfSpeech}</Badge>
                          )}
                          {word.isLearned && (
                            <Badge className="text-[10px] bg-emerald-500/20 text-emerald-500 border-emerald-500/30">
                              <Check className="w-2.5 h-2.5 mr-0.5" />
                              Yod olindi
                            </Badge>
                          )}
                        </div>

                        {word.translationUz && (
                          <p className="text-sm text-foreground/90 mt-1" data-testid={`text-translation-uz-${word.id}`}>
                            <span className="text-xs text-muted-foreground mr-1">UZ:</span>
                            {word.translationUz}
                          </p>
                        )}
                        {word.translationAr && (
                          <p className="text-sm text-foreground/90 mt-0.5" dir="rtl" data-testid={`text-translation-ar-${word.id}`}>
                            <span className="text-xs text-muted-foreground ml-1" dir="ltr">AR:</span>
                            {word.translationAr}
                          </p>
                        )}
                        {word.contextualMeaning && (
                          <p className="text-xs text-muted-foreground mt-1 italic" data-testid={`text-meaning-${word.id}`}>
                            {word.contextualMeaning}
                          </p>
                        )}
                        {word.sourceSentence && (
                          <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-1">
                            "{word.sourceSentence}"
                          </p>
                        )}

                        {word.phraseText && (
                          <div className="mt-2 rounded-md bg-amber-500/5 border border-amber-500/20 px-2.5 py-1.5">
                            <p className="text-xs font-medium text-amber-400/80">
                              <Sparkles className="w-3 h-3 inline mr-1" />
                              {word.phraseText}
                            </p>
                          </div>
                        )}

                        {lesson && (
                          <Link href={`/lessons/${lesson.id}`}>
                            <p className="text-[11px] text-primary/70 hover:text-primary mt-2 flex items-center gap-1 cursor-pointer" data-testid={`link-lesson-${word.id}`}>
                              <BookOpen className="w-3 h-3" />
                              {lesson.title}
                              <ArrowRight className="w-3 h-3" />
                            </p>
                          </Link>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${word.isLearned ? "text-emerald-500" : "text-muted-foreground hover:text-emerald-500"}`}
                          onClick={() => toggleLearnedMutation.mutate({ id: word.id, isLearned: !word.isLearned })}
                          disabled={toggleLearnedMutation.isPending}
                          title={word.isLearned ? "Yangi deb belgilash" : "Yod oldim"}
                          data-testid={`button-toggle-learned-${word.id}`}
                        >
                          <BookmarkCheck className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteMutation.mutate(word.id)}
                          disabled={deleteMutation.isPending}
                          title="O'chirish"
                          data-testid={`button-delete-word-${word.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </UserLayout>
  );
}
