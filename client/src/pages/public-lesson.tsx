import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import PublicLayout from "@/components/layouts/public-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BookOpen, Languages, Brain, FileText, Layers,
  ArrowLeft, AlertCircle, Sparkles, Lightbulb,
  ChevronDown, ChevronUp, Check, X, User, Calendar,
  Tag, FolderOpen, Star, Clock
} from "lucide-react";
import type { Lesson, Tag as TagType, Category } from "@shared/schema";

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

interface PublicLesson extends Lesson {
  creatorName: string;
  tags: TagType[];
  categoryName: string | null;
}

const levelLabels: Record<string, string> = {
  beginner: "Boshlang'ich",
  intermediate: "O'rta",
  advanced: "Yuqori",
};

const levelColors: Record<string, string> = {
  beginner: "bg-green-500/10 text-green-600 dark:text-green-400",
  intermediate: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  advanced: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default function PublicLessonPage() {
  const [, params] = useRoute("/library/:id");
  const lessonId = params?.id;

  const { data: lesson, isLoading, error } = useQuery<PublicLesson>({
    queryKey: ["/api/lessons/public", lessonId],
    enabled: !!lessonId,
  });

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-4">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </PublicLayout>
    );
  }

  if (!lesson || error) {
    return (
      <PublicLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <AlertCircle className="w-16 h-16 text-muted-foreground" />
          <h2 className="text-xl font-semibold" data-testid="text-not-found">Dars topilmadi</h2>
          <p className="text-muted-foreground text-sm">Bu dars mavjud emas yoki hali e'lon qilinmagan.</p>
          <Link href="/library">
            <Button variant="outline" data-testid="link-back-library">
              <ArrowLeft className="w-4 h-4 mr-2" /> Kutubxonaga qaytish
            </Button>
          </Link>
        </div>
      </PublicLayout>
    );
  }

  const sentences: SentenceAnalysis[] = (lesson.sentenceAnalysisJson as SentenceAnalysis[]) || [];
  const vocabulary: VocabItem[] = (lesson.vocabularyJson as VocabItem[]) || [];
  const phrases: PhraseItem[] = (lesson.phrasesJson as PhraseItem[]) || [];
  const quizzes: QuizItem[] = (lesson.quizzesJson as QuizItem[]) || [];
  const presetFlashcards: FlashcardData[] = (lesson.flashcardsJson as FlashcardData[]) || [];

  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/library">
            <Button variant="ghost" size="sm" data-testid="button-back-library">
              <ArrowLeft className="w-4 h-4 mr-1" /> Kutubxona
            </Button>
          </Link>
        </div>

        <div className="space-y-4">
          {lesson.thumbnailUrl && (
            <div className="relative rounded-md overflow-hidden aspect-video max-w-2xl">
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

          <div className="space-y-3">
            <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-lesson-title">
              {lesson.title}
            </h1>

            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className={levelColors[lesson.level] || ""} data-testid="badge-level">
                {levelLabels[lesson.level] || lesson.level}
              </Badge>
              {lesson.isFeatured && (
                <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" data-testid="badge-featured">
                  <Star className="w-3 h-3 mr-1 fill-current" /> Tavsiya etilgan
                </Badge>
              )}
              {lesson.categoryName && (
                <Badge variant="secondary" data-testid="badge-category">
                  <FolderOpen className="w-3 h-3 mr-1" /> {lesson.categoryName}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5" data-testid="text-creator">
                <User className="w-3.5 h-3.5" /> {lesson.creatorName}
              </span>
              {lesson.publishedAt && (
                <span className="flex items-center gap-1.5" data-testid="text-published-date">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(lesson.publishedAt).toLocaleDateString("uz-UZ", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" /> {sentences.length} gap
              </span>
              <span className="flex items-center gap-1.5">
                <Languages className="w-3.5 h-3.5" /> {vocabulary.length} so'z
              </span>
              <span className="flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5" /> {quizzes.length} test
              </span>
            </div>

            {lesson.tags && lesson.tags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap" data-testid="tags-list">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                {lesson.tags.map((tag) => (
                  <Badge key={tag.id} variant="outline" className="text-xs" data-testid={`badge-tag-${tag.id}`}>
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}

            {lesson.summaryShort && (
              <p className="text-muted-foreground leading-relaxed" data-testid="text-summary-short">
                {lesson.summaryShort}
              </p>
            )}
          </div>
        </div>

        <Separator />

        <Tabs defaultValue="xulosa" className="w-full">
          <TabsList className="w-full grid grid-cols-5 glass border border-border/50 h-auto p-1" data-testid="tabs-public-lesson">
            <TabsTrigger value="xulosa" className="text-xs md:text-sm py-2 gap-1" data-testid="tab-xulosa">
              <FileText className="w-3.5 h-3.5 hidden sm:block" /> Xulosa
            </TabsTrigger>
            <TabsTrigger value="matn" className="text-xs md:text-sm py-2 gap-1" data-testid="tab-matn">
              <BookOpen className="w-3.5 h-3.5 hidden sm:block" /> Matn
            </TabsTrigger>
            <TabsTrigger value="lugat" className="text-xs md:text-sm py-2 gap-1" data-testid="tab-lugat">
              <Languages className="w-3.5 h-3.5 hidden sm:block" /> Lug'at
            </TabsTrigger>
            <TabsTrigger value="test" className="text-xs md:text-sm py-2 gap-1" data-testid="tab-test">
              <Brain className="w-3.5 h-3.5 hidden sm:block" /> Test
            </TabsTrigger>
            <TabsTrigger value="kartochkalar" className="text-xs md:text-sm py-2 gap-1" data-testid="tab-kartochkalar">
              <Layers className="w-3.5 h-3.5 hidden sm:block" /> Kartochkalar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="xulosa" className="mt-4">
            <PublicSummaryTab lesson={lesson} sentences={sentences} vocabulary={vocabulary} />
          </TabsContent>

          <TabsContent value="matn" className="mt-4">
            <PublicTranscriptTab sentences={sentences} phrases={phrases} />
          </TabsContent>

          <TabsContent value="lugat" className="mt-4">
            <PublicVocabularyTab vocabulary={vocabulary} />
          </TabsContent>

          <TabsContent value="test" className="mt-4">
            <PublicQuizTab quizzes={quizzes} />
          </TabsContent>

          <TabsContent value="kartochkalar" className="mt-4">
            <PublicFlashcardsTab flashcards={presetFlashcards} />
          </TabsContent>
        </Tabs>
      </div>
    </PublicLayout>
  );
}

function PublicSummaryTab({
  lesson,
  sentences,
  vocabulary,
}: {
  lesson: PublicLesson;
  sentences: SentenceAnalysis[];
  vocabulary: VocabItem[];
}) {
  return (
    <div className="space-y-4">
      {lesson.summaryDetailed && (
        <Card className="glass border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Batafsil xulosa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-summary-detailed">
              {lesson.summaryDetailed}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        <Card className="glass border-border/50">
          <CardContent className="p-4 text-center">
            <BookOpen className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold" data-testid="text-sentence-count">{sentences.length}</p>
            <p className="text-xs text-muted-foreground">Gaplar</p>
          </CardContent>
        </Card>
        <Card className="glass border-border/50">
          <CardContent className="p-4 text-center">
            <Languages className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold" data-testid="text-vocab-count">{vocabulary.length}</p>
            <p className="text-xs text-muted-foreground">So'zlar</p>
          </CardContent>
        </Card>
        <Card className="glass border-border/50">
          <CardContent className="p-4 text-center">
            <Lightbulb className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
            <p className="text-2xl font-bold" data-testid="text-level">
              {levelLabels[lesson.level] || lesson.level}
            </p>
            <p className="text-xs text-muted-foreground">Daraja</p>
          </CardContent>
        </Card>
      </div>

      {lesson.description && (
        <Card className="glass border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tavsif</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-description">
              {lesson.description}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PublicTranscriptTab({
  sentences,
  phrases,
}: {
  sentences: SentenceAnalysis[];
  phrases: PhraseItem[];
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
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
                      className="cursor-help py-1.5"
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
          return (
            <Card
              key={idx}
              className="glass border-border/50"
              data-testid={`card-sentence-${idx}`}
            >
              <CardContent className="p-3 md:p-4">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground font-mono mt-1 shrink-0 w-6 text-right">
                    {idx + 1}
                  </span>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                    data-testid={`button-expand-${idx}`}
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {sentences.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Matn tahlili mavjud emas</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PublicVocabularyTab({ vocabulary }: { vocabulary: VocabItem[] }) {
  const [filter, setFilter] = useState<"all" | "easy" | "medium" | "hard">("all");

  const filtered = vocabulary.filter((v) => {
    if (filter !== "all" && v.difficulty !== filter) return false;
    return true;
  });

  const diffColors: Record<string, string> = {
    easy: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30",
    medium: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
    hard: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Languages className="w-5 h-5 text-primary" /> Lug'at
        </h3>
        <Badge variant="secondary">{vocabulary.length} so'z</Badge>
      </div>

      <div className="flex gap-1 flex-wrap">
        {(["all", "easy", "medium", "hard"] as const).map((level) => (
          <Button
            key={level}
            variant={filter === level ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(level)}
            data-testid={`button-filter-${level}`}
          >
            {level === "all" ? "Barchasi" : level === "easy" ? "Oson" : level === "medium" ? "O'rta" : "Qiyin"}
          </Button>
        ))}
      </div>

      <div className="grid gap-2">
        {filtered.map((v, idx) => (
          <Card key={idx} className="glass border-border/50" data-testid={`card-vocab-${idx}`}>
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-base">{v.word}</span>
                <Badge variant="outline" className={`text-[10px] ${diffColors[v.difficulty] || ""}`}>
                  {v.difficulty}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">{v.partOfSpeech}</Badge>
              </div>
              <p className="text-sm text-primary/80 mt-1">{v.translation}</p>
              <p className="text-xs text-muted-foreground mt-1 italic">"{v.example}"</p>
            </CardContent>
          </Card>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Languages className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>So'zlar topilmadi</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PublicQuizTab({ quizzes }: { quizzes: QuizItem[] }) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState(false);

  const handleSelect = (qIdx: number, optIdx: number) => {
    if (showResults) return;
    setSelectedAnswers((prev) => ({ ...prev, [qIdx]: optIdx }));
  };

  const handleShowResults = () => {
    setShowResults(true);
  };

  const handleReset = () => {
    setSelectedAnswers({});
    setShowResults(false);
  };

  const correctCount = quizzes.filter(
    (q, i) => selectedAnswers[i] === q.correctIndex
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" /> Test savollari
        </h3>
        <Badge variant="secondary">{quizzes.length} savol</Badge>
      </div>

      {showResults && (
        <Card className="glass border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-lg font-bold" data-testid="text-quiz-score">
                  Natija: {correctCount}/{quizzes.length}
                </p>
                <p className="text-sm text-muted-foreground">
                  {correctCount === quizzes.length
                    ? "Ajoyib natija!"
                    : correctCount >= quizzes.length / 2
                      ? "Yaxshi natija!"
                      : "Yana urinib ko'ring!"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleReset} data-testid="button-quiz-reset">
                Qayta boshlash
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {quizzes.map((q, qIdx) => {
          const selected = selectedAnswers[qIdx];
          const isCorrect = selected === q.correctIndex;

          return (
            <Card key={qIdx} className="glass border-border/50" data-testid={`card-quiz-${qIdx}`}>
              <CardContent className="p-4">
                <p className="font-medium mb-3 text-sm md:text-base">
                  <span className="text-muted-foreground mr-2">{qIdx + 1}.</span>
                  {q.question}
                </p>
                <div className="grid gap-2">
                  {q.options.map((opt, optIdx) => {
                    let optionClass = "glass border-border/50 cursor-pointer hover-elevate";
                    if (showResults) {
                      if (optIdx === q.correctIndex) {
                        optionClass = "border-green-500/50 bg-green-500/10 cursor-default";
                      } else if (optIdx === selected && !isCorrect) {
                        optionClass = "border-red-500/50 bg-red-500/10 cursor-default";
                      } else {
                        optionClass = "glass border-border/50 cursor-default opacity-60";
                      }
                    } else if (selected === optIdx) {
                      optionClass = "border-primary/50 bg-primary/10 cursor-pointer";
                    }

                    return (
                      <div
                        key={optIdx}
                        className={`rounded-md border p-3 text-sm flex items-center gap-2 transition-colors ${optionClass}`}
                        onClick={() => handleSelect(qIdx, optIdx)}
                        data-testid={`quiz-option-${qIdx}-${optIdx}`}
                      >
                        <span className="w-6 h-6 rounded-full border flex items-center justify-center text-xs font-medium shrink-0">
                          {showResults && optIdx === q.correctIndex && <Check className="w-3.5 h-3.5 text-green-500" />}
                          {showResults && optIdx === selected && !isCorrect && optIdx !== q.correctIndex && <X className="w-3.5 h-3.5 text-red-500" />}
                          {!showResults && String.fromCharCode(65 + optIdx)}
                        </span>
                        <span>{opt}</span>
                      </div>
                    );
                  })}
                </div>
                {showResults && q.explanation && (
                  <div className="mt-3 p-3 rounded-md bg-muted/50 text-sm">
                    <p className="font-medium text-xs text-muted-foreground mb-1">Izoh:</p>
                    <p>{q.explanation}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {quizzes.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Test savollari mavjud emas</p>
          </div>
        )}
      </div>

      {quizzes.length > 0 && !showResults && (
        <div className="flex justify-center">
          <Button
            onClick={handleShowResults}
            disabled={Object.keys(selectedAnswers).length < quizzes.length}
            data-testid="button-check-answers"
          >
            Javoblarni tekshirish
          </Button>
        </div>
      )}
    </div>
  );
}

function PublicFlashcardsTab({ flashcards }: { flashcards: FlashcardData[] }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  if (flashcards.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Layers className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Kartochkalar mavjud emas</p>
      </div>
    );
  }

  const card = flashcards[currentIdx];

  const goNext = () => {
    setIsFlipped(false);
    setCurrentIdx((prev) => (prev + 1) % flashcards.length);
  };

  const goPrev = () => {
    setIsFlipped(false);
    setCurrentIdx((prev) => (prev - 1 + flashcards.length) % flashcards.length);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" /> Kartochkalar
        </h3>
        <Badge variant="secondary">{flashcards.length} ta</Badge>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div
          className="w-full max-w-md perspective-1000 cursor-pointer"
          onClick={() => setIsFlipped(!isFlipped)}
          data-testid="flashcard-container"
        >
          <div className={`relative preserve-3d transition-transform duration-500 ${isFlipped ? "rotate-y-180" : ""}`}>
            <Card className="glass border-border/50 min-h-[200px] flex items-center justify-center backface-hidden">
              <CardContent className="p-6 text-center">
                <Badge variant="outline" className="text-[10px] mb-3">{card.type}</Badge>
                <p className="text-lg font-medium">{card.front}</p>
                <p className="text-xs text-muted-foreground mt-3">Orqa tomonni ko'rish uchun bosing</p>
              </CardContent>
            </Card>
            <Card className="glass border-border/50 min-h-[200px] flex items-center justify-center absolute inset-0 backface-hidden rotate-y-180">
              <CardContent className="p-6 text-center">
                <p className="text-lg font-medium text-primary">{card.back}</p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={goPrev} data-testid="button-prev-card">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground" data-testid="text-card-counter">
            {currentIdx + 1} / {flashcards.length}
          </span>
          <Button variant="outline" size="icon" onClick={goNext} data-testid="button-next-card">
            <ArrowLeft className="w-4 h-4 rotate-180" />
          </Button>
        </div>
      </div>
    </div>
  );
}
