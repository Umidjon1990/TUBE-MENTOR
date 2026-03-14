import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Download,
  FileText,
  FileSpreadsheet,
  File,
  BookOpen,
  Languages,
  TextSelect,
  BookMarked,
  HelpCircle,
  Layers,
  ScrollText,
  CheckSquare,
} from "lucide-react";
import type {
  ExportConfig,
  ExportFormat,
  ExportSection,
  QuizMode,
  QuizCount,
  LessonExportData,
} from "@/lib/export-types";

const SECTION_OPTIONS: {
  key: ExportSection;
  label: string;
  icon: typeof BookOpen;
  color: string;
}[] = [
  { key: "arabText", label: "Arab matni", icon: BookOpen, color: "text-emerald-500" },
  { key: "uzTranslation", label: "O'zbek tarjimasi", icon: Languages, color: "text-blue-500" },
  { key: "wordByWord", label: "So'zma-so'z tarjima", icon: TextSelect, color: "text-amber-500" },
  { key: "vocabulary", label: "Lug'at", icon: BookMarked, color: "text-cyan-500" },
  { key: "quizzes", label: "Test savollari", icon: HelpCircle, color: "text-rose-500" },
  { key: "flashcards", label: "Flashkartalar", icon: Layers, color: "text-orange-500" },
  { key: "summary", label: "Xulosa", icon: ScrollText, color: "text-teal-500" },
];

const FORMAT_OPTIONS: {
  key: ExportFormat;
  label: string;
  description: string;
  icon: typeof FileText;
}[] = [
  { key: "pdf", label: "PDF", description: "Premium dizayn", icon: FileText },
  { key: "docx", label: "DOCX", description: "Word hujjat", icon: File },
  { key: "xlsx", label: "XLSX", description: "Excel jadval", icon: FileSpreadsheet },
];

const QUIZ_COUNTS: QuizCount[] = [5, 10, 15, 20];

interface ExportStudioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonData: LessonExportData | null;
  onExport: (config: ExportConfig) => void;
  isExporting?: boolean;
}

function estimatePages(config: ExportConfig, data: LessonExportData | null): number {
  if (!data) return 0;
  let pages = 0;
  if (config.sections.includes("arabText")) pages += Math.max(1, Math.ceil(data.sentences.length / 8));
  if (config.sections.includes("uzTranslation")) pages += Math.max(1, Math.ceil(data.sentences.length / 10));
  if (config.sections.includes("wordByWord")) pages += Math.max(1, Math.ceil(data.sentences.length / 4));
  if (config.sections.includes("vocabulary")) pages += Math.max(1, Math.ceil(data.vocabulary.length / 15));
  if (config.sections.includes("quizzes")) {
    const count = config.quizMode === "all" ? data.quizzes.length : Math.min(config.quizCount, data.quizzes.length);
    pages += Math.max(1, Math.ceil(count / 5));
  }
  if (config.sections.includes("flashcards")) pages += Math.max(1, Math.ceil(data.flashcards.length / 8));
  if (config.sections.includes("summary")) pages += 1;
  return pages;
}

function buildPreviewSummary(config: ExportConfig, data: LessonExportData | null): string[] {
  if (!data) return [];
  const items: string[] = [];
  if (config.sections.includes("arabText")) items.push(`${data.sentences.length} ta gap`);
  if (config.sections.includes("uzTranslation")) items.push("tarjima");
  if (config.sections.includes("wordByWord")) items.push("so'zma-so'z");
  if (config.sections.includes("vocabulary")) items.push(`${data.vocabulary.length} ta so'z`);
  if (config.sections.includes("quizzes")) {
    const count = config.quizMode === "all" ? data.quizzes.length : Math.min(config.quizCount, data.quizzes.length);
    items.push(`${count} ta test`);
  }
  if (config.sections.includes("flashcards")) items.push(`${data.flashcards.length} ta karta`);
  if (config.sections.includes("summary")) items.push("xulosa");
  return items;
}

