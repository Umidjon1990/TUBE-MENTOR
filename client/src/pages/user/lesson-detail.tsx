import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import UserLayout from "@/components/layouts/user-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  BookOpen, Languages, Brain, FileText, Layers, StickyNote,
  Bookmark, BookmarkCheck, Star, ChevronLeft, ChevronRight,
  Check, X, ArrowLeft, RotateCcw, Plus, Trash2, Pin, PinOff,
  Edit2, Save, Lightbulb, Volume2, AlertCircle, Sparkles,
  ChevronDown, ChevronUp, GripVertical, Eye, EyeOff
} from "lucide-react";
import type { Lesson, Flashcard, Note, Bookmark as BookmarkType } from "@shared/schema";

interface SentenceAnalysis {
  sentence: string;
  translation: string;
  grammarNotes: string;
  keyWords: string[];
}

interface VocabItem {
  word: string;
  translation: string;
  partOfSpeech: string;
  example: string;
  difficulty: string;
}

interface PhraseItem {
  phrase: string;
  translation: string;
  context: string;
}

interface QuizItem {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  type?: "multiple_choice" | "fill_blank" | "true_false";
}

interface FlashcardData {
  front: string;
  back: string;
  type: string;
}

export default function LessonDetailPage() {
  const [, params] = useRoute("/lessons/:id");
  const lessonId = params?.id;
  const { toast } = useToast();

  const { data: lesson, isLoading } = useQuery<Lesson>({
    queryKey: ["/api/user/lessons", lessonId],
    enabled: !!lessonId,
  });

  const { data: flashcards = [] } = useQuery<Flashcard[]>({
    queryKey: ["/api/user/lessons", lessonId, "flashcards"],
    enabled: !!lessonId,
  });

  const { data: userNotes = [] } = useQuery<Note[]>({
    queryKey: ["/api/user/lessons", lessonId, "notes"],
    enabled: !!lessonId,
  });

  const { data: userBookmarks = [] } = useQuery<BookmarkType[]>({
    queryKey: ["/api/user/lessons", lessonId, "bookmarks"],
    enabled: !!lessonId,
  });

  if (isLoading) {
    return (
      <UserLayout>
        <div className="space-y-4 p-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-6 w-96" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </UserLayout>
    );
  }

  if (!lesson) {
    return (
      <UserLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <AlertCircle className="w-16 h-16 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Dars topilmadi</h2>
          <Link href="/lessons">
            <Button variant="outline" data-testid="link-back-lessons">
              <ArrowLeft className="w-4 h-4 mr-2" /> Darslarga qaytish
            </Button>
          </Link>
        </div>
      </UserLayout>
    );
  }

  const sentences: SentenceAnalysis[] = lesson.sentenceAnalysisJson as SentenceAnalysis[] || [];
  const vocabulary: VocabItem[] = lesson.vocabularyJson as VocabItem[] || [];
  const phrases: PhraseItem[] = lesson.phrasesJson as PhraseItem[] || [];
  const quizzes: QuizItem[] = lesson.quizzesJson as QuizItem[] || [];
  const presetFlashcards: FlashcardData[] = lesson.flashcardsJson as FlashcardData[] || [];

  return (
    <UserLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/lessons">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-1" /> Ortga
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-bold truncate" data-testid="text-lesson-title">
              {lesson.title}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Badge variant="outline" className="text-xs">{lesson.level}</Badge>
              <span>•</span>
              <span>{vocabulary.length} so'z</span>
              <span>•</span>
              <span>{quizzes.length} test</span>
              <span>•</span>
              <span>{sentences.length} gap</span>
            </div>
          </div>
        </div>

        {lesson.thumbnailUrl && (
          <div className="relative rounded-lg overflow-hidden aspect-video max-w-xl">
            <img src={lesson.thumbnailUrl} alt={lesson.title} className="w-full h-full object-cover" />
            {lesson.youtubeUrl && (
              <a
                href={lesson.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/50 transition-colors"
                data-testid="link-youtube-video"
              >
                <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center">
                  <div className="w-0 h-0 border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent border-l-[18px] border-l-white ml-1" />
                </div>
              </a>
            )}
          </div>
        )}

        <Tabs defaultValue="matn" className="w-full">
          <TabsList className="w-full grid grid-cols-6 glass border border-border/50 h-auto p-1" data-testid="tabs-lesson">
            <TabsTrigger value="matn" className="text-xs md:text-sm py-2 gap-1" data-testid="tab-matn">
              <BookOpen className="w-3.5 h-3.5 hidden sm:block" /> Matn
            </TabsTrigger>
            <TabsTrigger value="lugat" className="text-xs md:text-sm py-2 gap-1" data-testid="tab-lugat">
              <Languages className="w-3.5 h-3.5 hidden sm:block" /> Lug'at
            </TabsTrigger>
            <TabsTrigger value="test" className="text-xs md:text-sm py-2 gap-1" data-testid="tab-test">
              <Brain className="w-3.5 h-3.5 hidden sm:block" /> Test
            </TabsTrigger>
            <TabsTrigger value="xulosa" className="text-xs md:text-sm py-2 gap-1" data-testid="tab-xulosa">
              <FileText className="w-3.5 h-3.5 hidden sm:block" /> Xulosa
            </TabsTrigger>
            <TabsTrigger value="kartochkalar" className="text-xs md:text-sm py-2 gap-1" data-testid="tab-kartochkalar">
              <Layers className="w-3.5 h-3.5 hidden sm:block" /> Kartochkalar
            </TabsTrigger>
            <TabsTrigger value="eslatmalar" className="text-xs md:text-sm py-2 gap-1" data-testid="tab-eslatmalar">
              <StickyNote className="w-3.5 h-3.5 hidden sm:block" /> Eslatmalar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="matn" className="mt-4">
            <TranscriptTab
              sentences={sentences}
              phrases={phrases}
              lessonId={parseInt(lessonId!)}
              bookmarks={userBookmarks}
              flashcards={flashcards}
            />
          </TabsContent>

          <TabsContent value="lugat" className="mt-4">
            <VocabularyTab
              vocabulary={vocabulary}
              lessonId={parseInt(lessonId!)}
              flashcards={flashcards}
            />
          </TabsContent>

          <TabsContent value="test" className="mt-4">
            <QuizTab
              quizzes={quizzes}
              lessonId={parseInt(lessonId!)}
            />
          </TabsContent>

          <TabsContent value="xulosa" className="mt-4">
            <SummaryTab lesson={lesson} sentences={sentences} vocabulary={vocabulary} />
          </TabsContent>

          <TabsContent value="kartochkalar" className="mt-4">
            <FlashcardsTab
              presetCards={presetFlashcards}
              savedCards={flashcards}
              lessonId={parseInt(lessonId!)}
            />
          </TabsContent>

          <TabsContent value="eslatmalar" className="mt-4">
            <NotesTab
              notes={userNotes}
              bookmarks={userBookmarks}
              lessonId={parseInt(lessonId!)}
              sentences={sentences}
            />
          </TabsContent>
        </Tabs>
      </div>
    </UserLayout>
  );
}

// ─── TRANSCRIPT TAB ───
function TranscriptTab({
  sentences, phrases, lessonId, bookmarks, flashcards
}: {
  sentences: SentenceAnalysis[];
  phrases: PhraseItem[];
  lessonId: number;
  bookmarks: BookmarkType[];
  flashcards: Flashcard[];
}) {
  const { toast } = useToast();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [difficultSet, setDifficultSet] = useState<Set<number>>(new Set());

  const bookmarkMutation = useMutation({
    mutationFn: async (data: { sentenceIndex: number; label: string }) => {
      const res = await apiRequest("POST", `/api/user/lessons/${lessonId}/bookmarks`, {
        type: "sentence",
        sentenceIndex: data.sentenceIndex,
        label: data.label,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/lessons", String(lessonId), "bookmarks"] });
      toast({ title: "Xatcho'p qo'shildi" });
    },
  });

  const removeBookmarkMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/user/bookmarks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/lessons", String(lessonId), "bookmarks"] });
    },
  });

  const flashcardMutation = useMutation({
    mutationFn: async (data: { frontText: string; backText: string; type: string }) => {
      const res = await apiRequest("POST", `/api/user/lessons/${lessonId}/flashcards`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/lessons", String(lessonId), "flashcards"] });
      toast({ title: "Kartochkaga saqlandi" });
    },
  });

  const bookmarkedIndexes = useMemo(() => {
    const map = new Map<number, number>();
    bookmarks.forEach(b => {
      if (b.sentenceIndex !== null) map.set(b.sentenceIndex, b.id);
    });
    return map;
  }, [bookmarks]);

  const savedFronts = useMemo(() => new Set(flashcards.map(f => f.frontText)), [flashcards]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" /> Matn tahlili
        </h3>
        <Badge variant="secondary">{sentences.length} gap</Badge>
      </div>

      {phrases.length > 0 && (
        <Card className="glass border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-yellow-400" /> Muhim iboralar
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="flex flex-wrap gap-2">
              {phrases.map((p, i) => (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="cursor-help hover:bg-primary/10 transition-colors py-1.5"
                      data-testid={`badge-phrase-${i}`}
                    >
                      {p.phrase.length > 40 ? p.phrase.slice(0, 40) + "..." : p.phrase}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="font-medium">{p.translation}</p>
                    <p className="text-xs text-muted-foreground mt-1">{p.context}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {sentences.map((s, idx) => {
          const isExpanded = expandedIdx === idx;
          const isDifficult = difficultSet.has(idx);
          const isBookmarked = bookmarkedIndexes.has(idx);
          const isSaved = savedFronts.has(s.sentence);

          return (
            <Card
              key={idx}
              className={`glass border-border/50 transition-all ${isDifficult ? "border-yellow-500/50 bg-yellow-500/5" : ""} ${isBookmarked ? "border-primary/40" : ""}`}
              data-testid={`card-sentence-${idx}`}
            >
              <CardContent className="p-3 md:p-4">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground font-mono mt-1 shrink-0 w-6 text-right">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm md:text-base font-medium leading-relaxed">{s.sentence}</p>
                    <p className="text-xs md:text-sm text-primary/80 mt-1">{s.translation}</p>

                    {isExpanded && (
                      <div className="mt-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
                        <Separator />
                        <div className="grid gap-2">
                          <div className="flex items-start gap-2">
                            <Lightbulb className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Grammatika</p>
                              <p className="text-sm">{s.grammarNotes}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Languages className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Kalit so'zlar</p>
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {s.keyWords.map((w, wi) => (
                                  <Badge key={wi} variant="secondary" className="text-xs">{w}</Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                          data-testid={`button-expand-${idx}`}
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{isExpanded ? "Yopish" : "Batafsil"}</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${isBookmarked ? "text-primary" : ""}`}
                          onClick={() => {
                            if (isBookmarked) {
                              removeBookmarkMutation.mutate(bookmarkedIndexes.get(idx)!);
                            } else {
                              bookmarkMutation.mutate({ sentenceIndex: idx, label: s.sentence.slice(0, 50) });
                            }
                          }}
                          data-testid={`button-bookmark-${idx}`}
                        >
                          {isBookmarked ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{isBookmarked ? "Xatcho'pni olib tashlash" : "Xatcho'p qo'shish"}</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${isDifficult ? "text-yellow-400" : ""}`}
                          onClick={() => {
                            const next = new Set(difficultSet);
                            isDifficult ? next.delete(idx) : next.add(idx);
                            setDifficultSet(next);
                          }}
                          data-testid={`button-difficult-${idx}`}
                        >
                          <Star className={`w-3.5 h-3.5 ${isDifficult ? "fill-yellow-400" : ""}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{isDifficult ? "Oddiy deb belgilash" : "Qiyin deb belgilash"}</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${isSaved ? "text-green-400" : ""}`}
                          disabled={isSaved || flashcardMutation.isPending}
                          onClick={() => flashcardMutation.mutate({
                            frontText: s.sentence,
                            backText: s.translation,
                            type: "sentence",
                          })}
                          data-testid={`button-save-card-${idx}`}
                        >
                          <Layers className={`w-3.5 h-3.5 ${isSaved ? "fill-green-400/30" : ""}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{isSaved ? "Kartochkada mavjud" : "Kartochkaga saqlash"}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── VOCABULARY TAB ───
function VocabularyTab({
  vocabulary, lessonId, flashcards
}: {
  vocabulary: VocabItem[];
  lessonId: number;
  flashcards: Flashcard[];
}) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | "easy" | "medium" | "hard">("all");
  const [search, setSearch] = useState("");

  const savedWords = useMemo(() => new Set(flashcards.map(f => f.frontText)), [flashcards]);

  const flashcardMutation = useMutation({
    mutationFn: async (data: { frontText: string; backText: string }) => {
      const res = await apiRequest("POST", `/api/user/lessons/${lessonId}/flashcards`, {
        ...data,
        type: "vocabulary",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/lessons", String(lessonId), "flashcards"] });
      toast({ title: "Kartochkaga saqlandi" });
    },
  });

  const filtered = vocabulary.filter(v => {
    if (filter !== "all" && v.difficulty !== filter) return false;
    if (search && !v.word.toLowerCase().includes(search.toLowerCase()) && !v.translation.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const diffColors: Record<string, string> = {
    easy: "bg-green-500/10 text-green-400 border-green-500/30",
    medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    hard: "bg-red-500/10 text-red-400 border-red-500/30",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Languages className="w-5 h-5 text-primary" /> Lug'at
        </h3>
        <Badge variant="secondary">{vocabulary.length} so'z</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="So'z izlash..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-9 bg-background/50"
          data-testid="input-vocab-search"
        />
        <div className="flex gap-1">
          {(["all", "easy", "medium", "hard"] as const).map(level => (
            <Button
              key={level}
              variant={filter === level ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(level)}
              className="h-9 text-xs"
              data-testid={`button-filter-${level}`}
            >
              {level === "all" ? "Barchasi" : level === "easy" ? "Oson" : level === "medium" ? "O'rta" : "Qiyin"}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        {filtered.map((v, idx) => {
          const isSaved = savedWords.has(v.word);
          return (
            <Card key={idx} className="glass border-border/50 hover:border-primary/20 transition-colors" data-testid={`card-vocab-${idx}`}>
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-base">{v.word}</span>
                      <Badge variant="outline" className={`text-[10px] ${diffColors[v.difficulty] || ""}`}>
                        {v.difficulty}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">{v.partOfSpeech}</Badge>
                    </div>
                    <p className="text-sm text-primary/80 mt-1">{v.translation}</p>
                    <p className="text-xs text-muted-foreground mt-1 italic">"{v.example}"</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 shrink-0 ${isSaved ? "text-green-400" : ""}`}
                    disabled={isSaved || flashcardMutation.isPending}
                    onClick={() => flashcardMutation.mutate({
                      frontText: v.word,
                      backText: `${v.translation} (${v.partOfSpeech})`,
                    })}
                    data-testid={`button-save-vocab-${idx}`}
                  >
                    <Layers className={`w-4 h-4 ${isSaved ? "fill-green-400/30" : ""}`} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Languages className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>Hech qanday so'z topilmadi</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── QUIZ TAB ───
function QuizTab({ quizzes, lessonId }: { quizzes: QuizItem[]; lessonId: number }) {
  const { toast } = useToast();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Map<number, number>>(new Map());
  const [showResult, setShowResult] = useState<Map<number, boolean>>(new Map());
  const [quizComplete, setQuizComplete] = useState(false);
  const [fillAnswer, setFillAnswer] = useState("");
  const [shortAnswer, setShortAnswer] = useState("");

  const progressMutation = useMutation({
    mutationFn: async (data: { completedQuizzes: number; accuracy: number }) => {
      await apiRequest("POST", `/api/user/lessons/${lessonId}/progress`, data);
    },
  });

  if (quizzes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Brain className="w-16 h-16 mx-auto mb-3 opacity-30" />
        <p className="text-lg">Bu darsda testlar mavjud emas</p>
      </div>
    );
  }

  const q = quizzes[currentIdx];
  const hasAnswered = showResult.has(currentIdx);
  const selectedOpt = answers.get(currentIdx);
  const isCorrect = selectedOpt === q.correctIndex;

  const totalAnswered = showResult.size;
  const correctCount = Array.from(showResult.entries()).filter(([idx]) => answers.get(idx) === quizzes[idx].correctIndex).length;

  const handleAnswer = (optIndex: number) => {
    if (hasAnswered) return;
    setAnswers(prev => new Map(prev).set(currentIdx, optIndex));
    setShowResult(prev => new Map(prev).set(currentIdx, true));
  };

  const handleFillCheck = () => {
    if (hasAnswered || !fillAnswer.trim()) return;
    const correct = q.options[q.correctIndex].toLowerCase().trim();
    const userAns = fillAnswer.toLowerCase().trim();
    const matchIdx = userAns === correct ? q.correctIndex : -1;
    setAnswers(prev => new Map(prev).set(currentIdx, matchIdx));
    setShowResult(prev => new Map(prev).set(currentIdx, true));
  };

  const handleNext = () => {
    if (currentIdx < quizzes.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setFillAnswer("");
      setShortAnswer("");
    } else if (!quizComplete) {
      setQuizComplete(true);
      const accuracy = quizzes.length > 0 ? Math.round((correctCount / quizzes.length) * 100) : 0;
      progressMutation.mutate({ completedQuizzes: quizzes.length, accuracy });
    }
  };

  const handleRestart = () => {
    setCurrentIdx(0);
    setAnswers(new Map());
    setShowResult(new Map());
    setQuizComplete(false);
    setFillAnswer("");
    setShortAnswer("");
  };

  const quizType: "multiple_choice" | "fill_blank" | "true_false" = (() => {
    if (q.type) return q.type;
    if (q.options.length === 2 && (q.options.includes("To'g'ri") || q.options.includes("True"))) return "true_false";
    return "multiple_choice";
  })();

  if (quizComplete) {
    const accuracy = quizzes.length > 0 ? Math.round((correctCount / quizzes.length) * 100) : 0;
    return (
      <div className="space-y-4">
        <Card className="glass border-border/50">
          <CardContent className="p-6 text-center space-y-4">
            <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${accuracy >= 70 ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
              <span className="text-2xl font-bold">{accuracy}%</span>
            </div>
            <h3 className="text-xl font-bold">Test yakunlandi!</h3>
            <p className="text-muted-foreground">
              {quizzes.length} ta savoldan {correctCount} tasi to'g'ri javob berildi
            </p>
            <Progress value={accuracy} className="max-w-xs mx-auto" />
            <div className="flex justify-center gap-3 pt-2">
              <Button onClick={handleRestart} variant="outline" data-testid="button-quiz-restart">
                <RotateCcw className="w-4 h-4 mr-2" /> Qaytadan
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-2">
          {quizzes.map((quiz, idx) => {
            const userAns = answers.get(idx);
            const correct = userAns === quiz.correctIndex;
            return (
              <Card key={idx} className={`glass border-border/50 ${correct ? "border-green-500/30" : "border-red-500/30"}`} data-testid={`card-quiz-review-${idx}`}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    {correct ? <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" /> : <X className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{quiz.question}</p>
                      {!correct && (
                        <p className="text-xs text-green-400 mt-1">To'g'ri javob: {quiz.options[quiz.correctIndex]}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" /> Test
        </h3>
        <Badge variant="secondary">{currentIdx + 1} / {quizzes.length}</Badge>
      </div>

      <Progress value={((currentIdx + (hasAnswered ? 1 : 0)) / quizzes.length) * 100} className="h-2" />

      <Card className="glass border-border/50" data-testid={`card-quiz-${currentIdx}`}>
        <CardContent className="p-4 md:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-primary">{currentIdx + 1}</span>
            </div>
            <p className="text-base md:text-lg font-medium pt-1">{q.question}</p>
          </div>

          {quizType === "fill_blank" ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={fillAnswer}
                  onChange={(e) => setFillAnswer(e.target.value)}
                  placeholder="Javobingizni yozing..."
                  disabled={hasAnswered}
                  className="bg-background/50"
                  data-testid="input-fill-answer"
                  onKeyDown={(e) => e.key === "Enter" && handleFillCheck()}
                />
                {!hasAnswered && (
                  <Button onClick={handleFillCheck} disabled={!fillAnswer.trim()} data-testid="button-fill-check">
                    Tekshirish
                  </Button>
                )}
              </div>
              {hasAnswered && (
                <div className={`p-3 rounded-lg ${isCorrect ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"}`}>
                  <div className="flex items-center gap-2">
                    {isCorrect ? <Check className="w-4 h-4 text-green-400" /> : <X className="w-4 h-4 text-red-400" />}
                    <span className="text-sm font-medium">{isCorrect ? "To'g'ri!" : "Noto'g'ri"}</span>
                  </div>
                  {!isCorrect && <p className="text-sm text-green-400 mt-1">To'g'ri javob: {q.options[q.correctIndex]}</p>}
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-2">
              {q.options.map((opt, oi) => {
                let cls = "glass border-border/50 hover:border-primary/40 cursor-pointer transition-all";
                if (hasAnswered) {
                  if (oi === q.correctIndex) cls = "bg-green-500/10 border border-green-500/40";
                  else if (oi === selectedOpt && oi !== q.correctIndex) cls = "bg-red-500/10 border border-red-500/40";
                  else cls = "glass border-border/30 opacity-60";
                }
                return (
                  <button
                    key={oi}
                    onClick={() => handleAnswer(oi)}
                    disabled={hasAnswered}
                    className={`w-full text-left p-3 rounded-lg flex items-center gap-3 ${cls}`}
                    data-testid={`button-option-${oi}`}
                  >
                    <span className="w-7 h-7 rounded-full border border-border/50 flex items-center justify-center text-xs font-medium shrink-0">
                      {String.fromCharCode(65 + oi)}
                    </span>
                    <span className="text-sm flex-1">{opt}</span>
                    {hasAnswered && oi === q.correctIndex && <Check className="w-4 h-4 text-green-400 shrink-0" />}
                    {hasAnswered && oi === selectedOpt && oi !== q.correctIndex && <X className="w-4 h-4 text-red-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {hasAnswered && (
            <div className="bg-muted/30 rounded-lg p-3 border border-border/30 animate-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Tushuntirish</p>
                  <p className="text-sm">{q.explanation}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setCurrentIdx(Math.max(0, currentIdx - 1)); setFillAnswer(""); }}
          disabled={currentIdx === 0}
          data-testid="button-quiz-prev"
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Oldingi
        </Button>
        <span className="text-xs text-muted-foreground">
          {correctCount} / {totalAnswered} to'g'ri
        </span>
        <Button
          size="sm"
          onClick={handleNext}
          disabled={!hasAnswered}
          data-testid="button-quiz-next"
        >
          {currentIdx === quizzes.length - 1 ? "Yakunlash" : "Keyingi"} <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ─── SUMMARY TAB ───
function SummaryTab({ lesson, sentences, vocabulary }: {
  lesson: Lesson;
  sentences: SentenceAnalysis[];
  vocabulary: VocabItem[];
}) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg flex items-center gap-2">
        <FileText className="w-5 h-5 text-primary" /> Xulosa
      </h3>

      {lesson.summaryShort && (
        <Card className="glass border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Qisqa xulosa</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed" data-testid="text-summary-short">{lesson.summaryShort}</p>
          </CardContent>
        </Card>
      )}

      {lesson.summaryDetailed && (
        <Card className="glass border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Batafsil xulosa</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-summary-detailed">{lesson.summaryDetailed}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        <Card className="glass border-border/50">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-primary">{sentences.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Gaplar soni</p>
          </CardContent>
        </Card>
        <Card className="glass border-border/50">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-primary">{vocabulary.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Lug'at so'zlari</p>
          </CardContent>
        </Card>
        <Card className="glass border-border/50">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-primary">{lesson.level}</p>
            <p className="text-xs text-muted-foreground mt-1">Daraja</p>
          </CardContent>
        </Card>
      </div>

      {lesson.aiMetaJson && (
        <Card className="glass border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> AI ma'lumotlari
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(lesson.aiMetaJson as Record<string, unknown>).map(([key, val]) => (
                <div key={key} className="flex justify-between p-2 rounded bg-muted/20">
                  <span className="text-muted-foreground">{key}</span>
                  <span className="font-medium">{String(val)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── FLASHCARDS TAB ───
function FlashcardsTab({
  presetCards, savedCards, lessonId
}: {
  presetCards: FlashcardData[];
  savedCards: Flashcard[];
  lessonId: number;
}) {
  const { toast } = useToast();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState<"preset" | "saved">("preset");
  const [knownSet, setKnownSet] = useState<Set<number>>(new Set());

  const cards = mode === "preset" ? presetCards : savedCards.map(s => ({ front: s.frontText, back: s.backText, type: s.type }));
  const card = cards[currentIdx];

  const saveMutation = useMutation({
    mutationFn: async (data: { frontText: string; backText: string; type: string }) => {
      const res = await apiRequest("POST", `/api/user/lessons/${lessonId}/flashcards`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/lessons", String(lessonId), "flashcards"] });
      toast({ title: "Saqlandi" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/user/flashcards/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/lessons", String(lessonId), "flashcards"] });
      toast({ title: "O'chirildi" });
    },
  });

  const updateConfidence = useMutation({
    mutationFn: async ({ id, level }: { id: number; level: number }) => {
      const res = await apiRequest("PATCH", `/api/user/flashcards/${id}`, { confidenceLevel: level });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/lessons", String(lessonId), "flashcards"] });
    },
  });

  const handleNext = () => {
    setFlipped(false);
    setCurrentIdx((currentIdx + 1) % cards.length);
  };
  const handlePrev = () => {
    setFlipped(false);
    setCurrentIdx((currentIdx - 1 + cards.length) % cards.length);
  };

  const savedFronts = useMemo(() => new Set(savedCards.map(c => c.frontText)), [savedCards]);

  if (cards.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button variant={mode === "preset" ? "default" : "outline"} size="sm" onClick={() => { setMode("preset"); setCurrentIdx(0); setFlipped(false); }} data-testid="button-mode-preset">
            Tayyor ({presetCards.length})
          </Button>
          <Button variant={mode === "saved" ? "default" : "outline"} size="sm" onClick={() => { setMode("saved"); setCurrentIdx(0); setFlipped(false); }} data-testid="button-mode-saved">
            Saqlangan ({savedCards.length})
          </Button>
        </div>
        <div className="text-center py-12 text-muted-foreground">
          <Layers className="w-16 h-16 mx-auto mb-3 opacity-30" />
          <p className="text-lg">Kartochkalar mavjud emas</p>
        </div>
      </div>
    );
  }

  const isSaved = savedFronts.has(card.front);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" /> Kartochkalar
        </h3>
        <div className="flex gap-2">
          <Button variant={mode === "preset" ? "default" : "outline"} size="sm" onClick={() => { setMode("preset"); setCurrentIdx(0); setFlipped(false); }} data-testid="button-mode-preset">
            Tayyor ({presetCards.length})
          </Button>
          <Button variant={mode === "saved" ? "default" : "outline"} size="sm" onClick={() => { setMode("saved"); setCurrentIdx(0); setFlipped(false); }} data-testid="button-mode-saved">
            Saqlangan ({savedCards.length})
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-center">
        <div className="w-full max-w-md">
          <div
            className="relative h-56 cursor-pointer perspective-1000"
            onClick={() => setFlipped(!flipped)}
            data-testid="card-flashcard"
          >
            <div className={`absolute inset-0 transition-transform duration-500 preserve-3d ${flipped ? "rotate-y-180" : ""}`}>
              <Card className="absolute inset-0 glass border-border/50 backface-hidden">
                <CardContent className="flex flex-col items-center justify-center h-full p-6 text-center">
                  <Badge variant="outline" className="mb-3 text-[10px]">{card.type}</Badge>
                  <p className="text-lg md:text-xl font-bold">{card.front}</p>
                  <p className="text-xs text-muted-foreground mt-3">Tarjimani ko'rish uchun bosing</p>
                </CardContent>
              </Card>
              <Card className="absolute inset-0 glass border-primary/30 backface-hidden rotate-y-180">
                <CardContent className="flex flex-col items-center justify-center h-full p-6 text-center">
                  <p className="text-lg md:text-xl font-medium text-primary">{card.back}</p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <Button variant="outline" size="sm" onClick={handlePrev} data-testid="button-card-prev">
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{currentIdx + 1} / {cards.length}</span>

              {mode === "preset" && !isSaved && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => saveMutation.mutate({ frontText: card.front, backText: card.back, type: card.type })}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-flashcard"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Saqlash
                </Button>
              )}

              {mode === "saved" && (
                <>
                  <Button
                    variant={knownSet.has(currentIdx) ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      const next = new Set(knownSet);
                      knownSet.has(currentIdx) ? next.delete(currentIdx) : next.add(currentIdx);
                      setKnownSet(next);
                      const sc = savedCards[currentIdx];
                      if (sc) updateConfidence.mutate({ id: sc.id, level: next.has(currentIdx) ? 5 : 0 });
                    }}
                    data-testid="button-mark-known"
                  >
                    {knownSet.has(currentIdx) ? <Eye className="w-3.5 h-3.5 mr-1" /> : <EyeOff className="w-3.5 h-3.5 mr-1" />}
                    {knownSet.has(currentIdx) ? "Bilaman" : "Bilmayman"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-400"
                    onClick={() => {
                      const sc = savedCards[currentIdx];
                      if (sc) {
                        deleteMutation.mutate(sc.id);
                        if (currentIdx >= cards.length - 1) setCurrentIdx(Math.max(0, currentIdx - 1));
                      }
                    }}
                    data-testid="button-delete-flashcard"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
            </div>

            <Button variant="outline" size="sm" onClick={handleNext} data-testid="button-card-next">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Progress value={((currentIdx + 1) / cards.length) * 100} className="mt-3 h-1.5" />
        </div>
      </div>

      {mode === "saved" && savedCards.length > 0 && (
        <div className="grid gap-2 mt-4">
          <h4 className="text-sm font-medium text-muted-foreground">Barcha saqlangan kartochkalar</h4>
          {savedCards.map((sc, idx) => (
            <div
              key={sc.id}
              className={`flex items-center justify-between p-2 rounded-lg glass border-border/30 text-sm ${idx === currentIdx ? "border-primary/40" : ""}`}
              data-testid={`row-flashcard-${sc.id}`}
            >
              <span className="truncate flex-1">{sc.frontText}</span>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="secondary" className="text-[10px]">
                  {sc.confidenceLevel >= 5 ? "Bilaman" : "O'rganish"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => { setCurrentIdx(idx); setFlipped(false); }}
                >
                  <Eye className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── NOTES TAB ───
function NotesTab({
  notes, bookmarks, lessonId, sentences
}: {
  notes: Note[];
  bookmarks: BookmarkType[];
  lessonId: number;
  sentences: SentenceAnalysis[];
}) {
  const { toast } = useToast();
  const [newNote, setNewNote] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const createMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/user/lessons/${lessonId}/notes`, { content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/lessons", String(lessonId), "notes"] });
      setNewNote("");
      toast({ title: "Eslatma qo'shildi" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Note> }) => {
      const res = await apiRequest("PATCH", `/api/user/notes/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/lessons", String(lessonId), "notes"] });
      setEditingId(null);
      toast({ title: "Saqlandi" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/user/notes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/lessons", String(lessonId), "notes"] });
      toast({ title: "O'chirildi" });
    },
  });

  const removeBookmarkMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/user/bookmarks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/lessons", String(lessonId), "bookmarks"] });
    },
  });

  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [notes]);

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg flex items-center gap-2">
        <StickyNote className="w-5 h-5 text-primary" /> Eslatmalar va Xatcho'plar
      </h3>

      <Card className="glass border-border/50">
        <CardContent className="p-3 space-y-2">
          <Textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Yangi eslatma yozing..."
            className="bg-background/50 min-h-[80px] resize-none"
            data-testid="textarea-new-note"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => createMutation.mutate(newNote)}
              disabled={!newNote.trim() || createMutation.isPending}
              data-testid="button-create-note"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Qo'shish
            </Button>
          </div>
        </CardContent>
      </Card>

      {sortedNotes.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Eslatmalar ({notes.length})
          </h4>
          {sortedNotes.map(note => (
            <Card key={note.id} className={`glass border-border/50 ${note.isPinned ? "border-yellow-500/30" : ""}`} data-testid={`card-note-${note.id}`}>
              <CardContent className="p-3">
                {editingId === note.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="bg-background/50 min-h-[60px] resize-none"
                      data-testid={`textarea-edit-${note.id}`}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} data-testid="button-cancel-edit">
                        Bekor
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => updateMutation.mutate({ id: note.id, data: { content: editContent } })}
                        disabled={updateMutation.isPending}
                        data-testid="button-save-edit"
                      >
                        <Save className="w-3.5 h-3.5 mr-1" /> Saqlash
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    {note.isPinned && <Pin className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />}
                    <p className="text-sm flex-1 whitespace-pre-wrap">{note.content}</p>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateMutation.mutate({ id: note.id, data: { isPinned: !note.isPinned } })}
                            data-testid={`button-pin-${note.id}`}
                          >
                            {note.isPinned ? <PinOff className="w-3.5 h-3.5 text-yellow-400" /> : <Pin className="w-3.5 h-3.5" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{note.isPinned ? "Mahkamlashni olib tashlash" : "Mahkamlash"}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => { setEditingId(note.id); setEditContent(note.content); }}
                            data-testid={`button-edit-${note.id}`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Tahrirlash</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400"
                            onClick={() => deleteMutation.mutate(note.id)}
                            data-testid={`button-delete-note-${note.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>O'chirish</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(note.createdAt).toLocaleDateString("uz-UZ")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {bookmarks.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <BookmarkCheck className="w-4 h-4" /> Xatcho'plar ({bookmarks.length})
          </h4>
          {bookmarks.map(bm => (
            <Card key={bm.id} className="glass border-border/50" data-testid={`card-bookmark-${bm.id}`}>
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Bookmark className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm truncate">{bm.label || `Gap #${(bm.sentenceIndex ?? 0) + 1}`}</p>
                    {bm.sentenceIndex !== null && sentences[bm.sentenceIndex] && (
                      <p className="text-xs text-muted-foreground truncate">{sentences[bm.sentenceIndex].sentence}</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-400 shrink-0"
                  onClick={() => removeBookmarkMutation.mutate(bm.id)}
                  data-testid={`button-delete-bookmark-${bm.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {notes.length === 0 && bookmarks.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <StickyNote className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>Hali eslatma yoki xatcho'p yo'q</p>
          <p className="text-xs mt-1">Yuqoridagi maydondan yangi eslatma qo'shing</p>
        </div>
      )}
    </div>
  );
}
