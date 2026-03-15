import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import UserLayout from "@/components/layouts/user-layout";
import ShadowingPlayer from "@/components/shadowing-player";
import type { SubtitleItem, SentenceWordMap } from "@/components/subtitle-player";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, AlertCircle, Headphones, BookOpen } from "lucide-react";
import type { Lesson } from "@shared/schema";

interface WordMapItem {
  word: string;
  normalized: string;
  translationUz: string;
  translationAr: string;
}

interface SentenceAnalysis {
  sentence: string;
  translation: string;
  translationAr?: string;
  wordMap?: WordMapItem[];
}

interface VocabItem {
  word: string;
  translation: string;
  translationAr?: string;
  partOfSpeech: string;
  example: string;
  difficulty: string;
}

export default function ShadowingPage() {
  const [, params] = useRoute("/lessons/:id/shadowing");
  const lessonId = params?.id;

  const { data: lesson, isLoading } = useQuery<Lesson>({
    queryKey: ["/api/user/lessons", lessonId],
    enabled: !!lessonId,
  });

  const sentences: SentenceAnalysis[] = useMemo(() =>
    (lesson?.sentenceAnalysisJson as SentenceAnalysis[] || []), [lesson?.sentenceAnalysisJson]);

  const vocabulary: VocabItem[] = useMemo(() =>
    (lesson?.vocabularyJson as VocabItem[] || []), [lesson?.vocabularyJson]);

  const timedSubs = useMemo(() =>
    (lesson?.subtitlesJson as { startTime: number; endTime: number; text: string }[] | null) || [],
    [lesson?.subtitlesJson]);

  const subtitles: SubtitleItem[] = useMemo(() => {
    if (!sentences.length && !timedSubs.length) return [];

    if (timedSubs.length > 0 && sentences.length > 0) {
      const normalize = (t: string) => t.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "").replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
      const sentNorms = sentences.map(s => normalize(s.sentence));
      const sentWords = sentences.map(s => new Set(normalize(s.sentence).split(/\s+/)));
      let sentCursor = 0;

      return timedSubs.map((ts, idx) => {
        const tsNorm = normalize(ts.text);
        const tsWordSet = new Set(tsNorm.split(/\s+/));
        let firstMatchIdx = -1;
        const matchedIndices: number[] = [];
        const matchedSentences: string[] = [];
        const matchedTranslations: string[] = [];
        const matchedTranslationsAr: string[] = [];
        let matchedCharLen = 0;
        const tsLen = tsNorm.length;

        for (let si = sentCursor; si < sentences.length; si++) {
          const sWords = sentWords[si];
          let hits = 0;
          sWords.forEach(w => { if (tsWordSet.has(w)) hits++; });
          const overlap = hits / Math.max(1, sWords.size);

          if (overlap >= 0.5) {
            if (firstMatchIdx < 0) firstMatchIdx = si;
            matchedIndices.push(si);
            matchedSentences.push(sentences[si].sentence);
            matchedTranslations.push(sentences[si].translation);
            if (sentences[si].translationAr) matchedTranslationsAr.push(sentences[si].translationAr!);
            matchedCharLen += sentNorms[si].length;
            sentCursor = si + 1;
            if (matchedCharLen >= tsLen * 0.8) break;
          } else if (matchedSentences.length > 0) {
            break;
          }
        }

        return {
          id: idx,
          sentenceIndex: firstMatchIdx >= 0 ? firstMatchIdx : Math.min(sentCursor, sentences.length - 1),
          sentenceIndices: matchedIndices.length > 0 ? matchedIndices : [Math.min(sentCursor, sentences.length - 1)],
          startTime: ts.startTime,
          endTime: ts.endTime,
          originalText: ts.text,
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
      sentenceIndices: [idx],
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
        })),
      }))
      .filter(swm => swm.wordMap.length > 0);
  }, [sentences]);

  if (isLoading) {
    return (
      <UserLayout title="Yuklanmoqda...">
        <div className="space-y-4 p-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-6 w-96" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </div>
      </UserLayout>
    );
  }

  if (!lesson) {
    return (
      <UserLayout title="Dars topilmadi">
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

  const hasContent = lesson.youtubeUrl && subtitles.length > 0;

  return (
    <UserLayout
      title="Shadowing"
      noPadding
      headerExtra={
        <>
          <Link href={`/lessons/${lessonId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back-lesson" aria-label="Darsga qaytish">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <Link href={`/lessons/${lessonId}`}>
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" data-testid="button-open-lesson">
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Darsga qaytish</span>
            </Button>
          </Link>
        </>
      }
    >
      <div className="px-2 md:px-4 py-3">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Headphones className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate" data-testid="text-shadowing-title">{lesson.title}</h2>
            <p className="text-xs text-muted-foreground">Gaplarni eshiting va takrorlang</p>
          </div>
        </div>

        {hasContent ? (
          <ShadowingPlayer
            youtubeUrl={lesson.youtubeUrl!}
            subtitles={subtitles}
            lessonId={lesson.id}
            vocabulary={vocabulary.map(v => ({ word: v.word, translation: v.translation, translationAr: v.translationAr, example: v.example, difficulty: v.difficulty }))}
            sentenceWordMaps={sentenceWordMaps}
            className="w-full"
            targetLanguage={lesson.targetLanguage || "ar"}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Headphones className="w-12 h-12 opacity-40" />
            <p className="text-sm">Shadowing uchun video va subtitle kerak</p>
            <Link href={`/lessons/${lessonId}`}>
              <Button variant="outline" size="sm" data-testid="link-back-lesson">
                <BookOpen className="w-3.5 h-3.5 mr-1" /> Darsni ko'rish
              </Button>
            </Link>
          </div>
        )}
      </div>
    </UserLayout>
  );
}
