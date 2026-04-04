import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import UserLayout from "@/components/layouts/user-layout";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2, Sparkles, FileText, AlertTriangle,
  CheckCircle2, RefreshCcw, Type, BookOpenCheck,
  ChevronRight, ArrowLeft, Zap, Wand2, Copy, Upload, ClipboardPaste, AudioWaveform
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { jsonrepair } from "jsonrepair";
import type { Lesson } from "@shared/schema";

function repairChatGptJson(raw: string): string {
  let text = raw.trim().replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const fixed: string[] = [];
  for (const line of lines) {
    const m = line.match(/^(\s*"[^"]+"\s*:\s*)"(.*)"(,?\s*)$/);
    if (m) {
      const inner = m[2];
      if (inner.includes('"')) {
        const escaped = inner.replace(/\\"/g, "\x00").replace(/"/g, '\\"').replace(/\x00/g, '\\"');
        fixed.push(m[1] + '"' + escaped + '"' + m[3]);
        continue;
      }
    }
    fixed.push(line);
  }
  return fixed.join("\n");
}

type ProcessStep = "loading" | "extracting" | "no-transcript" | "manual-input" | "transcript-ready" | "generating" | "json-import" | "done" | "error";

export default function LessonProcessPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/lessons/:id/process");
  const lessonId = params?.id;

  const [step, setStep] = useState<ProcessStep>("loading");
  const [manualText, setManualText] = useState("");
  const [jsonImportText, setJsonImportText] = useState("");
  const [transcriptPreview, setTranscriptPreview] = useState("");
  const [transcriptSource, setTranscriptSource] = useState("");
  const [sentenceCount, setSentenceCount] = useState(0);

  const { data: lesson, isLoading, refetch } = useQuery<Lesson>({
    queryKey: ["/api/user/lessons", lessonId],
    enabled: !!lessonId,
  });

  useEffect(() => {
    if (!lesson) return;
    if (lesson.summaryShort && lesson.vocabularyJson) {
      setStep("done");
      return;
    }
    if (lesson.transcript) {
      setTranscriptPreview(lesson.transcript);
      setTranscriptSource(lesson.transcriptSource || "unknown");
      setStep("transcript-ready");
      return;
    }
    if (step === "loading" && !isLoading) {
      attemptAutoExtract();
    }
  }, [lesson, isLoading]);

  const transcriptMutation = useMutation({
    mutationFn: async (body: { mode: string; manualText?: string }) => {
      const res = await apiRequest("POST", `/api/user/lessons/${lessonId}/transcript`, body);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setTranscriptPreview(data.transcript.text);
        setTranscriptSource(data.transcript.source);
        setSentenceCount(data.transcript.sentences?.length || 0);
        setStep("transcript-ready");
        queryClient.invalidateQueries({ queryKey: ["/api/user/lessons", lessonId] });
      } else {
        setStep("no-transcript");
      }
    },
    onError: (error: Error) => {
      toast({ title: "Xatolik", description: parseError(error), variant: "destructive" });
      setStep("no-transcript");
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/user/lessons/${lessonId}/generate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/lessons", lessonId] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/lessons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/dashboard"] });
      setStep("done");
      toast({ title: "Dars tayyor!", description: "Dars muvaffaqiyatli yaratildi" });
    },
    onError: (error: Error) => {
      toast({ title: "Xatolik", description: parseError(error), variant: "destructive" });
      setStep("error");
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      let parsed;
      try {
        const step1 = repairChatGptJson(jsonImportText);
        const repaired = jsonrepair(step1);
        parsed = JSON.parse(repaired);
      } catch {
        throw new Error("JSON formati noto'g'ri. ChatGPT javobini to'liq ko'chiring.");
      }
      const res = await apiRequest("POST", `/api/user/lessons/${lessonId}/import-content`, { content: parsed });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/lessons", lessonId] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/lessons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/dashboard"] });
      setStep("done");
      toast({ title: "Import muvaffaqiyatli!", description: "ChatGPT natijasi tizimga yuklandi" });
    },
    onError: (error: Error) => {
      toast({ title: "Import xatolik", description: parseError(error), variant: "destructive" });
    },
  });

  function attemptAutoExtract() {
    setStep("extracting");
    transcriptMutation.mutate({ mode: "auto" });
  }

  function submitManual() {
    if (manualText.trim().length < 20) {
      toast({ title: "Xatolik", description: "Matn kamida 20 ta belgidan iborat bo'lishi kerak", variant: "destructive" });
      return;
    }
    transcriptMutation.mutate({ mode: "manual", manualText: manualText.trim() });
  }

  function useDemo() {
    transcriptMutation.mutate({ mode: "demo" });
  }

  const whisperMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/user/lessons/${lessonId}/whisper-transcribe`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.transcript) {
        setTranscriptPreview(data.transcript);
        setTranscriptSource("whisper");
        setSentenceCount(0);
        setStep("transcript-ready");
        queryClient.invalidateQueries({ queryKey: ["/api/user/lessons", lessonId] });
        toast({ title: "Whisper transkripsiya tayyor!", description: `${data.wordCount} ta so'z aniqlandi` });
      } else {
        toast({ title: "Xatolik", description: "Whisper natija bermadi", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Whisper xatolik", description: parseError(error), variant: "destructive" });
    },
  });

  function attemptWhisper() {
    setStep("extracting");
    whisperMutation.mutate();
  }

  function startGeneration() {
    setStep("generating");
    generateMutation.mutate();
  }

  if (isLoading) {
    return (
      <UserLayout title="Dars tayyorlanmoqda" subtitle="Iltimos kuting...">
        <div className="max-w-2xl space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </UserLayout>
    );
  }

  if (!lesson) {
    return (
      <UserLayout title="Dars topilmadi" subtitle="">
        <Card className="glass border-destructive/30 max-w-2xl">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-3" />
            <p className="text-sm text-destructive mb-4">Dars topilmadi yoki ruxsat yo'q</p>
            <Button variant="outline" onClick={() => setLocation("/lessons")} data-testid="button-back-lessons">
              <ArrowLeft className="w-4 h-4 mr-2" /> Darslarimga qaytish
            </Button>
          </CardContent>
        </Card>
      </UserLayout>
    );
  }

  return (
    <UserLayout title="Dars tayyorlash" subtitle={lesson.title}>
      <div className="max-w-2xl space-y-6">
        <StepIndicator step={step} />

        {lesson.thumbnailUrl && (
          <div className="rounded-xl overflow-hidden border border-border/50">
            <img src={lesson.thumbnailUrl} alt="" className="w-full h-40 object-cover" />
          </div>
        )}

        {step === "extracting" && <ExtractingState isWhisper={whisperMutation.isPending} />}
        {step === "no-transcript" && (
          <NoTranscriptState
            onRetry={attemptAutoExtract}
            onManual={() => setStep("manual-input")}
            onDemo={useDemo}
            onWhisper={attemptWhisper}
            isRetrying={transcriptMutation.isPending}
            isWhispering={whisperMutation.isPending}
          />
        )}
        {step === "manual-input" && (
          <ManualInputState
            text={manualText}
            onTextChange={setManualText}
            onSubmit={submitManual}
            onBack={() => setStep("no-transcript")}
            isPending={transcriptMutation.isPending}
          />
        )}
        {step === "transcript-ready" && (
          <TranscriptReadyState
            preview={transcriptPreview}
            source={transcriptSource}
            sentenceCount={sentenceCount}
            onGenerate={startGeneration}
            onJsonImport={() => setStep("json-import")}
          />
        )}
        {step === "json-import" && (
          <JsonImportState
            jsonText={jsonImportText}
            onJsonChange={setJsonImportText}
            onSubmit={() => importMutation.mutate()}
            onBack={() => setStep("transcript-ready")}
            isPending={importMutation.isPending}
            transcript={transcriptPreview}
            manualTranscript={lesson.manualTranscript || ""}
            targetLanguage={lesson.targetLanguage || "ar"}
          />
        )}
        {step === "generating" && <GeneratingState />}
        {step === "done" && (
          <DoneState lessonId={lesson.id} onViewLesson={() => setLocation(`/lessons/${lesson.id}`)} />
        )}
        {step === "error" && (
          <ErrorState onRetry={startGeneration} onBack={() => setStep("transcript-ready")} />
        )}
      </div>
    </UserLayout>
  );
}

