import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import PublicLayout from "@/components/layouts/public-layout";
import SubtitlePlayer, { type SubtitleItem, type SentenceWordMap } from "@/components/subtitle-player";
import { ExportStudio } from "@/components/export-studio";
import { buildExportData } from "@/lib/export-transform";
import { generatePDF } from "@/lib/export-pdf";
import { generateDocx } from "@/lib/export-docx";
import { generateXLSX } from "@/lib/export-xlsx";
import { saveAs } from "file-saver";
import type { ExportConfig } from "@/lib/export-types";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BookOpen, Languages, Brain, FileText, Layers,
  ArrowLeft, AlertCircle, Sparkles, Lightbulb,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Check, X, User, Calendar,
  Tag, FolderOpen, Star, Globe, Download, RotateCcw
} from "lucide-react";
import type { Lesson, Tag as TagType, Category } from "@shared/schema";

interface WordMapItem {
  word: string;
  normalized: string;
  translationUz: string;
  translationAr: string;
  contextualMeaning: string;
  grammaticalRole?: string;
  i_rab?: string;
  partOfSpeech?: string;
  nahwExplanation?: string;
}

interface SentenceAnalysis {
  sentence: string;
  translation: string;
  translationAr?: string;
  grammarNotes: string;
  keyWords: string[];
  wordMap?: WordMapItem[];
  sentenceType?: string;
}

interface VocabItem {
  word: string;
  translation: string;
  translationAr?: string;
  partOfSpeech: string;
  example: string;
  difficulty: string;
}

interface PhraseItem {
  phrase: string;
  translation: string;
  translationAr?: string;
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
  backAr?: string;
  type: string;
}

interface PublicLesson extends Lesson {
  creatorName: string;
  tags: TagType[];
  categoryName: string | null;
}

function isArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