export function ExportStudio({ open, onOpenChange, lessonData, onExport, isExporting }: ExportStudioProps) {
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [sections, setSections] = useState<ExportSection[]>([
    "arabText",
    "uzTranslation",
    "vocabulary",
    "quizzes",
    "summary",
  ]);
  const [quizMode, setQuizMode] = useState<QuizMode>("all");
  const [quizCount, setQuizCount] = useState<QuizCount>(10);
  const [quizWithAnswers, setQuizWithAnswers] = useState(true);

  const allSelected = sections.length === SECTION_OPTIONS.length;

  const config: ExportConfig = useMemo(
    () => ({ format, sections, quizMode, quizCount, quizWithAnswers }),
    [format, sections, quizMode, quizCount, quizWithAnswers]
  );

  const pageEstimate = useMemo(() => estimatePages(config, lessonData), [config, lessonData]);
  const previewItems = useMemo(() => buildPreviewSummary(config, lessonData), [config, lessonData]);

  function toggleSection(key: ExportSection) {
    setSections((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  }

  function toggleAll() {
    if (allSelected) {
      setSections([]);
    } else {
      setSections(SECTION_OPTIONS.map((o) => o.key));
    }
  }

  function handleFormatChange(newFormat: ExportFormat) {
    setFormat(newFormat);
    if (newFormat === "xlsx") {
      setSections(["vocabulary"]);
    }
  }

  function handleExport() {
    onExport(config);
  }

  const hasQuizSection = sections.includes("quizzes");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="dialog-export-studio">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap" data-testid="text-export-title">
            <Download className="text-muted-foreground" />
            Export Studio
          </DialogTitle>
          <DialogDescription>
            Dars materiallarini yuklab olish uchun bo'limlar va formatni tanlang
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-5 pr-3">
            <div>
              <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                <Label className="text-sm font-semibold">Bo'limlarni tanlang</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleAll}
                  data-testid="button-select-all"
                >
                  <CheckSquare className="mr-1" />
                  {allSelected ? "Bekor qilish" : "Barchasi"}
                </Button>
              </div>
              {format === "xlsx" && (
                <p className="text-xs text-muted-foreground mb-2">XLSX formatida faqat lug'at bo'limi eksport qilinadi.</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SECTION_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const checked = sections.includes(opt.key);
                  const disabled = format === "xlsx" && opt.key !== "vocabulary";
                  return (
                    <label
                      key={opt.key}
                      className={`flex items-center gap-2 rounded-md border p-2.5 ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover-elevate"}`}
                      data-testid={`checkbox-section-${opt.key}`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleSection(opt.key)}
                        disabled={disabled}
                      />
                      <Icon className={`${opt.color} shrink-0`} />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {hasQuizSection && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label className="text-sm font-semibold block">Test sozlamalari</Label>

                  <div className="flex items-center gap-6 flex-wrap">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Javoblar</Label>
                      <RadioGroup
                        value={quizWithAnswers ? "with" : "without"}
                        onValueChange={(v) => setQuizWithAnswers(v === "with")}
                        className="flex items-center gap-4"
                        data-testid="radio-quiz-answers"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="with" id="quiz-with-answers" />
                          <Label htmlFor="quiz-with-answers" className="cursor-pointer text-sm">Javobi bilan</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="without" id="quiz-without-answers" />
                          <Label htmlFor="quiz-without-answers" className="cursor-pointer text-sm">Javobisiz</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Savollar</Label>
                      <RadioGroup
                        value={quizMode}
                        onValueChange={(v) => setQuizMode(v as QuizMode)}
                        className="flex items-center gap-4"
                        data-testid="radio-quiz-mode"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="all" id="quiz-all" />
                          <Label htmlFor="quiz-all" className="cursor-pointer text-sm">Barchasi</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="random" id="quiz-random" />
                          <Label htmlFor="quiz-random" className="cursor-pointer text-sm">Tasodifiy</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </div>

                  {quizMode === "random" && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Savollar soni</Label>
                      <Select
                        value={String(quizCount)}
                        onValueChange={(v) => setQuizCount(Number(v) as QuizCount)}
                      >
                        <SelectTrigger className="w-32" data-testid="select-quiz-count">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {QUIZ_COUNTS.map((c) => (
                            <SelectItem key={c} value={String(c)}>
                              {c} ta
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </>
            )}

            <Separator />

            <div>
              <Label className="text-sm font-semibold mb-3 block">Format</Label>
              <div className="grid grid-cols-3 gap-2">
                {FORMAT_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = format === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => handleFormatChange(opt.key)}
                      className={`flex flex-col items-center gap-1 rounded-md border p-3 cursor-pointer transition-colors ${
                        selected
                          ? "border-primary bg-primary/5 dark:bg-primary/10"
                          : "hover-elevate"
                      }`}
                      data-testid={`button-format-${opt.key}`}
                    >
                      <Icon className={selected ? "text-primary" : "text-muted-foreground"} />
                      <span className="text-sm font-medium">{opt.label}</span>
                      <span className="text-xs text-muted-foreground">{opt.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {sections.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-sm font-semibold block">Natija ko'rinishi</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {previewItems.map((item, i) => (
                      <Badge key={i} variant="secondary" className="no-default-active-elevate">
                        {item}
                      </Badge>
                    ))}
                  </div>
                  {format === "pdf" && pageEstimate > 0 && (
                    <p className="text-xs text-muted-foreground" data-testid="text-page-estimate">
                      Taxminiy: ~{pageEstimate} sahifa
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-export"
          >
            Bekor qilish
          </Button>
          <Button
            onClick={handleExport}
            disabled={sections.length === 0 || isExporting}
            data-testid="button-download-export"
          >
            {isExporting ? (
              "Tayyorlanmoqda..."
            ) : (
              <>
                <Download className="mr-1" />
                Yuklab olish ({format.toUpperCase()})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
