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
  ChevronRight, ArrowLeft, Zap, Wand2, Copy, Upload, ClipboardPaste, AudioWaveform,
  MessageSquareText, ChevronDown, ChevronUp
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

type ProcessStep = "loading" | "extracting" | "no-transcript" | "manual-input" | "transcript-ready" | "generating" | "json-import" | "chatgpt-workflow" | "done" | "error";

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
  const [whisperSubtitles, setWhisperSubtitles] = useState<{ startTime: number; endTime: number; text: string }[] | null>(null);

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
        if (data.lesson?.subtitlesJson && Array.isArray(data.lesson.subtitlesJson)) {
          setWhisperSubtitles(data.lesson.subtitlesJson as { startTime: number; endTime: number; text: string }[]);
        }
        setStep("transcript-ready");
        queryClient.invalidateQueries({ queryKey: ["/api/user/lessons", lessonId] });
        toast({ title: "Whisper transkripsiya tayyor!", description: `${data.wordCount} ta so'z aniqlandi` });
      } else {
        toast({ title: "Xatolik", description: "Whisper natija bermadi", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      setStep("no-transcript");
      toast({ title: "Whisper xatolik", description: parseError(error), variant: "destructive" });
    },
  });

  const audioUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("audio", file);
      const res = await fetch(`/api/user/lessons/${lessonId}/whisper-audio-upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: "Xatolik yuz berdi" }));
        throw new Error(errData.message || `Server xatolik: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.transcript) {
        setTranscriptPreview(data.transcript);
        setTranscriptSource("whisper");
        setSentenceCount(0);
        if (data.lesson?.subtitlesJson && Array.isArray(data.lesson.subtitlesJson)) {
          setWhisperSubtitles(data.lesson.subtitlesJson as { startTime: number; endTime: number; text: string }[]);
        }
        setStep("transcript-ready");
        queryClient.invalidateQueries({ queryKey: ["/api/user/lessons", lessonId] });
        toast({ title: "Audio transkripsiya tayyor!", description: `${data.wordCount} ta so'z aniqlandi` });
      } else {
        toast({ title: "Xatolik", description: "Whisper natija bermadi", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      setStep("no-transcript");
      toast({ title: "Audio transkripsiya xatolik", description: error.message, variant: "destructive" });
    },
  });

  function attemptWhisper() {
    setStep("extracting");
    whisperMutation.mutate();
  }

  function handleAudioUpload() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*,.mp3,.wav,.ogg,.m4a,.mp4";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        if (file.size > 50 * 1024 * 1024) {
          toast({ title: "Fayl juda katta", description: "Maksimal hajm 50MB", variant: "destructive" });
          return;
        }
        setStep("extracting");
        audioUploadMutation.mutate(file);
      }
    };
    input.click();
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

        {step === "extracting" && <ExtractingState isWhisper={whisperMutation.isPending || audioUploadMutation.isPending} />}
        {step === "no-transcript" && (
          <NoTranscriptState
            onRetry={attemptAutoExtract}
            onManual={() => setStep("manual-input")}
            onDemo={useDemo}
            onWhisper={attemptWhisper}
            onAudioUpload={handleAudioUpload}
            onChatGptWorkflow={() => setStep("chatgpt-workflow")}
            isRetrying={transcriptMutation.isPending}
            isWhispering={whisperMutation.isPending}
            isUploadingAudio={audioUploadMutation.isPending}
          />
        )}
        {step === "chatgpt-workflow" && (
          <ChatGptWorkflowState
            targetLanguage={lesson.targetLanguage || "ar"}
            jsonText={jsonImportText}
            onJsonChange={setJsonImportText}
            onSubmit={() => importMutation.mutate()}
            onBack={() => setStep("no-transcript")}
            isPending={importMutation.isPending}
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
            subtitlesJson={whisperSubtitles || lesson.subtitlesJson as { startTime: number; endTime: number; text: string }[] | null}
            targetLanguage={lesson.targetLanguage || "ar"}
            manualTranscript={lesson.manualTranscript || ""}
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
            subtitlesJson={whisperSubtitles || lesson.subtitlesJson as { startTime: number; endTime: number; text: string }[] | null}
            transcriptSource={transcriptSource}
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
      if (["loading", "extracting", "no-transcript", "manual-input", "chatgpt-workflow"].includes(step)) return "active";
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
  onAudioUpload,
  onChatGptWorkflow,
  isRetrying,
  isWhispering,
  isUploadingAudio,
}: {
  onRetry: () => void;
  onManual: () => void;
  onDemo: () => void;
  onWhisper: () => void;
  onAudioUpload: () => void;
  onChatGptWorkflow: () => void;
  isRetrying: boolean;
  isWhispering: boolean;
  isUploadingAudio: boolean;
}) {
  const [showMore, setShowMore] = useState(false);

  return (
    <Card className="glass border-orange-500/20" data-testid="card-no-transcript">
      <CardContent className="p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/10 to-amber-500/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-orange-400" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Bu videoda subtitle topilmadi</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Quyidagi usullardan birini tanlang
          </p>
        </div>

        <div className="space-y-3">
          <Button
            className="w-full justify-start gap-3 h-auto py-5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
            onClick={onChatGptWorkflow}
            data-testid="button-chatgpt-workflow"
          >
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <MessageSquareText className="w-6 h-6" />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">ChatGPT bilan dars yaratish</p>
                <Badge className="bg-white/20 text-white text-[9px] px-1.5 py-0 border-0">TAVSIYA</Badge>
              </div>
              <p className="text-xs text-white/80 mt-0.5">Bepul va tez — audio + prompt = tayyor dars!</p>
            </div>
          </Button>

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
            variant="ghost"
            className="w-full justify-center gap-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowMore(!showMore)}
            data-testid="button-show-more-options"
          >
            {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showMore ? "Boshqa usullarni yashirish" : "Boshqa usullar (Whisper, Audio yuklash)"}
          </Button>

          {showMore && (
            <div className="space-y-3 pt-1">
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-4 px-4 border-amber-500/20 hover:border-amber-500/40"
                onClick={onWhisper}
                disabled={isWhispering || isUploadingAudio}
                data-testid="button-whisper-transcript"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  {isWhispering ? <Loader2 className="w-5 h-5 text-amber-400 animate-spin" /> : <AudioWaveform className="w-5 h-5 text-amber-400" />}
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">Whisper AI bilan transkripsiya</p>
                  <p className="text-xs text-muted-foreground">YouTube'dan audio yuklab Whisper tahlil qiladi (API pullik)</p>
                </div>
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-4 px-4 border-cyan-500/20 hover:border-cyan-500/40"
                onClick={onAudioUpload}
                disabled={isWhispering || isUploadingAudio}
                data-testid="button-audio-upload"
              >
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                  {isUploadingAudio ? <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" /> : <Upload className="w-5 h-5 text-cyan-400" />}
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">Audio fayl yuklash</p>
                  <p className="text-xs text-muted-foreground">O'zingiz yuklab olgan audio faylni Whisper'ga yuborish (API pullik)</p>
                </div>
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3 px-4"
                onClick={onDemo}
                data-testid="button-demo-transcript"
              >
                <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
                  <BookOpenCheck className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-medium text-muted-foreground">Demo matndan foydalanish</p>
                </div>
              </Button>
            </div>
          )}
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
  subtitlesJson,
  targetLanguage,
  manualTranscript,
}: {
  preview: string;
  source: string;
  sentenceCount: number;
  onGenerate: () => void;
  onJsonImport: () => void;
  subtitlesJson?: { startTime: number; endTime: number; text: string }[] | null;
  targetLanguage: string;
  manualTranscript: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const sourceLabels: Record<string, string> = {
    auto: "Avtomatik",
    manual: "Qo'lda kiritilgan",
    demo: "Demo matn",
    whisper: "Whisper AI",
  };

  const isWhisperSource = source === "whisper";
  const chatGptPrompt = buildChatGptPrompt(preview, manualTranscript, targetLanguage, subtitlesJson, isWhisperSource);

  function copyPrompt() {
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

  return (
    <Card className="glass border-emerald-500/20" data-testid="card-transcript-ready">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold">Transkript tayyor</h3>
            <p className="text-xs text-muted-foreground">
              {isWhisperSource ? "Whisper AI orqali aniqlangan" : "Generatsiya uchun tayyor"}
            </p>
          </div>
          <Badge variant="outline" className={`text-xs ${isWhisperSource ? "border-amber-500/30 text-amber-400" : ""}`}>
            {sourceLabels[source] || source}
          </Badge>
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
          {subtitlesJson && subtitlesJson.length > 0 && (
            <>
              <span>·</span>
              <span>{subtitlesJson.length} segment</span>
            </>
          )}
        </div>

        {isWhisperSource && (
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 space-y-2">
            <p className="text-xs font-medium text-amber-400">Tavsiya etiladigan usul:</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Quyidagi prompt ni nusxalang</li>
              <li>ChatGPT (chat.openai.com) ga oching va joylashtiring</li>
              <li>ChatGPT javobidagi JSON ni ko'chiring</li>
              <li>"ChatGPT natijasini import qilish" tugmasini bosing</li>
            </ol>
          </div>
        )}

        <div className="space-y-2">
          <Button
            variant={isWhisperSource ? "outline" : "default"}
            className={`w-full gap-2 ${isWhisperSource ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10" : ""}`}
            size="lg"
            onClick={() => setShowPrompt(!showPrompt)}
            data-testid="button-show-prompt"
          >
            <FileText className="w-4 h-4" />
            {showPrompt ? "Prompt ni yashirish" : "ChatGPT uchun prompt ko'rish"}
          </Button>

          {showPrompt && (
            <div className="space-y-2">
              <div className="rounded-lg bg-muted/30 border border-border/50 p-3 max-h-60 overflow-y-auto">
                <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">{chatGptPrompt}</pre>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="w-full gap-1.5 text-xs"
                onClick={copyPrompt}
                data-testid="button-copy-prompt"
              >
                <Copy className="w-3.5 h-3.5" />
                {copied ? "Nusxalandi!" : "Prompt ni nusxalash"}
              </Button>
            </div>
          )}

          <Button
            className="w-full gap-2"
            size="lg"
            variant={isWhisperSource ? "default" : "outline"}
            onClick={onJsonImport}
            data-testid="button-json-import"
          >
            <ClipboardPaste className="w-4 h-4" /> ChatGPT natijasini import qilish
          </Button>

          <Button
            className="w-full gap-2"
            size="lg"
            variant={isWhisperSource ? "outline" : "default"}
            onClick={onGenerate}
            data-testid="button-generate-ai"
          >
            <Wand2 className="w-4 h-4" /> {isWhisperSource ? "AI bilan dars yaratish (coin sarflaydi)" : "Dars yaratish"}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center">
          {isWhisperSource
            ? "ChatGPT Plus dan foydalaning — xarajat tejaysiz va sifat yaxshiroq"
            : "Xarajatni tejash uchun ChatGPT da tayyor shablon bilan ishlang"}
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

function formatSecondsToTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function buildChatGptPrompt(
  transcript: string,
  manualTranscript: string,
  targetLanguage: string = "ar",
  subtitlesJson?: { startTime: number; endTime: number; text: string }[] | null,
  isWhisperSource: boolean = false,
): string {
  let timedLines: { time: string; text: string }[] = [];

  if (isWhisperSource && subtitlesJson && subtitlesJson.length > 0) {
    timedLines = subtitlesJson.map(s => ({
      time: `${formatSecondsToTime(s.startTime)}-${formatSecondsToTime(s.endTime)}`,
      text: s.text,
    }));
  } else if (manualTranscript) {
    timedLines = extractTimedLines(manualTranscript);
  }

  const hasTiming = timedLines.length > 0;
  const isWhisperSegments = isWhisperSource && !!(subtitlesJson && subtitlesJson.length > 0);

  const arabTimedSection = hasTiming
    ? `\nMUHIM: Quyida har bir qator VAQT bilan berilgan. sentenceAnalysis da "sentence" maydoni AYNAN shu qatordagi matnni o'z ichiga olishi SHART. Gaplarni birlashtirma, bo'lma — har bir vaqtli qatorni alohida tahlil qil!\n\nVAQTLI GAPLAR RO'YXATI:\n${timedLines.map((l, i) => `${i + 1}. [${l.time}] ${l.text}`).join("\n")}\n`
    : "";

  const englishTimedSection = hasTiming
    ? (isWhisperSegments
      ? `\nMUHIM: Quyida har bir qator VAQT bilan berilgan. sentenceAnalysis da "sentence" maydoni AYNAN shu qatordagi matnni o'z ichiga olishi SHART. Gaplarni birlashtirma, bo'lma — har bir vaqtli qatorni alohida tahlil qil!
- Har bir qator uchun alohida sentenceAnalysis yozilishi SHART
- "lineIndices" maydoniga shu qatorning raqamini yoz (0 dan boshlab)
- "translation" maydoni AYNAN shu gapdagi mazmunni tarjima qilsin
- wordMap: gapdagi HAR BIR so'z tahlili

VAQTLI GAPLAR RO'YXATI:\n${timedLines.map((l, i) => `${i}. [${l.time}] ${l.text}`).join("\n")}\n`
      : `\nMUHIM: Quyida har bir qator VAQT bilan berilgan. Sen bu qatorlarni KETMA-KET GAPLARGA BIRLASHTIRIB tahlil qilishing kerak.
- Qisqa qatorlarni bitta gapga birlashtirib yoz — LEKIN asl matnni O'ZGARTIRMA, faqat ketma-ket qatorlarni ulashtirib yoz!
- NOTO'G'RI: Mazmunni qayta yozish, so'zlarni almashtirish, boshqa qatordagi mazmunni qo'shish
- TO'G'RI: Qatorlarni AYNAN asl holatida birlashtirish (masalan: qator 3 matni + " " + qator 4 matni)
- Har bir birlashtirilgan gap uchun "lineIndices" maydoniga qaysi qator raqamlari kiritilganini yoz (0 dan boshlab)
- MUHIM CHEGARA: Har bir gap MAKSIMUM 12-18 SO'ZDAN iborat bo'lsin!
- Agar tabiiy gap 18 so'zdan uzun bo'lsa, uni 2 ta alohida gapga BO'L (vergul, "where", "which", "and", "but" joylarida bo'lish mumkin)
- HECH QACHON 20 so'zdan uzun gap yaratma!
- "translation" maydoni AYNAN shu birlashtirilgan gapdagi mazmunni tarjima qilsin — BOSHQA gaplar mazmunini qo'shma!

VAQTLI GAPLAR RO'YXATI:\n${timedLines.map((l, i) => `${i}. [${l.time}] ${l.text}`).join("\n")}\n`)
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
      "sentence": "${isWhisperSegments ? "AYNAN vaqtli ro'yxatdagi matn — o'zgartirma!" : "ketma-ket qatorlar matnini AYNAN asl holatida birlashtirgan gap (QAYTA YOZMA!)"}",
      "translation": "O'ZBEKCHA tarjima — AYNAN shu gap mazmunini tarjima qil",${hasTiming ? '\n      "lineIndices": ' + (isWhisperSegments ? '[0],' : '[0, 1, 2],') : ""}
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

${isWhisperSegments ? `## 4. SENTENCEANALYSIS — ENG MUHIM
- Har bir vaqtli qator uchun ALOHIDA sentenceAnalysis yozilishi SHART
- "sentence" maydoni AYNAN vaqtli ro'yxatdagi matn bo'lishi kerak — O'ZGARTIRMA, BIRLASHTIRMA, BO'LMA!
- Har bir gap uchun TO'LIQ O'ZBEKCHA tarjima yoz
- wordMap: gapdagi HAR BIR so'z tahlili — so'z tashlab ketish MUMKIN EMAS
- Har bir so'z uchun faqat 3 ta maydon: word (asl shakl), normalized (asosiy shakl), translationUz (o'zbekcha)
- "lineIndices": bu gap qaysi vaqtli qator raqamiga mos kelishini ko'rsatadi (0 dan boshlab). Har bir gap faqat BITTA lineIndex ga ega bo'ladi.
- BARCHA qatorlar qamrab olinishi SHART — BIRONTASINI HAM TASHLAB KETMA!` : `## 4. SENTENCEANALYSIS — ENG MUHIM
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
${hasTiming ? '- "lineIndices": bu gap qaysi vaqtli qator raqamlarini o\'z ichiga olishini ko\'rsatadi (0 dan boshlab). BARCHA qatorlar qamrab olinishi SHART!' : ""}`}

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

function buildFullAudioPrompt(targetLanguage: string = "ar"): string {
  if (targetLanguage === "en") {
    return `# MAJBURIY BUYRUQ — O'QIMASDAN O'TMA!
Sen audio faylni eshitishing va 100% ANIQ transkripsiya qilishing SHART.
BO'SH JAVOB BERISH MUTLAQO TA'QIQLANGAN. Agar bo'sh subtitles, vocabulary yoki quizzes massiv qaytarsang — bu XATO hisoblanadi.

QABUL QILINMAYDIGAN javoblar:
- "audio faylni eshitib bo'lmadi" — TA'QIQLANGAN
- "transkripsiya qilib bo'lmadi" — TA'QIQLANGAN
- "muhitda imkon yo'q" — TA'QIQLANGAN
- bo'sh [] massivlar — TA'QIQLANGAN

SEN AUDIO FAYLNI ESHITA OLASAN. Sen GPT-4o modeli sifatida audio fayllarni qayta ishlay olasan. Shuning uchun ALBATTA eshit va 100% ANIQ transkripsiya qil. Har bir so'zni AYNAN eshitganingdek yoz. UYDIRIB YOZMA, lekin eshitganingni ANIQ yoz.

Sen ingliz tili professorisin. Audio faylni eshitib:
1) 100% ANIQ transkripsiya qil — HAR BIR SO'Z uchun ALOHIDA TIMING bilan
2) Transkripsiya asosida to'liq dars materiallari yarat (vocabulary, quizzes, sentenceAnalysis)

Barcha tarjimalar O'ZBEK tilida bo'lsin.

═══════════════════════════════════════════════════════════
⏱️ TIMING ANIQLIGI — ENG MUHIM QISM! BU QISMNI DIQQAT BILAN O'QI!
═══════════════════════════════════════════════════════════

TIMING 100% TO'G'RI BO'LISHI SHART. Subtitle videodagi audioga sinxronlanishi SHART — 1-2 soniya ham farq bo'lmasligi kerak!

IKKI DARAJALI TIMING KERAK:
A) GAP DARAJASI (subtitles) — har bir gapning boshlanish va tugash vaqti
B) SO'Z DARAJASI (wordTimings) — gapdagi HAR BIR SO'ZNING boshlanish va tugash vaqti

GAP TIMING QOIDALARI:
1. startTime = gap BOSHLANGANIDAGI ANIQ soniya
2. endTime = gap TUGAGANIDAGI ANIQ soniya
3. TAXMINIY VAQT YOZMA! Agar gap 0:45 da boshlansa — 45.0 yoz, 47 yoki 43 yozma!
4. Gaplar orasidagi pauzani hisobga ol
5. Musiqa/jimlik: {"startTime": 24.0, "endTime": 26.0, "text": "[Music]"}
6. TENG ORALIQLAR TA'QIQLANGAN!
7. O'nlik kasrlar ishlat: 45.3, 112.7

SO'Z TIMING QOIDALARI:
1. wordTimings massivida gapdagi HAR BIR so'z uchun alohida {word, startTime, endTime}
2. Birinchi so'zning startTime = gap startTime
3. Oxirgi so'zning endTime = gap endTime
4. So'zlar ketma-ket
5. Agar aniq vaqtni bila olmasang — gap davomiyligini so'zlar soniga teng bo'lib taqsimla

TIMING TEKSHIRISH USULI (ALBATTA TEKSHIR!):
- Audio 3 daqiqa (180 sek) bo'lsa — oxirgi endTime 175-180 atrofida bo'lishi kerak
- Oxirgi endTime bilan audio uzunligi orasidagi farq 10 soniyadan oshmasin!
- Teng oraliqlar bo'lsa — QAYTADAN ESHIT!

MISOL (NOTO'G'RI):
❌ Teng 10 soniyalik oraliqlar
❌ Audio 200 sek, oxirgi endTime 130 sek

MISOL (TO'G'RI):
✅ {
    "startTime": 0.0, "endTime": 4.2,
    "text": "Hello everyone, welcome to today's lesson.",
    "wordTimings": [
      {"word": "Hello", "startTime": 0.0, "endTime": 0.5},
      {"word": "everyone", "startTime": 0.5, "endTime": 1.2},
      {"word": "welcome", "startTime": 1.3, "endTime": 1.9},
      {"word": "to", "startTime": 1.9, "endTime": 2.1},
      {"word": "today's", "startTime": 2.1, "endTime": 2.8},
      {"word": "lesson", "startTime": 2.8, "endTime": 4.2}
    ]
  }

═══════════════════════════════════════════════════════════

KERAK EMAS (YOZMA!):
- flashcards — KERAK EMAS
- translationAr — KERAK EMAS
- grammarNotes, keyWords, contextualMeaning — KERAK EMAS

FAQAT JSON formatda javob ber — hech qanday boshqa matn, izoh, markdown YOZMA. { dan boshlab } gacha.

{
  "subtitles": [
    {
      "startTime": 0.0,
      "endTime": 4.2,
      "text": "Hello everyone, welcome to today's lesson.",
      "wordTimings": [
        {"word": "Hello", "startTime": 0.0, "endTime": 0.5},
        {"word": "everyone", "startTime": 0.5, "endTime": 1.2},
        {"word": "welcome", "startTime": 1.3, "endTime": 1.9},
        {"word": "to", "startTime": 1.9, "endTime": 2.1},
        {"word": "today's", "startTime": 2.1, "endTime": 2.8},
        {"word": "lesson", "startTime": 2.8, "endTime": 4.2}
      ]
    }
  ],
  "summaryShort": "2-3 gap, O'ZBEKCHA",
  "summaryDetailed": "5-8 gap, O'ZBEKCHA",
  "vocabulary": [
    {
      "word": "inglizcha so'z",
      "translation": "O'ZBEKCHA tarjima",
      "partOfSpeech": "noun/verb/adj/adv",
      "example": "transkriptdan misol gap",
      "difficulty": "easy/medium/hard"
    }
  ],
  "quizzes": [
    {
      "question": "O'ZBEKCHA savol",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "O'ZBEKCHA tushuntirish",
      "type": "multiple_choice"
    },
    {
      "question": "I _____ to school yesterday",
      "options": ["go", "went", "gone", "going"],
      "correctIndex": 1,
      "explanation": "went — Past Simple",
      "type": "sentence_completion"
    },
    {
      "question": "accomplish",
      "options": ["bajarmoq", "o'qimoq", "yozmoq", "bormoq"],
      "correctIndex": 0,
      "explanation": "accomplish — bajarmoq",
      "type": "word_translation"
    }
  ],
  "sentenceAnalysis": [
    {
      "sentence": "Hello everyone, welcome to today's lesson.",
      "translation": "Hammaga salom, bugungi darsga xush kelibsiz.",
      "lineIndices": [0],
      "wordMap": [
        {"word": "Hello", "normalized": "hello", "translationUz": "salom"},
        {"word": "everyone", "normalized": "everyone", "translationUz": "hamma"},
        {"word": "welcome", "normalized": "welcome", "translationUz": "xush kelibsiz"},
        {"word": "to", "normalized": "to", "translationUz": "...ga"},
        {"word": "today's", "normalized": "today", "translationUz": "bugungi"},
        {"word": "lesson", "normalized": "lesson", "translationUz": "dars"}
      ]
    }
  ]
}

QOIDALAR:
1. SUBTITLES: HAR BIR gapni 100% ANIQ yoz. startTime/endTime REAL vaqtlar! wordTimings — HAR BIR SO'Z uchun alohida timing! Bo'sh [] TA'QIQLANGAN!
2. ⏱️ TIMING: GAP va SO'Z darajasida ANIQ vaqtlar. TAXMINIY VAQT TA'QIQLANGAN! TENG ORALIQLAR TA'QIQLANGAN! Yozib bo'lgach TEKSHIR: oxirgi endTime audio uzunligiga yaqin bo'lishi kerak!
3. VOCABULARY: 8-15 ta. "translation" O'ZBEK tilida.
4. QUIZZES: 10-12 ta. 3 tur aralash: multiple_choice (4-5), sentence_completion (3-4), word_translation (3-4).
5. SENTENCEANALYSIS: HAR BIR subtitle uchun BITTA element. "sentence" = subtitles dagi AYNAN O'SHA MATN. "translation" = O'ZBEKCHA. lineIndices = [idx] — faqat O'Z RAQAMI. wordMap: HAR BIR so'z — "word", "normalized", "translationUz".
6. lineIndices: sentenceAnalysis[0].lineIndices=[0], [1].lineIndices=[1]... OVERLAP TA'QIQLANGAN!
7. KERAK EMAS: flashcards, translationAr, grammarNotes, keyWords, contextualMeaning — YOZMA!
8. correctIndex: 0 dan boshlanadi. JSON VALID bo'lsin.

YAKUNIY OGOHLANTIRISH: Bo'sh massiv QAYTARMA! TIMING NOTO'G'RI BO'LSA — QAYTADAN ESHIT! Har bir SO'ZGA timing ber!`;
  }

  return `# MAJBURIY BUYRUQ — O'QIMASDAN O'TMA!
Sen audio faylni eshitishing va 100% ANIQ transkripsiya qilishing SHART.
BO'SH JAVOB BERISH MUTLAQO TA'QIQLANGAN. Agar bo'sh subtitles, vocabulary yoki quizzes massiv qaytarsang — bu XATO hisoblanadi.

QABUL QILINMAYDIGAN javoblar:
- "audio faylni eshitib bo'lmadi" — TA'QIQLANGAN
- "transkripsiya qilib bo'lmadi" — TA'QIQLANGAN
- "muhitda imkon yo'q" — TA'QIQLANGAN
- bo'sh [] massivlar — TA'QIQLANGAN
- "noto'g'ri transcript uydirib bermaslik uchun" — TA'QIQLANGAN

SEN AUDIO FAYLNI ESHITA OLASAN. Sen GPT-4o modeli sifatida audio fayllarni qayta ishlay olasan. Shuning uchun ALBATTA eshit va 100% ANIQ transkripsiya qil. Har bir so'zni AYNAN eshitganingdek yoz. UYDIRIB YOZMA, lekin eshitganingni ANIQ yoz.

Sen arab tili professorisin. Audio faylni eshitib:
1) 100% ANIQ transkripsiya qil — HAR BIR SO'Z uchun ALOHIDA TIMING bilan
2) Transkripsiya asosida to'liq dars materiallari yarat (vocabulary, quizzes, sentenceAnalysis)

HARAKAT QOIDASI — QAT'IY: BARCHA arabcha so'zlar TO'LIQ HARAKAT bilan yozilishi SHART.
TO'G'RI: ذَهَبَ الْوَلَدُ إِلَى الْمَدْرَسَةِ
NOTO'G'RI: ذهب الولد الى المدرسة

Barcha tarjimalar (translation, translationUz) O'ZBEK tilida bo'lsin.

═══════════════════════════════════════════════════════════
⏱️ TIMING ANIQLIGI — ENG MUHIM QISM! BU QISMNI DIQQAT BILAN O'QI!
═══════════════════════════════════════════════════════════

TIMING 100% TO'G'RI BO'LISHI SHART. Subtitle videodagi audioga sinxronlanishi SHART — 1-2 soniya ham farq bo'lmasligi kerak!

IKKI DARAJALI TIMING KERAK:
A) GAP DARAJASI (subtitles) — har bir gapning boshlanish va tugash vaqti
B) SO'Z DARAJASI (wordTimings) — gapdagi HAR BIR SO'ZNING boshlanish va tugash vaqti

GAP TIMING QOIDALARI:
1. startTime = gap BOSHLANGANIDAGI ANIQ soniya (birinchi so'z aytila boshlaganda)
2. endTime = gap TUGAGANIDAGI ANIQ soniya (oxirgi so'z aytilgandan keyin)
3. TAXMINIY VAQT YOZMA! Agar gap 0:45 da boshlansa — 45.0 yoz, 47 yoki 43 yozma!
4. Gaplar orasidagi pauzani hisobga ol
5. Musiqa/jimlik qismlarini ham yoz: {"startTime": 24.0, "endTime": 26.0, "text": "[مُوسِيقَى]"}
6. TENG ORALIQLAR TA'QIQLANGAN (har 10 sekund emas!)
7. O'nlik kasrlar ishlat: 45.3, 112.7

SO'Z TIMING QOIDALARI:
1. wordTimings massivida gapdagi HAR BIR so'z uchun alohida {word, startTime, endTime} bo'lsin
2. Birinchi so'zning startTime = gap startTime bilan bir xil yoki juda yaqin
3. Oxirgi so'zning endTime = gap endTime bilan bir xil yoki juda yaqin
4. So'zlar ketma-ket: birinchi so'z tugagach ikkinchisi boshlanadi
5. Agar aniq vaqtni bila olmasang — gap davomiyligini so'zlar soniga teng bo'lib taqsimla

TIMING TEKSHIRISH USULI (ALBATTA TEKSHIR!):
- Audio 3 daqiqa (180 sek) bo'lsa — oxirgi subtitle endTime 175-180 atrofida bo'lishi kerak
- Agar audio 3 daqiqa, lekin oxirgi endTime 120 sek bo'lsa — TIMING NOTO'G'RI!
- Oxirgi endTime bilan audio uzunligi orasidagi farq 10 soniyadan oshmasin!
- Teng oraliqlar bo'lsa — QAYTADAN ESHIT va TO'G'RILA!

MISOL (NOTO'G'RI):
❌ {"startTime": 0, "endTime": 10, "text": "...", "wordTimings": []}
❌ Teng 10 soniyalik oraliqlar
❌ Audio 200 sek, oxirgi endTime 130 sek

MISOL (TO'G'RI):
✅ {
    "startTime": 0.0, "endTime": 5.3,
    "text": "مَا أَصْعَبَ أَنْ تَكُونَ حِمَارًا.",
    "wordTimings": [
      {"word": "مَا", "startTime": 0.0, "endTime": 0.4},
      {"word": "أَصْعَبَ", "startTime": 0.4, "endTime": 1.2},
      {"word": "أَنْ", "startTime": 1.2, "endTime": 1.5},
      {"word": "تَكُونَ", "startTime": 1.5, "endTime": 2.8},
      {"word": "حِمَارًا", "startTime": 2.8, "endTime": 5.3}
    ]
  }

═══════════════════════════════════════════════════════════

KERAK EMAS (YOZMA!):
- translationAr — arabcha sinonim/izoh KERAK EMAS
- flashcards — KERAK EMAS
- summaryShortAr, summaryDetailedAr — KERAK EMAS
- grammarNotes — KERAK EMAS
- keyWords — KERAK EMAS
- contextualMeaning — KERAK EMAS

FAQAT JSON formatda javob ber — hech qanday boshqa matn, izoh, markdown YOZMA. { dan boshlab } gacha.

{
  "subtitles": [
    {
      "startTime": 0.0,
      "endTime": 5.3,
      "text": "مَا أَصْعَبَ أَنْ تَكُونَ حِمَارًا.",
      "wordTimings": [
        {"word": "مَا", "startTime": 0.0, "endTime": 0.4},
        {"word": "أَصْعَبَ", "startTime": 0.4, "endTime": 1.2},
        {"word": "أَنْ", "startTime": 1.2, "endTime": 1.5},
        {"word": "تَكُونَ", "startTime": 1.5, "endTime": 2.8},
        {"word": "حِمَارًا", "startTime": 2.8, "endTime": 5.3}
      ]
    }
  ],
  "summaryShort": "2-3 gap, O'ZBEKCHA",
  "summaryDetailed": "5-8 gap, O'ZBEKCHA",
  "vocabulary": [
    {
      "word": "مُعَلِّمٌ",
      "translation": "o'qituvchi",
      "partOfSpeech": "اِسْمٌ",
      "example": "transkriptdan misol gap HARAKAT bilan",
      "difficulty": "easy/medium/hard"
    }
  ],
  "quizzes": [
    {
      "question": "O'ZBEKCHA savol",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "O'ZBEKCHA tushuntirish",
      "type": "multiple_choice"
    },
    {
      "question": "هَذَا _____ جَمِيلٌ",
      "options": ["بَيْتٌ", "كِتَابٌ", "وَلَدٌ", "قَلَمٌ"],
      "correctIndex": 0,
      "explanation": "بَيْتٌ — uy",
      "type": "sentence_completion"
    },
    {
      "question": "كَتَبَ",
      "options": ["o'qidi", "yozdi", "bordi", "keldi"],
      "correctIndex": 1,
      "explanation": "كَتَبَ — yozmoq",
      "type": "word_translation"
    }
  ],
  "sentenceAnalysis": [
    {
      "sentence": "مَا أَصْعَبَ أَنْ تَكُونَ حِمَارًا.",
      "translation": "Eshak bo'lish qanchalik qiyin!",
      "lineIndices": [0],
      "wordMap": [
        {"word": "مَا", "normalized": "ما", "translationUz": "qanchalik"},
        {"word": "أَصْعَبَ", "normalized": "اصعب", "translationUz": "qiyin"},
        {"word": "أَنْ", "normalized": "ان", "translationUz": "...ni"},
        {"word": "تَكُونَ", "normalized": "تكون", "translationUz": "bo'lish"},
        {"word": "حِمَارًا", "normalized": "حمار", "translationUz": "eshak"}
      ]
    }
  ]
}

QOIDALAR:
1. SUBTITLES: Audiodagi HAR BIR gapni 100% ANIQ, TO'LIQ HARAKAT bilan yoz. startTime/endTime REAL vaqtlar! wordTimings — gapdagi HAR BIR SO'Z uchun alohida timing! Eng kam 3 ta subtitle. Bo'sh [] TA'QIQLANGAN!
2. ⏱️ TIMING: Har bir gapning va HAR BIR SO'ZNING BOSHLANISH/TUGASH vaqtini ANIQ eshitib yoz. TAXMINIY VAQT TA'QIQLANGAN! TENG ORALIQLAR TA'QIQLANGAN! O'nlik kasrlar ishlat (45.3, 112.7). Yozib bo'lgach — ALBATTA TEKSHIR: oxirgi endTime audio uzunligiga yaqin bo'lishi kerak!
3. HARAKAT: BARCHA arabcha so'zlarda TO'LIQ harakat bo'lishi SHART. Harakatsiz so'z QABUL QILINMAYDI.
4. VOCABULARY: 8-15 ta. HARAKAT bilan. "translation" O'ZBEK tilida. translationAr YOZMA!
5. QUIZZES: 10-12 ta. 3 tur aralash: multiple_choice (4-5), sentence_completion (3-4, gap o'rtasida _____), word_translation (3-4).
6. SENTENCEANALYSIS: HAR BIR subtitle uchun BITTA element. "sentence" = subtitles dagi AYNAN O'SHA MATN (harfma-harf bir xil!). "translation" = O'ZBEKCHA tarjima. lineIndices = [idx] — faqat O'Z RAQAMI. wordMap: gapdagi HAR BIR so'z — "word" (HARAKAT bilan), "normalized" (harakatsiz), "translationUz" (O'ZBEKCHA).
7. lineIndices: sentenceAnalysis[0].lineIndices=[0], sentenceAnalysis[1].lineIndices=[1]... OVERLAP TA'QIQLANGAN!
8. KERAK EMAS: flashcards, translationAr, summaryShortAr, summaryDetailedAr, grammarNotes, keyWords, contextualMeaning — BU MAYDONLARNI YOZMA!
9. correctIndex: 0 dan boshlanadi. JSON VALID bo'lsin.

YAKUNIY OGOHLANTIRISH: Bo'sh massiv QAYTARMA! TIMING NOTO'G'RI BO'LSA — QAYTADAN ESHIT! Har bir SO'ZGA timing ber!`;
}

function ChatGptWorkflowState({
  targetLanguage,
  jsonText,
  onJsonChange,
  onSubmit,
  onBack,
  isPending,
}: {
  targetLanguage: string;
  jsonText: string;
  onJsonChange: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  isPending: boolean;
}) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);

  const prompt = buildFullAudioPrompt(targetLanguage);

  function copyPrompt() {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = prompt;
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
      if (!Array.isArray(parsed.subtitles) || parsed.subtitles.length === 0) missing.push("subtitles (bo'sh!)");
      if (!parsed.summaryShort) missing.push("summaryShort");
      if (!parsed.summaryDetailed) missing.push("summaryDetailed");
      if (!Array.isArray(parsed.vocabulary) || parsed.vocabulary.length === 0) missing.push("vocabulary (bo'sh!)");
      if (!Array.isArray(parsed.sentenceAnalysis) || parsed.sentenceAnalysis.length === 0) missing.push("sentenceAnalysis (bo'sh!)");
      if (missing.length > 0) {
        const hasEmpty = missing.some(m => m.includes("bo'sh"));
        jsonError = hasEmpty
          ? "ChatGPT to'liq javob bermadi — qaytadan urinib ko'ring. Topilmadi: " + missing.join(", ")
          : `Topilmadi: ${missing.join(", ")}`;
      } else jsonValid = true;
    } catch {
      jsonError = "JSON formati noto'g'ri";
    }
  }

  return (
    <Card className="glass border-emerald-500/20" data-testid="card-chatgpt-workflow">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <MessageSquareText className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold">ChatGPT bilan dars yaratish</h3>
            <p className="text-xs text-muted-foreground">Bepul — API xarajatisiz to'liq dars yarating</p>
          </div>
        </div>

        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4 space-y-3">
          <p className="text-xs font-semibold text-emerald-400">Qadamlar:</p>
          <ol className="text-xs text-muted-foreground space-y-2.5 list-none">
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">1</span>
              <span>YouTube videosidan <strong>audio</strong> yuklab oling (har qanday YouTube to MP3 sayt orqali, masalan: y2mate.com)</span>
            </li>
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">2</span>
              <span>Quyidagi <strong>promptni nusxalang</strong> (pastdagi tugma)</span>
            </li>
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">3</span>
              <span>
                <a href="https://chat.openai.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300">
                  chat.openai.com
                </a>
                {" "}ga kiring, promptni joylashtiring va <strong>audio faylni biriktiring</strong>
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">4</span>
              <span>ChatGPT javobidagi <strong>JSON</strong>ni to'liq nusxalang</span>
            </li>
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">5</span>
              <span>Pastdagi maydonga <strong>joylashtiring</strong> va "Import" tugmasini bosing</span>
            </li>
          </ol>

          <div className="mt-2 rounded-md bg-yellow-500/5 border border-yellow-500/20 px-3 py-2">
            <p className="text-[10px] text-yellow-400/80">
              <strong>Maslahat:</strong> Agar ChatGPT bo'sh javob bersa — <strong>yangi chat</strong> oching, <strong>GPT-4o</strong> modelini tanlang va qaytadan yuboring. Audio fayl 25MB dan kichik bo'lishi kerak. Prompt 100% aniq transkripsiya talab qiladi — ChatGPT eshitganini AYNAN yozishi kerak.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full gap-2 text-xs border-emerald-500/20 hover:border-emerald-500/40"
            onClick={() => setShowPrompt(!showPrompt)}
            data-testid="button-toggle-audio-prompt"
          >
            <FileText className="w-3.5 h-3.5" />
            {showPrompt ? "Promptni yashirish" : "ChatGPT promptini ko'rish"}
          </Button>

          {showPrompt && (
            <div className="space-y-2">
              <div className="rounded-lg bg-muted/30 border border-border/50 p-3 max-h-60 overflow-y-auto">
                <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">{prompt}</pre>
              </div>
            </div>
          )}

          <Button
            variant="secondary"
            size="sm"
            className="w-full gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={copyPrompt}
            data-testid="button-copy-audio-prompt"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? "Nusxalandi!" : "Promptni nusxalash"}
          </Button>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">ChatGPT javobini bu yerga joylashtiring:</label>
          <Textarea
            placeholder='{"subtitles": [...], "summaryShort": "...", "vocabulary": [...], ...}'
            value={jsonText}
            onChange={(e) => onJsonChange(e.target.value)}
            className="min-h-[160px] bg-muted/30 border-border/50 text-xs font-mono"
            data-testid="textarea-chatgpt-json"
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
          <Button variant="outline" onClick={onBack} className="gap-1.5" data-testid="button-chatgpt-back">
            <ArrowLeft className="w-4 h-4" /> Orqaga
          </Button>
          <Button
            className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            disabled={!jsonValid || isPending}
            onClick={onSubmit}
            data-testid="button-chatgpt-import"
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

function JsonImportState({
  jsonText,
  onJsonChange,
  onSubmit,
  onBack,
  isPending,
  transcript,
  manualTranscript,
  targetLanguage,
  subtitlesJson,
  transcriptSource,
}: {
  jsonText: string;
  onJsonChange: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  isPending: boolean;
  transcript: string;
  manualTranscript: string;
  targetLanguage: string;
  subtitlesJson?: { startTime: number; endTime: number; text: string }[] | null;
  transcriptSource: string;
}) {
  const [showTemplate, setShowTemplate] = useState(false);
  const [copied, setCopied] = useState(false);

  const chatGptPrompt = buildChatGptPrompt(transcript, manualTranscript, targetLanguage, subtitlesJson, transcriptSource === "whisper");

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