const arabicStyle = (text: string) => ({
  direction: isArabic(text) ? "rtl" as const : "ltr" as const,
  textAlign: isArabic(text) ? "right" as const : "left" as const,
  fontFamily: isArabic(text) ? "'Noto Naskh Arabic', 'Amiri', serif" : "inherit",
  lineHeight: isArabic(text) ? "1.8" : "1.6",
});

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
  const { toast } = useToast();

  const { data: lesson, isLoading, error } = useQuery<PublicLesson>({
    queryKey: ["/api/lessons/public", lessonId],
    enabled: !!lessonId,
  });

  const [exportOpen, setExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const sentences: SentenceAnalysis[] = useMemo(() =>
    (lesson?.sentenceAnalysisJson as SentenceAnalysis[] || []), [lesson?.sentenceAnalysisJson]);
  const vocabulary: VocabItem[] = useMemo(() =>
    (lesson?.vocabularyJson as VocabItem[] || []), [lesson?.vocabularyJson]);
  const phrases: PhraseItem[] = useMemo(() =>
    (lesson?.phrasesJson as PhraseItem[] || []), [lesson?.phrasesJson]);
  const quizzes: QuizItem[] = useMemo(() =>
    (lesson?.quizzesJson as QuizItem[] || []), [lesson?.quizzesJson]);
  const presetFlashcards: FlashcardData[] = useMemo(() =>
    (lesson?.flashcardsJson as FlashcardData[] || []), [lesson?.flashcardsJson]);

  const timedSubs = useMemo(() =>
    (lesson?.subtitlesJson as { startTime: number; endTime: number; text: string }[] | null) || null,
    [lesson?.subtitlesJson]);

  const subtitles: SubtitleItem[] = useMemo(() => {
    const stripDiacritics = (t: string) => t.replace(/[\u0610-\u065F\u06D6-\u06ED\u0670]/g, "");
    const normalizeText = (t: string) => stripDiacritics(t).replace(/[^\w\u0600-\u06FF\s]/g, "").replace(/\s+/g, " ").trim();

    if (timedSubs && timedSubs.length > 0) {
      if (timedSubs.length === sentences.length) {
        return timedSubs.map((ts, idx) => ({
          id: idx,
          sentenceIndex: idx,
          startTime: ts.startTime,
          endTime: ts.endTime,
          originalText: sentences[idx]?.sentence || ts.text,
          translationUz: sentences[idx]?.translation || "",
          translationAr: sentences[idx]?.translationAr || "",
        }));
      }

      const sentenceNorms = sentences.map(s => normalizeText(s.sentence));
      const subNorms = timedSubs.map(ts => normalizeText(ts.text));
      const totalSubLen = subNorms.reduce((a, n) => a + n.length, 0);
      const totalSentLen = sentenceNorms.reduce((a, n) => a + n.length, 0);

      if (totalSubLen === 0 || totalSentLen === 0) {
        return timedSubs.map((ts, idx) => ({
          id: idx, sentenceIndex: idx, startTime: ts.startTime, endTime: ts.endTime,
          originalText: ts.text, translationUz: "", translationAr: "",
        }));
      }

      let sentCursor = 0;
      let cumSubLen = 0;
      return timedSubs.map((ts, idx) => {
        cumSubLen += subNorms[idx].length;
        const targetSentEnd = Math.round((cumSubLen / totalSubLen) * sentences.length);
        const startSent = sentCursor;
        const endSent = Math.max(startSent + 1, Math.min(targetSentEnd, sentences.length));

        const matchedSentences: string[] = [];
        const matchedTranslations: string[] = [];
        const matchedTranslationsAr: string[] = [];
        for (let si = startSent; si < endSent; si++) {
          matchedSentences.push(sentences[si].sentence);
          matchedTranslations.push(sentences[si].translation);
          if (sentences[si].translationAr) matchedTranslationsAr.push(sentences[si].translationAr!);
        }
        sentCursor = endSent;

        return {
          id: idx,
          sentenceIndex: startSent < sentences.length ? startSent : idx,
          startTime: ts.startTime,
          endTime: ts.endTime,
          originalText: matchedSentences.length > 0 ? matchedSentences.join(" ") : ts.text,
          translationUz: matchedTranslations.join(" ") || "",
          translationAr: matchedTranslationsAr.join(" ") || "",
        };
      });
    }

    if (!sentences.length) return [];
    const avgDuration = 8;
    return sentences.map((s, idx) => ({
      id: idx,
      sentenceIndex: idx,
      startTime: idx * avgDuration,
      endTime: (idx + 1) * avgDuration,
      originalText: s.sentence,
      translationUz: s.translation,
      translationAr: s.translationAr || "",
    }));
  }, [sentences, timedSubs]);

  const sentenceWordMaps: SentenceWordMap[] = useMemo(() => {
    return sentences
      .map((s, idx) => ({
        sentenceIndex: idx,
        wordMap: (s.wordMap || []).map(wm => ({
          word: wm.word,
          normalized: wm.normalized,
          translationUz: wm.translationUz,
          translationAr: wm.translationAr,
          contextualMeaning: wm.contextualMeaning,
          grammaticalRole: wm.grammaticalRole,
          i_rab: wm.i_rab,
        })),
      }))
      .filter(swm => swm.wordMap.length > 0);
  }, [sentences]);

  const exportData = useMemo(() => {
    if (!lesson) return null;
    return buildExportData(lesson, sentences, vocabulary, phrases, quizzes, presetFlashcards);
  }, [lesson, sentences, vocabulary, phrases, quizzes, presetFlashcards]);

  const handleExport = async (config: ExportConfig) => {
    if (!exportData) return;
    setIsExporting(true);
    try {
      const safeName = exportData.title.replace(/[^a-zA-Z0-9\u0400-\u04FF\u0600-\u06FF]/g, "_").substring(0, 40);
      if (config.format === "pdf") {
        const blob = await generatePDF(exportData, config);
        saveAs(blob, `${safeName}_guide.pdf`);
      } else if (config.format === "docx") {
        const blob = await generateDocx(exportData, config);
        saveAs(blob, `${safeName}_worksheet.docx`);
      } else if (config.format === "xlsx") {
        const blob = await generateXLSX(exportData, config);
        saveAs(blob, `${safeName}_vocabulary.xlsx`);
      }
      toast({ title: "Yuklandi!", description: "Fayl muvaffaqiyatli yuklab olindi." });
      setExportOpen(false);
    } catch (err: any) {
      console.error("Export error:", err);
      toast({ title: "Xatolik", description: err?.message || "Faylni yaratishda xatolik yuz berdi.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

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

  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/library">
            <Button variant="ghost" size="sm" data-testid="button-back-library">
              <ArrowLeft className="w-4 h-4 mr-1" /> Kutubxona
            </Button>
          </Link>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 border-primary/30 hover:bg-primary/10"
            onClick={() => setExportOpen(true)}
            data-testid="button-export"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Yuklab olish</span>
          </Button>
        </div>

        <ExportStudio
          open={exportOpen}
          onOpenChange={setExportOpen}
          lessonData={exportData}
          onExport={handleExport}
          isExporting={isExporting}
        />

        <div className="space-y-4">
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

        {lesson.youtubeUrl && /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/.test(lesson.youtubeUrl) ? (
          <SubtitlePlayer
            youtubeUrl={lesson.youtubeUrl}
            subtitles={subtitles}
            lessonId={lesson.id}
            vocabulary={vocabulary.map(v => ({ word: v.word, translation: v.translation, translationAr: v.translationAr, partOfSpeech: v.partOfSpeech, example: v.example, difficulty: v.difficulty }))}
            phrases={phrases.map(p => ({ phrase: p.phrase, translation: p.translation, translationAr: p.translationAr, context: p.context }))}
            sentenceWordMaps={sentenceWordMaps}
            className="max-w-3xl"
            readOnly
          />
        ) : lesson.thumbnailUrl ? (
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
        ) : null}

        <Separator />

        <Tabs defaultValue="matn" className="w-full">
          <TabsList className="w-full flex overflow-x-auto gap-1 glass border border-border/50 h-auto p-1" data-testid="tabs-public-lesson">
            <TabsTrigger value="matn" className="flex-1 min-w-0 text-xs md:text-sm py-2 gap-1" data-testid="tab-matn">
              <BookOpen className="w-3.5 h-3.5 hidden sm:block" /> Matn
            </TabsTrigger>
            <TabsTrigger value="lugat" className="flex-1 min-w-0 text-xs md:text-sm py-2 gap-1" data-testid="tab-lugat">
              <Languages className="w-3.5 h-3.5 hidden sm:block" /> Lug'at
            </TabsTrigger>
            <TabsTrigger value="test" className="flex-1 min-w-0 text-xs md:text-sm py-2 gap-1" data-testid="tab-test">
              <Brain className="w-3.5 h-3.5 hidden sm:block" /> Test
            </TabsTrigger>
            <TabsTrigger value="nahw" className="flex-1 min-w-0 text-xs md:text-sm py-2 gap-1" data-testid="tab-nahw">
              <Sparkles className="w-3.5 h-3.5 hidden sm:block" /> Nahw
            </TabsTrigger>
            <TabsTrigger value="xulosa" className="flex-1 min-w-0 text-xs md:text-sm py-2 gap-1" data-testid="tab-xulosa">
              <FileText className="w-3.5 h-3.5 hidden sm:block" /> Xulosa
            </TabsTrigger>
            <TabsTrigger value="kartochkalar" className="flex-1 min-w-0 text-xs md:text-sm py-2 gap-1" data-testid="tab-kartochkalar">
              <Layers className="w-3.5 h-3.5 hidden sm:block" /> Kartochkalar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="matn" className="mt-4">
            <PublicTranscriptTab sentences={sentences} phrases={phrases} />
          </TabsContent>

          <TabsContent value="lugat" className="mt-4">
            <PublicVocabularyTab vocabulary={vocabulary} phrases={phrases} sentences={sentences} />
          </TabsContent>

          <TabsContent value="test" className="mt-4">
            <PublicQuizTab quizzes={quizzes} />
          </TabsContent>

          <TabsContent value="nahw" className="mt-4">
            <PublicNahwTab sentences={sentences} />
          </TabsContent>

          <TabsContent value="xulosa" className="mt-4">
            <PublicSummaryTab lesson={lesson} sentences={sentences} vocabulary={vocabulary} />
          </TabsContent>

          <TabsContent value="kartochkalar" className="mt-4">
            <PublicFlashcardsTab flashcards={presetFlashcards} />
          </TabsContent>
        </Tabs>
      </div>
    </PublicLayout>
  );
}

type TranslationMode = "none" | "uz" | "ar" | "both";

function PublicTranscriptTab({
  sentences,
  phrases,
}: {
  sentences: SentenceAnalysis[];
  phrases: PhraseItem[];
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [difficultSet, setDifficultSet] = useState<Set<number>>(new Set());
  const [translationMode, setTranslationMode] = useState<TranslationMode>("uz");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" /> Matn tahlili
        </h3>
        <Badge variant="secondary">{sentences.length} gap</Badge>
      </div>

      <div className="flex flex-wrap gap-1 md:gap-1.5">
        {([
          ["none", "Tarjimasiz"],
          ["uz", "O'zbekcha tarjima bilan"],
          ["ar", "Arabcha tarjima bilan"],
          ["both", "Ikki tilli ko'rinish"],
        ] as [TranslationMode, string][]).map(([mode, label]) => (
          <Button
            key={mode}
            variant={translationMode === mode ? "default" : "outline"}
            size="sm"
            className="h-7 text-[10px] md:text-xs px-2 md:px-3"
            onClick={() => setTranslationMode(mode)}
            data-testid={`button-translation-mode-${mode}`}
          >
            {label}
          </Button>
        ))}
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
                  <TooltipContent className="max-w-xs space-y-1">
                    <p className="font-medium">{p.translation}</p>
                    {p.translationAr && (
                      <p className="text-xs" dir="rtl" style={{ fontFamily: "'Noto Naskh Arabic', serif" }}>{p.translationAr}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{p.context}</p>
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

          return (
            <Card
              key={idx}
              className={`glass border-border/50 transition-all ${isDifficult ? "border-yellow-500/50 bg-yellow-500/5" : ""}`}
              data-testid={`card-sentence-${idx}`}
            >
              <CardContent className="p-3 md:p-4">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground font-mono mt-1 shrink-0 w-6 text-right">{idx + 1}</span>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm md:text-base font-medium leading-relaxed">{s.sentence}</p>

                    {(translationMode === "uz" || translationMode === "both") && s.translation && (
                      <p className="text-xs md:text-sm text-primary/80">{s.translation}</p>
                    )}

                    {(translationMode === "ar" || translationMode === "both") && s.translationAr && (
                      <p
                        className="text-xs md:text-sm text-violet-400/80"
                        dir="rtl"
                        style={arabicStyle(s.translationAr)}
                        data-testid={`text-sentence-ar-${idx}`}
                      >
                        {s.translationAr}
                      </p>
                    )}

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
                          {s.wordMap && s.wordMap.length > 0 && (
                            <div className="flex items-start gap-2">
                              <Globe className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">So'zma-so'z tarjima</p>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {s.wordMap.map((wm, wi) => (
                                    <Tooltip key={wi}>
                                      <TooltipTrigger asChild>
                                        <Badge variant="outline" className="text-xs cursor-help py-1">
                                          {wm.word}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent className="space-y-1 max-w-xs">
                                        <p className="text-xs">UZ: {wm.translationUz}</p>
                                        {wm.translationAr && (
                                          <p className="text-xs" dir="rtl" style={{ fontFamily: "'Noto Naskh Arabic', serif" }}>AR: {wm.translationAr}</p>
                                        )}
                                        {wm.contextualMeaning && (
                                          <p className="text-xs text-muted-foreground">{wm.contextualMeaning}</p>
                                        )}
                                      </TooltipContent>
                                    </Tooltip>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpandedIdx(isExpanded ? null : idx)} data-testid={`button-expand-${idx}`}>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{isExpanded ? "Yopish" : "Batafsil"}</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost" size="icon"
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
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {sentences.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Matn tahlili mavjud emas</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PublicVocabularyTab({
  vocabulary, phrases, sentences
}: {
  vocabulary: VocabItem[];
  phrases: PhraseItem[];
  sentences: SentenceAnalysis[];
}) {
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<"words" | "phrases" | "wordmap" | "context">("words");

  const filteredVocab = vocabulary.filter(v => {
    if (!search) return true;
    const q = search.toLowerCase();
    return v.word.toLowerCase().includes(q) || v.translation.toLowerCase().includes(q);
  });

  const allWordMaps = useMemo(() => {
    return sentences.flatMap(s => (s.wordMap || []).map(wm => ({ ...wm, sentence: s.sentence })));
  }, [sentences]);

  const filteredWordMaps = allWordMaps.filter(wm => {
    if (!search) return true;
    const q = search.toLowerCase();
    return wm.word.toLowerCase().includes(q) || wm.translationUz.toLowerCase().includes(q);
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

      <div className="flex flex-wrap gap-1 md:gap-1.5">
        {([
          ["words", "Yangi so'zlar", vocabulary.length],
          ["phrases", "Birikmalar", phrases.length],
          ["wordmap", "So'zma-so'z tarjima", allWordMaps.length],
          ["context", "Kontekstdagi ma'nolar", vocabulary.filter(v => v.example).length],
        ] as [typeof activeSection, string, number][]).map(([key, label, count]) => (
          <Button
            key={key}
            variant={activeSection === key ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs px-2 md:px-3"
            onClick={() => setActiveSection(key)}
            data-testid={`button-section-${key}`}
          >
            {label} ({count})
          </Button>
        ))}
      </div>

      <Input
        placeholder="So'z izlash..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs h-9 bg-background/50"
        data-testid="input-vocab-search"
      />

      {activeSection === "words" && (
        <div className="grid gap-2">
          {filteredVocab.map((v, idx) => (
            <Card key={idx} className="glass border-border/50 hover:border-primary/20 transition-colors" data-testid={`card-vocab-${idx}`}>
              <CardContent className="p-3 md:p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-base">{v.word}</span>
                      <Badge variant="outline" className={`text-[10px] ${diffColors[v.difficulty] || ""}`}>{v.difficulty}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{v.partOfSpeech}</Badge>
                    </div>
                    <p className="text-sm text-primary/80 mt-1">{v.translation}</p>
                    {v.translationAr && (
                      <p className="text-sm text-violet-400/80 mt-0.5" dir="rtl" style={arabicStyle(v.translationAr)}>{v.translationAr}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1 italic">"{v.example}"</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredVocab.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Languages className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>Hech qanday so'z topilmadi</p>
            </div>
          )}
        </div>
      )}

      {activeSection === "phrases" && (
        <div className="grid gap-2">
          {phrases.map((p, idx) => (
            <Card key={idx} className="glass border-border/50 hover:border-amber-500/20 transition-colors" data-testid={`card-phrase-${idx}`}>
              <CardContent className="p-3 md:p-4">
                <div className="space-y-1.5">
                  <p className="font-bold text-sm">{p.phrase}</p>
                  <p className="text-sm text-primary/80">{p.translation}</p>
                  {p.translationAr && (
                    <p className="text-sm text-violet-400/80" dir="rtl" style={arabicStyle(p.translationAr)}>{p.translationAr}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{p.context}</p>
                </div>
              </CardContent>
            </Card>
          ))}
          {phrases.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Sparkles className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>Birikmalar topilmadi</p>
            </div>
          )}
        </div>
      )}

      {activeSection === "wordmap" && (
        <div className="grid gap-2">
          {filteredWordMaps.map((wm, idx) => (
            <Card key={idx} className="glass border-border/50" data-testid={`card-wordmap-${idx}`}>
              <CardContent className="p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{wm.word}</p>
                  <p className="text-xs text-primary/80 mt-0.5">{wm.translationUz}</p>
                  {wm.translationAr && (
                    <p className="text-xs text-violet-400/80 mt-0.5" dir="rtl" style={arabicStyle(wm.translationAr)}>{wm.translationAr}</p>
                  )}
                  {wm.contextualMeaning && (
                    <p className="text-xs text-muted-foreground mt-1">{wm.contextualMeaning}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 mt-1 italic">"{(wm as any).sentence}"</p>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredWordMaps.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>So'zma-so'z tarjima ma'lumotlari mavjud emas</p>
            </div>
          )}
        </div>
      )}

      {activeSection === "context" && (
        <div className="grid gap-2">
          {vocabulary.filter(v => v.example).map((v, idx) => (
            <Card key={idx} className="glass border-border/50" data-testid={`card-context-${idx}`}>
              <CardContent className="p-3 md:p-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{v.word}</span>
                    <Badge variant="secondary" className="text-[10px]">{v.partOfSpeech}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground italic">"{v.example}"</p>
                  <Separator className="my-1" />
                  <p className="text-xs"><span className="text-muted-foreground">UZ:</span> {v.translation}</p>
                  {v.translationAr && (
                    <p className="text-xs" dir="rtl" style={arabicStyle(v.translationAr)}>
                      <span className="text-muted-foreground">AR:</span> {v.translationAr}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PublicQuizTab({ quizzes }: { quizzes: QuizItem[] }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Map<number, number>>(new Map());
  const [showResult, setShowResult] = useState<Map<number, boolean>>(new Map());
  const [quizComplete, setQuizComplete] = useState(false);
  const [fillAnswer, setFillAnswer] = useState("");

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
  const quizType = q.type || "multiple_choice";
  const isChoiceBased = quizType === "multiple_choice" || quizType === "sentence_completion" || quizType === "word_translation";

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
    } else if (!quizComplete) {
      setQuizComplete(true);
    }
  };

  const handleRestart = () => {
    setCurrentIdx(0);
    setAnswers(new Map());
    setShowResult(new Map());
    setQuizComplete(false);
    setFillAnswer("");
  };

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
                      <p className="text-sm font-medium break-words">{quiz.question}</p>
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

  const renderOptionText = (text: string) => {
    const textIsArabic = isArabic(text);
    return (
      <span
        className="text-sm flex-1 break-words"
        dir={textIsArabic ? "rtl" : "ltr"}
        style={textIsArabic ? { fontFamily: "'Noto Naskh Arabic', 'Amiri', serif", lineHeight: "1.8" } : {}}
      >
        {text}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" /> Test
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {quizType === "fill_blank" ? "Gapni to'ldirish" :
             quizType === "sentence_completion" ? "Bo'shliq to'ldirish" :
             quizType === "word_translation" ? "So'z tarjimasini toping" :
             "Ko'p variantli savol"}
          </Badge>
          <Badge variant="secondary">{currentIdx + 1} / {quizzes.length}</Badge>
        </div>
      </div>

      <Progress value={((currentIdx + (hasAnswered ? 1 : 0)) / quizzes.length) * 100} className="h-2" />

      <Card className="glass border-border/50" data-testid={`card-quiz-${currentIdx}`}>
        <CardContent className="p-4 md:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-primary">{currentIdx + 1}</span>
            </div>
            {quizType === "sentence_completion" ? (
              <div className="flex-1 pt-1">
                <p className="text-xs text-muted-foreground mb-2">Bo'sh joyga mos so'zni tanlang:</p>
                <p className="text-base md:text-lg font-medium break-words" dir="rtl" style={{ fontFamily: "'Noto Naskh Arabic', 'Amiri', serif", lineHeight: "2" }}>
                  {q.question.split("_____").map((part, i, arr) => (
                    <span key={i}>
                      {part}
                      {i < arr.length - 1 && (
                        <span className="inline-block mx-1 px-3 py-0.5 border-b-2 border-primary text-primary font-bold rounded-sm bg-primary/10">
                          ؟
                        </span>
                      )}
                    </span>
                  ))}
                </p>
              </div>
            ) : quizType === "word_translation" ? (
              <div className="flex-1 pt-1">
                <p className="text-xs text-muted-foreground mb-2">Ushbu arabcha so'zning o'zbekcha tarjimasini toping:</p>
                <p className="text-2xl md:text-3xl font-bold text-primary break-words" dir="rtl" style={{ fontFamily: "'Noto Naskh Arabic', 'Amiri', serif", lineHeight: "2" }}>
                  {q.question}
                </p>
              </div>
            ) : (
              <p className="text-base md:text-lg font-medium pt-1 break-words">{q.question}</p>
            )}
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
                    Javobni tekshirish
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
                    {renderOptionText(opt)}
                    {hasAnswered && oi === q.correctIndex && <Check className="w-4 h-4 text-green-400 shrink-0" />}
                    {hasAnswered && oi === selectedOpt && oi !== q.correctIndex && <X className="w-4 h-4 text-red-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {hasAnswered && q.explanation && (
            <div className="bg-muted/30 rounded-lg p-3 border border-border/30 animate-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Izoh</p>
                  <p className="text-sm break-words">{q.explanation}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="outline" size="sm"
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

function PublicSummaryTab({ lesson, sentences, vocabulary }: {
  lesson: PublicLesson;
  sentences: SentenceAnalysis[];
  vocabulary: VocabItem[];
}) {
  const [summaryLang, setSummaryLang] = useState<"uz" | "ar">("uz");

  const lessonAny = lesson as any;
  const hasArabicSummary = !!(lessonAny.summaryShortAr || lessonAny.summaryDetailedAr);

  const shortSummary = summaryLang === "ar" && lessonAny.summaryShortAr ? lessonAny.summaryShortAr : lesson.summaryShort;
  const detailedSummary = summaryLang === "ar" && lessonAny.summaryDetailedAr ? lessonAny.summaryDetailedAr : lesson.summaryDetailed;
  const isAr = summaryLang === "ar" && hasArabicSummary;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" /> Xulosa
        </h3>
        {hasArabicSummary && (
          <div className="flex gap-1">
            <Button
              variant={summaryLang === "uz" ? "default" : "outline"} size="sm"
              className="h-7 text-xs px-3"
              onClick={() => setSummaryLang("uz")}
              data-testid="button-summary-uz"
            >
              O'zbekcha
            </Button>
            <Button
              variant={summaryLang === "ar" ? "default" : "outline"} size="sm"
              className="h-7 text-xs px-3"
              onClick={() => setSummaryLang("ar")}
              data-testid="button-summary-ar"
            >
              Arabcha
            </Button>
          </div>
        )}
      </div>

      {shortSummary && (
        <Card className="glass border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Qisqa xulosa</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className="text-sm leading-relaxed break-words"
              dir={isAr ? "rtl" : "ltr"}
              style={isAr ? arabicStyle(shortSummary) : {}}
              data-testid="text-summary-short"
            >
              {shortSummary}
            </p>
          </CardContent>
        </Card>
      )}

      {detailedSummary && (
        <Card className="glass border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Batafsil xulosa</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className="text-sm leading-relaxed whitespace-pre-wrap break-words"
              dir={isAr ? "rtl" : "ltr"}
              style={isAr ? arabicStyle(detailedSummary) : {}}
              data-testid="text-summary-detailed"
            >
              {detailedSummary}
            </p>
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

      {lesson.description && (
        <Card className="glass border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Tavsif</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-description">
              {lesson.description}
            </p>
          </CardContent>
        </Card>
      )}

      {lesson.aiMetaJson && (
        <Card className="glass border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Qo'shimcha ma'lumotlar
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

function PublicFlashcardsTab({ flashcards }: { flashcards: FlashcardData[] }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [knownSet, setKnownSet] = useState<Set<number>>(new Set());
  const [showAr, setShowAr] = useState(false);

  if (flashcards.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Layers className="w-16 h-16 mx-auto mb-3 opacity-30" />
        <p className="text-lg">Kartochkalar mavjud emas</p>
      </div>
    );
  }

  const card = flashcards[currentIdx];
  const backText = showAr && card.backAr ? card.backAr : card.back;
  const backIsArabic = showAr && card.backAr ? isArabic(card.backAr) : false;

  const handleNext = () => { setFlipped(false); setCurrentIdx((currentIdx + 1) % flashcards.length); };
  const handlePrev = () => { setFlipped(false); setCurrentIdx((currentIdx - 1 + flashcards.length) % flashcards.length); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" /> Kartochkalar
        </h3>
        <Badge variant="secondary">{flashcards.length} ta</Badge>
      </div>

      <div className="flex items-center justify-center">
        <div className="w-full max-w-md">
          <div
            className="relative h-60 cursor-pointer perspective-1000"
            onClick={() => setFlipped(!flipped)}
            data-testid="card-flashcard"
          >
            <div className={`absolute inset-0 transition-transform duration-500 preserve-3d ${flipped ? "rotate-y-180" : ""}`}>
              <Card className="absolute inset-0 glass border-border/50 backface-hidden">
                <CardContent className="flex flex-col items-center justify-center h-full p-6 text-center">
                  <Badge variant="outline" className="mb-3 text-[10px]">{card.type}</Badge>
                  <p className="text-lg md:text-xl font-bold break-words" data-testid="text-flashcard-front">{card.front}</p>
                  <p className="text-xs text-muted-foreground mt-3">Asosiy so'z — tarjimani ko'rish uchun bosing</p>
                </CardContent>
              </Card>
              <Card className="absolute inset-0 glass border-primary/30 backface-hidden rotate-y-180">
                <CardContent className="flex flex-col items-center justify-center h-full p-6 text-center">
                  <p
                    className="text-lg md:text-xl font-medium text-primary break-words"
                    dir={backIsArabic ? "rtl" : "ltr"}
                    style={backIsArabic ? arabicStyle(backText) : {}}
                    data-testid="text-flashcard-back"
                  >
                    {backText}
                  </p>
                  {card.backAr && (
                    <Button
                      variant="ghost" size="sm"
                      className="mt-3 text-xs"
                      onClick={(e) => { e.stopPropagation(); setShowAr(!showAr); }}
                      data-testid="button-toggle-ar"
                    >
                      {showAr ? "O'zbekcha tarjima" : "Arabcha tarjima"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <Button variant="outline" size="sm" onClick={handlePrev} data-testid="button-card-prev">
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{currentIdx + 1} / {flashcards.length}</span>

              <Button
                variant={knownSet.has(currentIdx) ? "default" : "outline"} size="sm"
                onClick={() => {
                  const next = new Set(knownSet);
                  knownSet.has(currentIdx) ? next.delete(currentIdx) : next.add(currentIdx);
                  setKnownSet(next);
                }}
                data-testid="button-mark-known"
              >
                {knownSet.has(currentIdx) ? "Bilaman" : "Bilmayman"}
              </Button>
            </div>

            <Button variant="outline" size="sm" onClick={handleNext} data-testid="button-card-next">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Progress value={((currentIdx + 1) / flashcards.length) * 100} className="mt-3 h-1.5" />
        </div>
      </div>
    </div>
  );
}

function PublicNahwTab({ sentences }: { sentences: SentenceAnalysis[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const hasNahwData = sentences.some(s =>
    s.sentenceType || (s.wordMap || []).some(w => w.grammaticalRole || w.i_rab)
  );

  if (!hasNahwData) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Nahviy tahlil mavjud emas</p>
        <p className="text-xs mt-1">Bu dars uchun sintaktik tahlil hali yaratilmagan</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="nahw-tab-content">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-5 h-5 text-teal-400" />
        <h3 className="text-lg font-bold">Sintaktik tahlil (نحو)</h3>
        <Badge variant="outline" className="text-xs ml-auto">{sentences.length} gap</Badge>
      </div>

      {sentences.map((s, idx) => {
        const isExpanded = expandedIdx === idx;
        const wordsWithNahw = (s.wordMap || []).filter(w => w.grammaticalRole || w.i_rab);

        return (
          <Card key={idx} className="glass border-border/50 overflow-hidden" data-testid={`card-nahw-sentence-${idx}`}>
            <CardContent className="p-0">
              <button
                className="w-full text-left p-3 md:p-4 hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                data-testid={`button-toggle-nahw-${idx}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground shrink-0">{idx + 1}</span>
                      {s.sentenceType && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] shrink-0 ${
                            s.sentenceType.includes("فعلية")
                              ? "border-violet-500/30 text-violet-400"
                              : "border-cyan-500/30 text-cyan-400"
                          }`}
                        >
                          {s.sentenceType}
                        </Badge>
                      )}
                    </div>
                    <p
                      className="text-sm font-medium break-words"
                      dir={isArabic(s.sentence) ? "rtl" : "ltr"}
                      style={arabicStyle(s.sentence)}
                      data-testid={`text-nahw-sentence-${idx}`}
                    >
                      {s.sentence}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.translation}</p>
                  </div>
                  <div className="shrink-0 mt-1">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
              </button>

              {isExpanded && wordsWithNahw.length > 0 && (
                <div className="border-t border-border/30 p-3 md:p-4 bg-muted/10 space-y-2">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    So'zma-so'z i'rob tahlili
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse min-w-[600px]" data-testid={`table-nahw-${idx}`}>
                      <thead>
                        <tr className="border-b border-border/30">
                          <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">So'z</th>
                          <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">Tarjima</th>
                          <th className="text-right py-1.5 px-2 text-muted-foreground font-medium" dir="rtl">نوع الكلمة</th>
                          <th className="text-right py-1.5 px-2 text-muted-foreground font-medium" dir="rtl">الوظيفة النحوية</th>
                          <th className="text-right py-1.5 px-2 text-muted-foreground font-medium" dir="rtl">الإعراب</th>
                          <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">O'zbekcha izoh</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wordsWithNahw.map((w, wi) => (
                          <tr key={wi} className="border-b border-border/20 hover:bg-muted/20 transition-colors" data-testid={`row-nahw-word-${idx}-${wi}`}>
                            <td className="py-1.5 px-2">
                              <span
                                className="font-semibold text-foreground"
                                dir={isArabic(w.word) ? "rtl" : "ltr"}
                                style={{
                                  fontFamily: isArabic(w.word) ? "'Noto Naskh Arabic', 'Amiri', serif" : "inherit",
                                  lineHeight: isArabic(w.word) ? "1.8" : "1.6",
                                }}
                              >
                                {w.word}
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-muted-foreground">{w.translationUz}</td>
                            <td className="py-1.5 px-2 text-right">
                              {w.partOfSpeech && (
                                <span
                                  className="text-violet-400 font-medium"
                                  dir="rtl"
                                  style={{ fontFamily: "'Noto Naskh Arabic', 'Amiri', serif", lineHeight: "1.8" }}
                                >
                                  {w.partOfSpeech}
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              {w.grammaticalRole && (
                                <span
                                  className="text-teal-400 font-medium"
                                  dir="rtl"
                                  style={{ fontFamily: "'Noto Naskh Arabic', 'Amiri', serif", lineHeight: "1.8" }}
                                >
                                  {w.grammaticalRole}
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              {w.i_rab && (
                                <span
                                  className="text-amber-400/80"
                                  dir="rtl"
                                  style={{ fontFamily: "'Noto Naskh Arabic', 'Amiri', serif", lineHeight: "1.8" }}
                                >
                                  {w.i_rab}
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-muted-foreground/80">{w.nahwExplanation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {s.grammarNotes && (
                    <div className="mt-2 rounded-md bg-primary/5 border border-primary/10 p-2">
                      <p className="text-[10px] font-medium text-primary/60 uppercase tracking-wider mb-0.5">Grammatik izoh</p>
                      <p className="text-xs text-foreground/80">{s.grammarNotes}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