function StepIndicator({ step }: { step: ProcessStep }) {
  const steps = [
    { key: "transcript", label: "Transkript", icon: FileText },
    { key: "generate", label: "Generatsiya", icon: Sparkles },
    { key: "result", label: "Natija", icon: CheckCircle2 },
  ];

  function getStepStatus(key: string): "active" | "done" | "pending" {
    if (key === "transcript") {
      if (["loading", "extracting", "no-transcript", "manual-input"].includes(step)) return "active";
      return "done";
    }
    if (key === "generate") {
      if (["transcript-ready", "generating", "json-import"].includes(step)) return "active";
      if (step === "done") return "done";
      return "pending";
    }
    if (key === "result") {
      if (step === "done") return "done";
      return "pending";
    }
    return "pending";
  }

  return (
    <div className="flex items-center gap-2" data-testid="step-indicator">
      {steps.map((s, i) => {
        const status = getStepStatus(s.key);
        return (
          <div key={s.key} className="flex items-center gap-2 flex-1">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium flex-1 transition-all ${
              status === "active" ? "bg-primary/10 text-primary border border-primary/30" :
              status === "done" ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30" :
              "bg-muted/30 text-muted-foreground border border-border/30"
            }`}>
              <s.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{s.label}</span>
              {status === "done" && <CheckCircle2 className="w-3 h-3 ml-auto" />}
            </div>
            {i < steps.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

function ExtractingState({ isWhisper = false }: { isWhisper?: boolean }) {
  return (
    <Card className={`glass ${isWhisper ? "border-amber-500/20" : "border-primary/20"}`} data-testid="card-extracting">
      <CardContent className="p-8">
        <div className="flex flex-col items-center text-center">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${isWhisper ? "bg-gradient-to-br from-amber-500/10 to-orange-500/10" : "bg-gradient-to-br from-primary/10 to-cyan-500/10"}`}>
            {isWhisper ? <AudioWaveform className="w-8 h-8 text-amber-400 animate-pulse" /> : <Loader2 className="w-8 h-8 text-primary animate-spin" />}
          </div>
          <h3 className="text-lg font-semibold mb-2">
            {isWhisper ? "Whisper AI transkripsiya qilmoqda..." : "Transkript olinmoqda..."}
          </h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {isWhisper
              ? "Audio yuklanmoqda va Whisper AI orqali so'zma-so'z transkripsiya qilinmoqda. Bu 1-3 daqiqa davom etishi mumkin."
              : "YouTube videosidan subtitle va transkript ma'lumotlari olinmoqda. Bu bir necha soniya davom etishi mumkin."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function NoTranscriptState({
  onRetry,
  onManual,
  onDemo,
  onWhisper,
  isRetrying,
  isWhispering,
}: {
  onRetry: () => void;
  onManual: () => void;
  onDemo: () => void;
  onWhisper: () => void;
  isRetrying: boolean;
  isWhispering: boolean;
}) {
  return (
    <Card className="glass border-orange-500/20" data-testid="card-no-transcript">
      <CardContent className="p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/10 to-amber-500/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-orange-400" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Bu videoda subtitle topilmadi</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Scriptni qo'lda joylashtirib davom etishingiz mumkin
          </p>
        </div>

        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-4 px-4"
            onClick={onRetry}
            disabled={isRetrying}
            data-testid="button-retry-transcript"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <RefreshCcw className={`w-5 h-5 text-primary ${isRetrying ? "animate-spin" : ""}`} />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">Qayta urinib ko'rish</p>
              <p className="text-xs text-muted-foreground">Subtitlerni avtomatik olishga yana urinish</p>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-4 px-4 border-amber-500/20 hover:border-amber-500/40"
            onClick={onWhisper}
            disabled={isWhispering}
            data-testid="button-whisper-transcript"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              {isWhispering ? <Loader2 className="w-5 h-5 text-amber-400 animate-spin" /> : <AudioWaveform className="w-5 h-5 text-amber-400" />}
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">Whisper AI bilan transkripsiya</p>
              <p className="text-xs text-muted-foreground">Audio'dan so'zma-so'z matn olish (1-3 daqiqa)</p>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-4 px-4"
            onClick={onManual}
            data-testid="button-manual-transcript"
          >
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center flex-shrink-0">
              <Type className="w-5 h-5 text-violet-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">Script bilan davom etish</p>
              <p className="text-xs text-muted-foreground">Video skriptini qo'lda kiritish</p>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-4 px-4"
            onClick={onDemo}
            data-testid="button-demo-transcript"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <BookOpenCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">Demo matndan foydalanish</p>
              <p className="text-xs text-muted-foreground">Namuna matn bilan dars yaratish</p>
            </div>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function detectTimestampedFormat(text: string): boolean {
  const lines = text.trim().split(/\n/).filter(l => l.trim().length > 0);
  if (lines.length < 3) return false;
  let tsCount = 0;
  for (const line of lines) {
    if (/^\s*\d{1,2}:\d{2}(?::\d{2})?\s+/.test(line)) tsCount++;
  }
  return tsCount / lines.length >= 0.5;
}

function countTimestampedLines(text: string): number {
  return text.trim().split(/\n/)
    .filter(l => /^\s*\d{1,2}:\d{2}(?::\d{2})?\s+/.test(l.trim()))
    .length;
}

function ManualInputState({
  text,
  onTextChange,
  onSubmit,
  onBack,
  isPending,
}: {
  text: string;
  onTextChange: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  isPending: boolean;
}) {
  const charCount = text.trim().length;
  const isTimestamped = charCount > 20 && detectTimestampedFormat(text);
  const lineCount = isTimestamped
    ? countTimestampedLines(text)
    : text.trim().split(/(?<=[.!?])\s+|\n+/).filter(s => s.trim().length > 0).length;

  return (
    <Card className="glass border-violet-500/20" data-testid="card-manual-input">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Type className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Scriptni qo'lda kiriting</h3>
            <p className="text-xs text-muted-foreground">Video skriptini yoki matnini pastga joylashtiring</p>
          </div>
        </div>

        <Textarea
          placeholder={"Video skriptini bu yerga joylashtiring...\n\nVaqtli format ham qo'llab-quvvatlanadi:\n0:01 Birinchi gap matni\n0:06 Ikkinchi gap matni\n\nYoki oddiy matn — har bir gapni alohida satr bilan ajrating."}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          className="min-h-[200px] bg-muted/30 border-border/50 text-sm"
          dir={text && /[\u0600-\u06FF]/.test(text) ? "rtl" : "ltr"}
          style={text && /[\u0600-\u06FF]/.test(text) ? { fontFamily: "'Noto Naskh Arabic', 'Amiri', serif", lineHeight: "1.8" } : {}}
          data-testid="textarea-manual-transcript"
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
          <span>{charCount} belgi</span>
          {isTimestamped ? (
            <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] gap-1" data-testid="badge-timestamped">
              <CheckCircle2 className="w-3 h-3" />
              Vaqtli format aniqlandi — {lineCount} qator
            </Badge>
          ) : (
            <span>~{lineCount} gap</span>
          )}
        </div>

        {isTimestamped && (
          <p className="text-xs text-green-400/80">
            Vaqt belgilari aniqlandi. Subtitle video bilan sinxronlanadi.
          </p>
        )}

        {charCount > 0 && charCount < 20 && (
          <p className="text-xs text-orange-400">Kamida 20 ta belgi kerak (hozir: {charCount})</p>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="gap-1.5" data-testid="button-back-options">
            <ArrowLeft className="w-4 h-4" /> Orqaga
          </Button>
          <Button
            className="flex-1 gap-1.5"
            disabled={charCount < 20 || isPending}
            onClick={onSubmit}
            data-testid="button-submit-manual"
          >
            {isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Qayta ishlanmoqda...</>
            ) : (
              <><FileText className="w-4 h-4" /> Scriptni saqlash</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TranscriptReadyState({
  preview,
  source,
  sentenceCount,
  onGenerate,
  onJsonImport,
}: {
  preview: string;
  source: string;
  sentenceCount: number;
  onGenerate: () => void;
  onJsonImport: () => void;
}) {
  const sourceLabels: Record<string, string> = {
    auto: "Avtomatik",
    manual: "Qo'lda kiritilgan",
    demo: "Demo matn",
  };

  return (
    <Card className="glass border-emerald-500/20" data-testid="card-transcript-ready">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold">Transkript tayyor</h3>
            <p className="text-xs text-muted-foreground">Generatsiya uchun tayyor</p>
          </div>
          <Badge variant="outline" className="text-xs">{sourceLabels[source] || source}</Badge>
        </div>

        <div className="rounded-lg bg-muted/20 border border-border/30 p-4 max-h-48 overflow-y-auto">
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {preview.length > 500 ? preview.slice(0, 500) + "..." : preview}
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{preview.length} belgi</span>
          <span>·</span>
          <span>{sentenceCount > 0 ? sentenceCount : preview.split(/[.!?]+/).filter(Boolean).length} gap</span>
        </div>

        <div className="space-y-2">
          <Button
            className="w-full gap-2"
            size="lg"
            onClick={onGenerate}
            data-testid="button-generate-ai"
          >
            <Wand2 className="w-4 h-4" /> Dars yaratish
          </Button>
          <Button
            className="w-full gap-2"
            size="lg"
            variant="outline"
            onClick={onJsonImport}
            data-testid="button-json-import"
          >
            <ClipboardPaste className="w-4 h-4" /> ChatGPT natijasini import qilish
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center">
          Xarajatni tejash uchun ChatGPT da tayyor shablon bilan ishlang
        </p>
      </CardContent>
    </Card>
  );
}

function extractTimedLines(manualTranscript: string): { time: string; text: string }[] {
  const lines = manualTranscript.trim().split(/\n/).filter(l => l.trim());
  const result: { time: string; text: string }[] = [];
  const tsRegex = /^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(tsRegex);
    if (match && i + 1 < lines.length) {
      result.push({ time: match[1], text: lines[i + 1].trim() });
      i++;
    } else {
      const inlineMatch = lines[i].match(/^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/);
      if (inlineMatch) {
        result.push({ time: inlineMatch[1], text: inlineMatch[2].trim() });
      }
    }
  }
  return result;
}

function buildChatGptPrompt(transcript: string, manualTranscript: string, targetLanguage: string = "ar"): string {
  const timedLines = manualTranscript ? extractTimedLines(manualTranscript) : [];
  const hasTiming = timedLines.length > 0;

  const arabTimedSection = hasTiming
    ? `\nMUHIM: Quyida har bir qator VAQT bilan berilgan. sentenceAnalysis da "sentence" maydoni AYNAN shu qatordagi matnni o'z ichiga olishi SHART. Gaplarni birlashtirma, bo'lma — har bir vaqtli qatorni alohida tahlil qil!\n\nVAQTLI GAPLAR RO'YXATI:\n${timedLines.map((l, i) => `${i + 1}. [${l.time}] ${l.text}`).join("\n")}\n`
    : "";

  const englishTimedSection = hasTiming
    ? `\nMUHIM: Quyida har bir qator VAQT bilan berilgan. Sen bu qatorlarni KETMA-KET GAPLARGA BIRLASHTIRIB tahlil qilishing kerak.
- Qisqa qatorlarni bitta gapga birlashtirib yoz — LEKIN asl matnni O'ZGARTIRMA, faqat ketma-ket qatorlarni ulashtirib yoz!
- NOTO'G'RI: Mazmunni qayta yozish, so'zlarni almashtirish, boshqa qatordagi mazmunni qo'shish
- TO'G'RI: Qatorlarni AYNAN asl holatida birlashtirish (masalan: qator 3 matni + " " + qator 4 matni)
- Har bir birlashtirilgan gap uchun "lineIndices" maydoniga qaysi qator raqamlari kiritilganini yoz (0 dan boshlab)
- MUHIM CHEGARA: Har bir gap MAKSIMUM 12-18 SO'ZDAN iborat bo'lsin!
- Agar tabiiy gap 18 so'zdan uzun bo'lsa, uni 2 ta alohida gapga BO'L (vergul, "where", "which", "and", "but" joylarida bo'lish mumkin)
- HECH QACHON 20 so'zdan uzun gap yaratma!
- "translation" maydoni AYNAN shu birlashtirilgan gapdagi mazmunni tarjima qilsin — BOSHQA gaplar mazmunini qo'shma!

VAQTLI GAPLAR RO'YXATI:\n${timedLines.map((l, i) => `${i}. [${l.time}] ${l.text}`).join("\n")}\n`
    : "";

  if (targetLanguage === "en") {
    return `# ROL
Sen ingliz tili bo'yicha tajribali professor va mutaxassisisisan. YouTube video transkriptidan O'ZBEK tilidagi talabalar uchun professional ingliz tili dars materiallari yaratasan.

## TARJIMA QOIDALARI:
- "translation" maydoni: O'ZBEK tilida tarjima (bu eng muhim — O'ZBEKCHA bo'lishi SHART)
- "explanation": O'ZBEK tilida

# JAVOB FORMATI
Javobni FAQAT JSON formatda ber. Boshqa hech qanday matn, izoh, markdown yozma — faqat sof JSON: { dan boshlab } gacha.

# JSON STRUKTURASI
{
  "summaryShort": "Videoning qisqacha mazmuni (2-3 gap, O'ZBEK tilida)",
  "summaryDetailed": "Videoning batafsil mazmuni (5-8 gap, O'ZBEK tilida)",
  "vocabulary": [
    {
      "word": "inglizcha so'z (masalan: accomplish)",
      "translation": "O'ZBEKCHA tarjima (SHART o'zbekcha bo'lishi kerak)",
      "partOfSpeech": "noun/verb/adjective/adverb/preposition",
      "example": "transkriptdan inglizcha misol gap",
      "difficulty": "easy/medium/hard"
    }
  ],
  "quizzes": [
    {
      "question": "O'ZBEK tilida savol",
      "options": ["variant A", "variant B", "variant C", "variant D"],
      "correctIndex": 0,
      "explanation": "O'ZBEK tilida batafsil tushuntirish",
      "type": "multiple_choice"
    },
    {
      "question": "I _____ to the store yesterday — bo'sh joyga mos so'zni tanlang",
      "options": ["go", "went", "gone", "going"],
      "correctIndex": 1,
      "explanation": "went — go fe'lining Past Simple shakli",
      "type": "sentence_completion"
    },
    {
      "question": "accomplish",
      "options": ["bajarmoq", "o'qimoq", "yozmoq", "bormoq"],
      "correctIndex": 0,
      "explanation": "accomplish — bajarmoq, amalga oshirmoq ma'nosida",
      "type": "word_translation"
    }
  ],
  "flashcards": [
    {
      "front": "inglizcha so'z yoki ibora",
      "back": "O'ZBEKCHA tarjima va tushuntirish",
      "type": "vocabulary | grammar"
    }
  ],
  "sentenceAnalysis": [
    {
      "sentence": "ketma-ket qatorlar matnini AYNAN asl holatida birlashtirgan gap (QAYTA YOZMA!)",
      "translation": "O'ZBEKCHA tarjima — AYNAN shu gap mazmunini tarjima qil",${hasTiming ? '\n      "lineIndices": [0, 1, 2],' : ""}
      "wordMap": [
        {
          "word": "inglizcha so'z",
          "normalized": "so'zning asosiy shakli (masalan: go)",
          "translationUz": "O'ZBEKCHA tarjima"
        }
      ]
    }
  ]
}

# QOIDALAR

## 1. TARJIMA TILI
- BARCHA "translation", "explanation", "back" maydonlari — O'ZBEK tilida
- "word", "sentence", "front", "example" maydonlari — INGLIZ tilida

## 2. QUIZ TURLARI — MAJBURIY:
- multiple_choice: 4-5 ta (O'zbek tilida savol, 4 variant)
- sentence_completion: 3-4 ta (inglizcha gap O'RTASIDA _____ bo'shliq, BOSHIDA yoki OXIRIDA EMAS!, 4 inglizcha variant)
- word_translation: 3-4 ta (inglizcha so'z, 4 o'zbekcha variant)

## 3. SON CHEGARALARI
- vocabulary: 8-15 ta so'z
- quizzes: 10-12 ta savol (3 tur aralash)
- flashcards: 8-12 ta karta
- sentenceAnalysis: BARCHA transkript qatorlari qamrab olinishi kerak — HECH BIRINI TASHLAB KETMA!

## 4. SENTENCEANALYSIS — ENG MUHIM
- Transkriptdagi qisqa qatorlarni gaplarga BIRLASHTIR
- MUHIM: Gapni QAYTA YOZMA! Asl qatorlardagi so'zlarni AYNAN shu tartibda birlashtir!
- NOTO'G'RI: "She bakes a perfect soufflé, or I could go with Mr. Taylor." (2 ta qatordan mazmun aralashtirilgan!)
- TO'G'RI: "She can recite 100 digits of pi, designs satellites for a living, and bakes a perfect soufflé." (faqat asl qator matni)
- Masalan: qator 5 "the verb" + qator 6 "to be" + qator 7 "is used in present tense" = bitta gap: "the verb to be is used in present tense"
- QAYTA TARTIBLASH MUMKIN EMAS! Har bir gap faqat KETMA-KET qatorlarning AYNAN ASL MATNINI birlashtirishi kerak!
- HAR BIR GAP 12-18 SO'ZDAN IBORAT BO'LSIN! 20 so'zdan uzun gap YARATMA!
- Agar uzun gap bo'lsa, vergul yoki bog'lovchi so'z (where, which, and, but, because) joyida ikkiga BO'L
- Har bir birlashtirilgan gap uchun TO'LIQ O'ZBEKCHA tarjima yoz — tarjima AYNAN shu gapdagi mazmunni tarjima qilsin!
- wordMap: gapdagi HAR BIR so'z tahlili — so'z tashlab ketish MUMKIN EMAS
- Har bir so'z uchun faqat 3 ta maydon: word (asl shakl), normalized (asosiy shakl), translationUz (o'zbekcha)
${hasTiming ? '- "lineIndices": bu gap qaysi vaqtli qator raqamlarini o\'z ichiga olishini ko\'rsatadi (0 dan boshlab). BARCHA qatorlar qamrab olinishi SHART!' : ""}

## 5. TEXNIK
- correctIndex: 0 dan boshlanadi (0-3)
- JSON VALID bo'lishi SHART — vergul, qavs, qo'shtirnoqlarni tekshir
${englishTimedSection}
# TRANSKRIPT:
${transcript}`;
  }

  return `# ROL
Sen arab tili bo'yicha tajribali professor va mutaxassisisisan. YouTube video transkriptidan O'ZBEK tilidagi talabalar uchun professional dars materiallari yaratasan.

Sen quyidagi manbalarga tayanasan:
- كِتَابُ سِيبَوَيْهِ (Sibavayh kitobi — nahv asosi)
- النَّحْوُ الْوَافِي لِعَبَّاسِ حَسَنٍ (Abbas Hasan — to'liq nahv)
- أَلْفِيَّةُ ابْنِ مَالِكٍ (Ibn Molik alfiyasi — nahv qoidalari)
- شَرْحُ ابْنِ عَقِيلٍ (Ibn Aqil sharhi)

## HARAKAT (التَّشْكِيل) QOIDALARI — QAT'IY RIOYA QILING:
Quyidagi BARCHA maydonlarda arabcha so'zlar TO'LIQ HARAKAT bilan yozilishi SHART:
- Har bir harf ustiga/ostiga tegishli harakat qo'yilsin: فَتْحَة (َ), كَسْرَة (ِ), ضَمَّة (ُ), سُكُون (ْ), شَدَّة (ّ), تَنْوِين (ً ٍ ٌ)
- TO'G'RI: ذَهَبَ الْوَلَدُ إِلَى الْمَدْرَسَةِ | NOTO'G'RI: ذهب الولد الى المدرسة
- TO'G'RI: كِتَابٌ جَمِيلٌ | NOTO'G'RI: كتاب جميل
- Alif-lam (ال) oldidan ham harakat: الْكِتَابُ, الْعِلْمُ
- Tanvin: indefinite ism oxirida ٌ ٍ ً qo'yilsin (كِتَابٌ, كِتَابًا, كِتَابٍ)
- Shadda: tashdidli harflarda ّ SHART (مُعَلِّمٌ, شَدَّةٌ)
- Harakatsiz arabcha so'z QABUL QILINMAYDI
- Harakat qo'yiladigan maydonlar: "word", "sentence", "translationAr", "front", "question" (arabcha qism), "options" (arabcha variantlar), wordMap."word", wordMap."translationAr"

## TARJIMA QOIDALARI:
- "translation" maydoni: O'ZBEK tilida tarjima (bu eng muhim — O'ZBEKCHA bo'lishi SHART)
- "translationAr" maydoni: arabcha so'zning arabcha izohi yoki sinonimi (HARAKAT BILAN)
- "explanation": O'ZBEK tilida

# JAVOB FORMATI
Javobni FAQAT JSON formatda ber. Boshqa hech qanday matn, izoh, markdown yozma — faqat sof JSON: { dan boshlab } gacha.

# JSON STRUKTURASI
{
  "summaryShort": "Videoning qisqacha mazmuni (2-3 gap, O'ZBEK tilida)",
  "summaryDetailed": "Videoning batafsil mazmuni (5-8 gap, O'ZBEK tilida)",
  "summaryShortAr": "مُلَخَّصٌ قَصِيرٌ لِلْفِيدِيُو (٢-٣ جُمَل بِالْعَرَبِيَّةِ مَعَ التَّشْكِيلِ الْكَامِلِ)",
  "summaryDetailedAr": "مُلَخَّصٌ تَفْصِيلِيٌّ لِلْفِيدِيُو (٥-٨ جُمَل بِالْعَرَبِيَّةِ مَعَ التَّشْكِيلِ الْكَامِلِ)",
  "vocabulary": [
    {
      "word": "arabcha so'z TO'LIQ HARAKAT BILAN (masalan: مُعَلِّمٌ)",
      "translation": "O'ZBEKCHA tarjima (SHART o'zbekcha bo'lishi kerak)",
      "translationAr": "عَرَبِيّ: تَفْسِيرٌ أَوْ مُرَادِفٌ بِالتَّشْكِيلِ",
      "partOfSpeech": "اِسْمٌ/فِعْلٌ/حَرْفٌ/صِفَةٌ/ظَرْفٌ",
      "example": "transkriptdan misol gap (HARAKAT bilan)",
      "difficulty": "easy/medium/hard"
    }
  ],
  "quizzes": [
    {
      "question": "O'ZBEK tilida savol",
      "options": ["variant A", "variant B", "variant C", "variant D"],
      "correctIndex": 0,
      "explanation": "O'ZBEK tilida batafsil tushuntirish",
      "type": "multiple_choice"
    },
    {
      "question": "هَذَا _____ جَمِيلٌ — bo'sh joyga mos so'zni tanlang",
      "options": ["بَيْتٌ", "كِتَابٌ", "وَلَدٌ", "سَيَّارَةٌ"],
      "correctIndex": 0,
      "explanation": "هَذَا بَيْتٌ جَمِيلٌ — Bu go'zal uy. بَيْتٌ — uy degan ma'no",
      "type": "sentence_completion"
    },
    {
      "question": "كَتَبَ",
      "options": ["o'qidi", "yozdi", "bordi", "keldi"],
      "correctIndex": 1,
      "explanation": "كَتَبَ — yozmoq fe'lining o'tgan zamon (الْمَاضِي) shakli",
      "type": "word_translation"
    }
  ],
  "flashcards": [
    {
      "front": "كَلِمَةٌ أَوْ عِبَارَةٌ بِالتَّشْكِيلِ",
      "back": "O'ZBEKCHA tarjima va tushuntirish",
      "backAr": "التَّرْجَمَةُ وَالشَّرْحُ بِالْعَرَبِيَّةِ مَعَ التَّشْكِيلِ",
      "type": "vocabulary | grammar"
    }
  ],
  "sentenceAnalysis": [
    {
      "sentence": "الْجُمْلَةُ الْعَرَبِيَّةُ بِالتَّشْكِيلِ الْكَامِلِ${hasTiming ? " — AYNAN vaqtli ro'yxatdagi matn" : ""}",
      "translation": "O'ZBEKCHA tarjima (bu SHART o'zbekcha bo'lishi kerak)",
      "translationAr": "الْجُمْلَةُ بِالتَّشْكِيلِ الْكَامِلِ",
      "wordMap": [
        {
          "word": "كَلِمَةٌ بِالتَّشْكِيلِ",
          "normalized": "harakat olib tashlangan shakl (masalan: كتب)",
          "translationUz": "O'ZBEKCHA tarjima",
          "translationAr": "تَفْسِيرٌ أَوْ مُرَادِفٌ بِالتَّشْكِيلِ"
        }
      ]
    }
  ]
}

# QOIDALAR

## 1. HARAKAT — ENG MUHIM QOIDA
- BARCHA arabcha so'zlarda TO'LIQ harakat (تَشْكِيل كَامِل) bo'lishi SHART
- Har bir harfda tegishli harakat: فَتْحَة, كَسْرَة, ضَمَّة, سُكُون, شَدَّة, تَنْوِين
- I'rob alamatlari to'g'ri qo'yilsin
- Harakatsiz arabcha so'z QABUL QILINMAYDI — bu qat'iy talab

## 2. TARJIMA TILI
- BARCHA "translation", "explanation", "back" maydonlari — O'ZBEK tilida
- Arabcha maydonlar ("translationAr", "backAr", "summaryShortAr", "summaryDetailedAr") — arab tilida HARAKAT bilan

## 3. QUIZ TURLARI — MAJBURIY:
- multiple_choice: 4-5 ta (O'zbek tilida savol, 4 variant)
- sentence_completion: 3-4 ta (arabcha gap O'RTASIDA _____ bo'shliq, BOSHIDA yoki OXIRIDA EMAS!, 4 arabcha variant HARAKAT BILAN)
- word_translation: 3-4 ta (arabcha so'z HARAKAT BILAN, 4 o'zbekcha variant)

## 4. SON CHEGARALARI
- vocabulary: 8-15 ta so'z
- quizzes: 10-12 ta savol (3 tur aralash)
- flashcards: 8-12 ta karta
- sentenceAnalysis: BARCHA gaplar — BIRONTASINI HAM TASHLAB KETMA!

## 5. SENTENCEANALYSIS
- Transkriptdagi har bir gap: tarjima + wordMap SHART
- wordMap: gapdagi HAR BIR so'z tahlili — so'z tashlab ketish MUMKIN EMAS
- Har bir so'z uchun faqat 4 ta maydon: word (asl shakl HARAKAT bilan), normalized (harakat olib tashlangan), translationUz (o'zbekcha), translationAr (arabcha sinonim HARAKAT bilan)
${hasTiming ? '- MUHIM: "sentence" maydoni AYNAN quyidagi vaqtli ro\'yxatdagi matn bo\'lishi kerak (o\'zgartirma!)' : ""}

## 6. TEXNIK
- correctIndex: 0 dan boshlanadi (0-3)
- JSON VALID bo'lishi SHART — vergul, qavs, qo'shtirnoqlarni tekshir
${arabTimedSection}
# TRANSKRIPT:
${transcript}`;
}

function JsonImportState({
  jsonText,
  onJsonChange,
  onSubmit,
  onBack,
  isPending,
  transcript,
  manualTranscript,
  targetLanguage,
}: {
  jsonText: string;
  onJsonChange: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  isPending: boolean;
  transcript: string;
  manualTranscript: string;
  targetLanguage: string;
}) {
  const [showTemplate, setShowTemplate] = useState(false);
  const [copied, setCopied] = useState(false);

  const chatGptPrompt = buildChatGptPrompt(transcript, manualTranscript, targetLanguage);

  function copyTemplate() {
    navigator.clipboard.writeText(chatGptPrompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = chatGptPrompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  let jsonValid = false;
  let jsonError = "";
  if (jsonText.trim()) {
    try {
      const step1 = repairChatGptJson(jsonText);
      const repaired = jsonrepair(step1);
      const parsed = JSON.parse(repaired);
      const missing: string[] = [];
      if (!parsed.summaryShort) missing.push("summaryShort");
      if (!parsed.summaryDetailed) missing.push("summaryDetailed");
      if (!Array.isArray(parsed.vocabulary) || parsed.vocabulary.length === 0) missing.push("vocabulary");
      if (!Array.isArray(parsed.sentenceAnalysis) || parsed.sentenceAnalysis.length === 0) missing.push("sentenceAnalysis");
      if (missing.length > 0) jsonError = `Topilmadi: ${missing.join(", ")}`;
      else jsonValid = true;
    } catch {
      jsonError = "JSON formati noto'g'ri";
    }
  }

  return (
    <Card className="glass border-violet-500/20" data-testid="card-json-import">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Upload className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold">ChatGPT natijasini import qilish</h3>
            <p className="text-xs text-muted-foreground">API xarajatisiz — ChatGPT dan olingan JSON ni bu yerga joylashtiring</p>
          </div>
        </div>

        <div className="rounded-lg bg-violet-500/5 border border-violet-500/20 p-3 space-y-2">
          <p className="text-xs font-medium text-violet-400">Qanday ishlaydi:</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Quyidagi shablonni nusxalang</li>
            <li>ChatGPT (chat.openai.com) ga oching va joylashtiring</li>
            <li>ChatGPT javobidagi JSON ni ko'chiring</li>
            <li>Pastdagi maydonga joylashtiring</li>
          </ol>
        </div>

        <Button
          variant="outline"
          className="w-full gap-2 text-xs"
          onClick={() => setShowTemplate(!showTemplate)}
          data-testid="button-toggle-template"
        >
          <FileText className="w-3.5 h-3.5" />
          {showTemplate ? "Shablonni yashirish" : "ChatGPT shablonini ko'rish"}
        </Button>

        {showTemplate && (
          <div className="space-y-2">
            <div className="rounded-lg bg-muted/30 border border-border/50 p-3 max-h-60 overflow-y-auto">
              <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">{chatGptPrompt}</pre>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="w-full gap-1.5 text-xs"
              onClick={copyTemplate}
              data-testid="button-copy-template"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? "Nusxalandi!" : "Shablonni nusxalash"}
            </Button>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">ChatGPT javobini bu yerga joylashtiring:</label>
          <Textarea
            placeholder='{"summaryShort": "...", "vocabulary": [...], ...}'
            value={jsonText}
            onChange={(e) => onJsonChange(e.target.value)}
            className="min-h-[160px] bg-muted/30 border-border/50 text-xs font-mono"
            data-testid="textarea-json-import"
          />
        </div>

        {jsonText.trim() && (
          <div className="flex items-center gap-2">
            {jsonValid ? (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
                <CheckCircle2 className="w-3 h-3" /> JSON to'g'ri
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-[10px] gap-1">
                <AlertTriangle className="w-3 h-3" /> {jsonError}
              </Badge>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="gap-1.5" data-testid="button-import-back">
            <ArrowLeft className="w-4 h-4" /> Orqaga
          </Button>
          <Button
            className="flex-1 gap-1.5"
            disabled={!jsonValid || isPending}
            onClick={onSubmit}
            data-testid="button-submit-import"
          >
            {isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Yuklanmoqda...</>
            ) : (
              <><Upload className="w-4 h-4" /> Import qilish</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function GeneratingState() {
  const steps = [
    "Matn tahlil qilinmoqda...",
    "So'zlar ajratilmoqda...",
    "Lug'at tuzilmoqda...",
    "Testlar yaratilmoqda...",
    "Kartochkalar tayyorlanmoqda...",
  ];
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep(prev => (prev + 1) % steps.length);
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="glass border-primary/20" data-testid="card-generating">
      <CardContent className="p-8">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-violet-500/10 flex items-center justify-center mb-4 neon-glow">
            <Sparkles className="w-8 h-8 text-primary animate-pulse" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Dars yaratilmoqda</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            Transkript tahlil qilinmoqda va interaktiv dars tayyorlanmoqda
          </p>
          <div className="flex items-center gap-2 text-xs text-primary">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="transition-all">{steps[currentStep]}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DoneState({ lessonId, onViewLesson }: { lessonId: number; onViewLesson: () => void }) {
  return (
    <Card className="glass border-emerald-500/20" data-testid="card-done">
      <CardContent className="p-8">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-green-500/10 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Dars muvaffaqiyatli yaratildi!</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">
            Dars tayyor. Endi darsni ko'rishingiz mumkin.
          </p>
          <Button onClick={onViewLesson} className="gap-1.5" data-testid="button-view-lessons">
            <Zap className="w-4 h-4" /> Darslarimga o'tish
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorState({ onRetry, onBack }: { onRetry: () => void; onBack: () => void }) {
  return (
    <Card className="glass border-destructive/20" data-testid="card-error">
      <CardContent className="p-8">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Xatolik yuz berdi</h3>
          <p className="text-sm text-muted-foreground mb-6">Generatsiyada xatolik. Qayta urinib ko'ring.</p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onBack} data-testid="button-error-back">
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Orqaga
            </Button>
            <Button onClick={onRetry} data-testid="button-error-retry">
              <RefreshCcw className="w-4 h-4 mr-1.5" /> Qayta urinish
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function parseError(error: Error): string {
  const msg = error.message;
  if (msg.includes(":")) {
    const rest = msg.split(":").slice(1).join(":").trim();
    try { return JSON.parse(rest).message; } catch {}
    return rest;
  }
  return msg;
}
