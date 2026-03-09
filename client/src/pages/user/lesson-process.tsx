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
  ChevronRight, ArrowLeft, Zap, Wand2, Copy, Upload, ClipboardPaste
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Lesson } from "@shared/schema";

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
      toast({ title: "Dars tayyor!", description: "AI dars muvaffaqiyatli yaratildi" });
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
        parsed = JSON.parse(jsonImportText.trim());
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

        {step === "extracting" && <ExtractingState />}
        {step === "no-transcript" && (
          <NoTranscriptState
            onRetry={attemptAutoExtract}
            onManual={() => setStep("manual-input")}
            onDemo={useDemo}
            isRetrying={transcriptMutation.isPending}
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
    { key: "generate", label: "AI generatsiya", icon: Sparkles },
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

function ExtractingState() {
  return (
    <Card className="glass border-primary/20" data-testid="card-extracting">
      <CardContent className="p-8">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-cyan-500/10 flex items-center justify-center mb-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Transkript olinmoqda...</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            YouTube videosidan subtitle va transkript ma'lumotlari olinmoqda. Bu bir necha soniya davom etishi mumkin.
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
  isRetrying,
}: {
  onRetry: () => void;
  onManual: () => void;
  onDemo: () => void;
  isRetrying: boolean;
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
            <p className="text-xs text-muted-foreground">AI generatsiya uchun tayyor</p>
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
            <Wand2 className="w-4 h-4" /> AI bilan dars yaratish
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

function buildChatGptPrompt(transcript: string): string {
  return `Sen professional til o'qituvchisisan. Quyidagi YouTube video transkriptidan o'zbek tilidagi o'quvchilar uchun ta'limiy kontent yarat.

VAZIFA: Quyidagi transkriptni tahlil qilib, FAQAT JSON formatda javob ber. Boshqa hech narsa yozma — faqat { dan boshlab } gacha JSON.

QOIDALAR:
- Barcha "translation" va tushuntirish maydonlari O'ZBEK tilida bo'lishi SHART
- sentenceAnalysis: transkriptdagi BARCHA gaplarni tahlil qil, birontasini ham tashlab ketma!
- wordMap: har bir gapdagi BARCHA so'zlarning so'zma-so'z tarjimasi (hech birini tashlab ketma!)

JSON STRUKTURASI:
{
  "summaryShort": "Videoning qisqacha mazmuni (2-3 gap, O'ZBEK tilida)",
  "summaryDetailed": "Videoning batafsil mazmuni (5-8 gap, O'ZBEK tilida)",
  "summaryShortAr": "ملخص قصير بالعربية",
  "summaryDetailedAr": "ملخص تفصيلي بالعربية",
  "vocabulary": [
    {
      "word": "asl tildagi so'z",
      "translation": "O'ZBEKCHA tarjima",
      "translationAr": "arabcha tarjima",
      "partOfSpeech": "ism/fe'l/sifat/ravish",
      "example": "transkriptdan misol gap",
      "difficulty": "easy/medium/hard"
    }
  ],
  "phrases": [
    {
      "phrase": "asl tildagi ibora",
      "translation": "O'ZBEKCHA tarjima",
      "translationAr": "arabcha tarjima",
      "context": "qayerda ishlatiladi (o'zbekcha)"
    }
  ],
  "quizzes": [
    {
      "question": "O'ZBEK tilida savol",
      "options": ["variant A", "variant B", "variant C", "variant D"],
      "correctIndex": 0,
      "explanation": "O'ZBEK tilida tushuntirish",
      "type": "multiple_choice"
    }
  ],
  "flashcards": [
    {
      "front": "asl tildagi so'z/ibora",
      "back": "O'ZBEKCHA tarjima va tushuntirish",
      "backAr": "arabcha tarjima",
      "type": "vocabulary"
    }
  ],
  "sentenceAnalysis": [
    {
      "sentence": "transkriptdan gap (asl tilida)",
      "translation": "O'ZBEKCHA tarjima",
      "translationAr": "arabcha tarjima",
      "grammarNotes": "grammatik izoh (o'zbekcha)",
      "keyWords": ["kalit", "so'zlar"],
      "wordMap": [
        {
          "word": "asl so'z",
          "normalized": "kichik harfda",
          "translationUz": "o'zbekcha tarjima",
          "translationAr": "arabcha tarjima",
          "contextualMeaning": "gapdagi ma'nosi (o'zbekcha)"
        }
      ]
    }
  ]
}

MIQDOR:
- vocabulary: 8-15 ta so'z
- phrases: 4-8 ta ibora
- quizzes: 8-10 ta savol
- flashcards: 8-12 ta karta
- sentenceAnalysis: BARCHA gaplar (birontasini ham tashlab ketma!)

TRANSKRIPT:
${transcript}`;
}

function JsonImportState({
  jsonText,
  onJsonChange,
  onSubmit,
  onBack,
  isPending,
  transcript,
}: {
  jsonText: string;
  onJsonChange: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  isPending: boolean;
  transcript: string;
}) {
  const [showTemplate, setShowTemplate] = useState(false);
  const [copied, setCopied] = useState(false);

  const chatGptPrompt = buildChatGptPrompt(transcript);

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
      const parsed = JSON.parse(jsonText.trim());
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
          <h3 className="text-lg font-semibold mb-2">AI dars yaratmoqda</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            Sun'iy intellekt transkriptni tahlil qilib, interaktiv dars tayyorlamoqda
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
            AI dars tayyor. Endi darsni ko'rishingiz mumkin.
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
          <p className="text-sm text-muted-foreground mb-6">AI generatsiyada xatolik. Qayta urinib ko'ring.</p>
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
