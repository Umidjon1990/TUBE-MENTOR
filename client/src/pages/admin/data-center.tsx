import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/layouts/admin-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Database, Languages, BookOpen, Brain, Layers, MessageSquare,
  Download, FileSpreadsheet, FileText, ArrowUpDown, ArrowUp, ArrowDown,
  Globe, BookmarkPlus, Search, Filter, Sparkles
} from "lucide-react";
import { saveAs } from "file-saver";

interface DataStats {
  totalLessons: number;
  publishedLessons: number;
  totalWords: number;
  uniqueWords: number;
  totalSentences: number;
  totalQuizzes: number;
  totalPhrases: number;
  totalFlashcards: number;
  totalSavedWords: number;
}

interface VocabRow {
  lessonId: number;
  lessonTitle: string;
  lessonLevel: string;
  word: string;
  translation: string;
  translationAr: string;
  partOfSpeech: string;
  example: string;
  difficulty: string;
}

interface SentenceRow {
  lessonId: number;
  lessonTitle: string;
  index: number;
  sentence: string;
  translation: string;
  translationAr: string;
  grammarNotes: string;
  keyWords: string[];
  wordMapCount: number;
}

interface QuizRow {
  lessonId: number;
  lessonTitle: string;
  index: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  type: string;
}

interface PhraseRow {
  lessonId: number;
  lessonTitle: string;
  phrase: string;
  translation: string;
  translationAr: string;
  context: string;
}

interface FlashcardRow {
  lessonId: number;
  lessonTitle: string;
  front: string;
  back: string;
  backAr: string;
  type: string;
}

interface SavedWordRow {
  id: number;
  word: string;
  normalized: string;
  translationUz: string | null;
  translationAr: string | null;
  contextualMeaning: string | null;
  partOfSpeech: string | null;
  sourceSentence: string | null;
  isLearned: boolean;
  userName: string;
  lessonTitle: string;
  lessonId: number;
  createdAt: string;
}

interface WordMapRow {
  word: string;
  normalized: string;
  translationUz: string;
  translationAr: string;
  contextualMeaning: string;
  count: number;
  lessons: string[];
  lessonCount: number;
}

function isArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

const arabicStyle = (text: string) =>
  isArabic(text)
    ? { direction: "rtl" as const, fontFamily: "'Noto Naskh Arabic', 'Amiri', serif", lineHeight: "1.8" }
    : {};

type SortDir = "asc" | "desc";

function useSortable<T>(data: T[], defaultKey: keyof T) {
  const [sortKey, setSortKey] = useState<keyof T>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === (key as keyof T)) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key as keyof T);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 ml-1 text-primary" /> : <ArrowDown className="w-3 h-3 ml-1 text-primary" />;
  };

  return { sorted, toggleSort, SortIcon, sortKey, sortDir };
}

function generateCSV(headers: string[], rows: string[][]): Blob {
  const escape = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))];
  return new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
}

async function generateMultiSheetXLSX(sheets: { name: string; headers: string[]; rows: string[][] }[]): Promise<Blob> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    ws.addRow(sheet.headers);
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1a1a2e" } };
    ws.getRow(1).font = { bold: true, color: { argb: "FF00d4ff" } };
    sheet.rows.forEach(r => ws.addRow(r));
    sheet.headers.forEach((_, i) => { ws.getColumn(i + 1).width = 20; });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export default function AdminDataCenterPage() {
  const { data: stats, isLoading: statsLoading } = useQuery<DataStats>({
    queryKey: ["/api/admin/data/stats"],
  });

  const { data: lessons = [] } = useQuery<{ id: number; title: string }[]>({
    queryKey: ["/api/admin/lessons"],
  });

  const [lessonFilter, setLessonFilter] = useState<string>("all");
  const filterParam = lessonFilter !== "all" ? `?lessonId=${lessonFilter}` : "";

  const { data: vocabulary = [], isLoading: vocabLoading } = useQuery<VocabRow[]>({
    queryKey: ["/api/admin/data/vocabulary", filterParam],
    queryFn: () => fetch(`/api/admin/data/vocabulary${filterParam}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: sentences = [], isLoading: sentLoading } = useQuery<SentenceRow[]>({
    queryKey: ["/api/admin/data/sentences", filterParam],
    queryFn: () => fetch(`/api/admin/data/sentences${filterParam}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: quizzes = [], isLoading: quizLoading } = useQuery<QuizRow[]>({
    queryKey: ["/api/admin/data/quizzes", filterParam],
    queryFn: () => fetch(`/api/admin/data/quizzes${filterParam}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: phrases = [], isLoading: phraseLoading } = useQuery<PhraseRow[]>({
    queryKey: ["/api/admin/data/phrases", filterParam],
    queryFn: () => fetch(`/api/admin/data/phrases${filterParam}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: flashcards = [], isLoading: fcLoading } = useQuery<FlashcardRow[]>({
    queryKey: ["/api/admin/data/flashcards", filterParam],
    queryFn: () => fetch(`/api/admin/data/flashcards${filterParam}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: savedWords = [], isLoading: swLoading } = useQuery<SavedWordRow[]>({
    queryKey: ["/api/admin/data/saved-words", filterParam],
    queryFn: () => fetch(`/api/admin/data/saved-words${filterParam}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: wordMaps = [], isLoading: wmLoading } = useQuery<WordMapRow[]>({
    queryKey: ["/api/admin/data/wordmaps", filterParam],
    queryFn: () => fetch(`/api/admin/data/wordmaps${filterParam}`, { credentials: "include" }).then(r => r.json()),
  });

  const [search, setSearch] = useState("");

  const handleExportAll = async () => {
    const sheets = [
      {
        name: "So'zlar",
        headers: ["So'z", "Tarjima (UZ)", "Tarjima (AR)", "So'z turi", "Misol", "Daraja", "Dars", "Daraja"],
        rows: vocabulary.map(v => [v.word, v.translation, v.translationAr, v.partOfSpeech, v.example, v.difficulty, v.lessonTitle, v.lessonLevel]),
      },
      {
        name: "Gaplar",
        headers: ["Gap", "Tarjima (UZ)", "Tarjima (AR)", "Grammatika", "Kalit so'zlar", "Dars"],
        rows: sentences.map(s => [s.sentence, s.translation, s.translationAr, s.grammarNotes, (s.keyWords || []).join(", "), s.lessonTitle]),
      },
      {
        name: "Testlar",
        headers: ["Savol", "Variantlar", "To'g'ri javob", "Izoh", "Turi", "Dars"],
        rows: quizzes.map(q => [q.question, (q.options || []).join(" | "), q.options[q.correctIndex] || "", q.explanation, q.type, q.lessonTitle]),
      },
      {
        name: "Iboralar",
        headers: ["Ibora", "Tarjima (UZ)", "Tarjima (AR)", "Kontekst", "Dars"],
        rows: phrases.map(p => [p.phrase, p.translation, p.translationAr, p.context, p.lessonTitle]),
      },
      {
        name: "Kartochkalar",
        headers: ["Old tomon", "Orqa tomon (UZ)", "Orqa tomon (AR)", "Turi", "Dars"],
        rows: flashcards.map(f => [f.front, f.back, f.backAr, f.type, f.lessonTitle]),
      },
      {
        name: "So'zma-so'z tarjima",
        headers: ["So'z", "Normalizatsiya", "Tarjima (UZ)", "Tarjima (AR)", "Kontekst ma'nosi", "Takrorlar", "Darslar soni", "Darslar"],
        rows: wordMaps.map(wm => [wm.word, wm.normalized, wm.translationUz, wm.translationAr, wm.contextualMeaning, String(wm.count), String(wm.lessonCount), wm.lessons.join(", ")]),
      },
      {
        name: "Saqlangan so'zlar",
        headers: ["So'z", "Tarjima (UZ)", "Tarjima (AR)", "So'z turi", "Kontekst", "Foydalanuvchi", "Dars", "O'rganilgan", "Sana"],
        rows: savedWords.map(sw => [sw.word, sw.translationUz || "", sw.translationAr || "", sw.partOfSpeech || "", sw.contextualMeaning || "", sw.userName, sw.lessonTitle, sw.isLearned ? "Ha" : "Yo'q", new Date(sw.createdAt).toLocaleDateString("uz-UZ")]),
      },
    ];
    const blob = await generateMultiSheetXLSX(sheets);
    saveAs(blob, `tube_mentor_data_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  return (
    <AdminLayout title="Ma'lumotlar markazi">
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-data-center-title">
              <Database className="w-6 h-6 text-primary" /> Ma'lumotlar markazi
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Barcha darslardan yig'ilgan til ma'lumotlarini ko'ring va yuklab oling</p>
          </div>
          <Button
            onClick={handleExportAll}
            className="gap-2"
            data-testid="button-export-all"
          >
            <Download className="w-4 h-4" /> Barcha ma'lumotlarni XLSX yuklab olish
          </Button>
        </div>

        {statsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3" data-testid="stats-grid">
            <Card className="glass border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-primary" data-testid="stat-unique-words">{stats.uniqueWords}</p>
                <p className="text-xs text-muted-foreground mt-1">Unikal so'zlar</p>
              </CardContent>
            </Card>
            <Card className="glass border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-primary" data-testid="stat-total-sentences">{stats.totalSentences}</p>
                <p className="text-xs text-muted-foreground mt-1">Gaplar</p>
              </CardContent>
            </Card>
            <Card className="glass border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-primary" data-testid="stat-total-quizzes">{stats.totalQuizzes}</p>
                <p className="text-xs text-muted-foreground mt-1">Test savollari</p>
              </CardContent>
            </Card>
            <Card className="glass border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-primary" data-testid="stat-total-words">{stats.totalWords}</p>
                <p className="text-xs text-muted-foreground mt-1">Lug'at so'zlari</p>
              </CardContent>
            </Card>
            <Card className="glass border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-primary" data-testid="stat-saved-words">{stats.totalSavedWords}</p>
                <p className="text-xs text-muted-foreground mt-1">Saqlangan so'zlar</p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={lessonFilter} onValueChange={setLessonFilter}>
              <SelectTrigger className="w-[250px] h-9 bg-background/50" data-testid="select-lesson-filter">
                <SelectValue placeholder="Barcha darslar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha darslar</SelectItem>
                {lessons.map((l: any) => (
                  <SelectItem key={l.id} value={String(l.id)}>{l.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Qidirish..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-background/50"
              data-testid="input-data-search"
            />
          </div>
        </div>

        <Tabs defaultValue="vocabulary" className="w-full">
          <TabsList className="w-full grid grid-cols-4 md:grid-cols-7 glass border border-border/50 h-auto p-1" data-testid="tabs-data">
            <TabsTrigger value="vocabulary" className="text-xs py-2 gap-1" data-testid="tab-vocabulary">
              <Languages className="w-3.5 h-3.5 hidden sm:block" /> So'zlar
            </TabsTrigger>
            <TabsTrigger value="wordmaps" className="text-xs py-2 gap-1" data-testid="tab-wordmaps">
              <Globe className="w-3.5 h-3.5 hidden sm:block" /> So'z xaritasi
            </TabsTrigger>
            <TabsTrigger value="sentences" className="text-xs py-2 gap-1" data-testid="tab-sentences">
              <BookOpen className="w-3.5 h-3.5 hidden sm:block" /> Gaplar
            </TabsTrigger>
            <TabsTrigger value="quizzes" className="text-xs py-2 gap-1" data-testid="tab-quizzes">
              <Brain className="w-3.5 h-3.5 hidden sm:block" /> Testlar
            </TabsTrigger>
            <TabsTrigger value="phrases" className="text-xs py-2 gap-1" data-testid="tab-phrases">
              <Sparkles className="w-3.5 h-3.5 hidden sm:block" /> Iboralar
            </TabsTrigger>
            <TabsTrigger value="flashcards" className="text-xs py-2 gap-1" data-testid="tab-flashcards">
              <Layers className="w-3.5 h-3.5 hidden sm:block" /> Kartochkalar
            </TabsTrigger>
            <TabsTrigger value="saved" className="text-xs py-2 gap-1" data-testid="tab-saved">
              <BookmarkPlus className="w-3.5 h-3.5 hidden sm:block" /> Saqlangan
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vocabulary" className="mt-4">
            <VocabularyDataTab data={vocabulary} search={search} isLoading={vocabLoading} />
          </TabsContent>
          <TabsContent value="wordmaps" className="mt-4">
            <WordMapDataTab data={wordMaps} search={search} isLoading={wmLoading} />
          </TabsContent>
          <TabsContent value="sentences" className="mt-4">
            <SentenceDataTab data={sentences} search={search} isLoading={sentLoading} />
          </TabsContent>
          <TabsContent value="quizzes" className="mt-4">
            <QuizDataTab data={quizzes} search={search} isLoading={quizLoading} />
          </TabsContent>
          <TabsContent value="phrases" className="mt-4">
            <PhraseDataTab data={phrases} search={search} isLoading={phraseLoading} />
          </TabsContent>
          <TabsContent value="flashcards" className="mt-4">
            <FlashcardDataTab data={flashcards} search={search} isLoading={fcLoading} />
          </TabsContent>
          <TabsContent value="saved" className="mt-4">
            <SavedWordDataTab data={savedWords} search={search} isLoading={swLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function TabExportBar({ count, onCSV, onXLSX, label }: { count: number; label: string; onCSV: () => void; onXLSX: () => void }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{count} {label}</Badge>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onCSV} data-testid={`button-csv-${label}`}>
          <FileText className="w-3.5 h-3.5" /> CSV
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onXLSX} data-testid={`button-xlsx-${label}`}>
          <FileSpreadsheet className="w-3.5 h-3.5" /> XLSX
        </Button>
      </div>
    </div>
  );
}

function SortHeader({ label, col, toggleSort, SortIcon }: { label: string; col: string; toggleSort: (k: string) => void; SortIcon: (p: { col: string }) => JSX.Element }) {
  return (
    <button className="flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => toggleSort(col)} data-testid={`sort-${col}`}>
      {label} <SortIcon col={col} />
    </button>
  );
}

function VocabularyDataTab({ data, search, isLoading }: { data: VocabRow[]; search: string; isLoading: boolean }) {
  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(v => v.word.toLowerCase().includes(q) || v.translation.toLowerCase().includes(q) || (v.translationAr || "").includes(q));
  }, [data, search]);

  const { sorted, toggleSort, SortIcon } = useSortable<VocabRow>(filtered, "word");

  const headers = ["So'z", "Tarjima (UZ)", "Tarjima (AR)", "So'z turi", "Daraja", "Misol", "Dars"];
  const toRows = (d: VocabRow[]) => d.map(v => [v.word, v.translation, v.translationAr, v.partOfSpeech, v.difficulty, v.example, v.lessonTitle]);

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div>
      <TabExportBar
        count={sorted.length}
        label="so'z"
        onCSV={() => saveAs(generateCSV(headers, toRows(sorted)), "vocabulary.csv")}
        onXLSX={async () => { const blob = await generateMultiSheetXLSX([{ name: "So'zlar", headers, rows: toRows(sorted) }]); saveAs(blob, "vocabulary.xlsx"); }}
      />
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border/50">
              <th className="p-2 text-left"><SortHeader label="So'z" col="word" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
              <th className="p-2 text-left"><SortHeader label="Tarjima" col="translation" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
              <th className="p-2 text-left">AR</th>
              <th className="p-2 text-left"><SortHeader label="Turi" col="partOfSpeech" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
              <th className="p-2 text-left"><SortHeader label="Daraja" col="difficulty" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
              <th className="p-2 text-left">Misol</th>
              <th className="p-2 text-left"><SortHeader label="Dars" col="lessonTitle" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 200).map((v, i) => (
              <tr key={i} className="border-b border-border/30 hover:bg-muted/10" data-testid={`row-vocab-${i}`}>
                <td className="p-2 font-medium">{v.word}</td>
                <td className="p-2 text-primary/80">{v.translation}</td>
                <td className="p-2 text-violet-400/80" dir="rtl" style={arabicStyle(v.translationAr || "")}>{v.translationAr}</td>
                <td className="p-2"><Badge variant="secondary" className="text-[10px]">{v.partOfSpeech}</Badge></td>
                <td className="p-2"><Badge variant="outline" className="text-[10px]">{v.difficulty}</Badge></td>
                <td className="p-2 text-xs text-muted-foreground max-w-[200px] truncate">{v.example}</td>
                <td className="p-2 text-xs text-muted-foreground max-w-[150px] truncate">{v.lessonTitle}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length > 200 && <p className="text-xs text-muted-foreground text-center py-2">Dastlabki 200 ta ko'rsatilmoqda. To'liq ma'lumotni yuklab oling.</p>}
        {sorted.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Ma'lumot topilmadi</p>}
      </div>
    </div>
  );
}

function WordMapDataTab({ data, search, isLoading }: { data: WordMapRow[]; search: string; isLoading: boolean }) {
  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(wm => wm.word.toLowerCase().includes(q) || wm.translationUz.toLowerCase().includes(q) || (wm.translationAr || "").includes(q));
  }, [data, search]);

  const { sorted, toggleSort, SortIcon } = useSortable<WordMapRow>(filtered, "count");

  const headers = ["So'z", "Normalizatsiya", "Tarjima (UZ)", "Tarjima (AR)", "Kontekst", "Takrorlar", "Darslar"];
  const toRows = (d: WordMapRow[]) => d.map(wm => [wm.word, wm.normalized, wm.translationUz, wm.translationAr, wm.contextualMeaning, String(wm.count), wm.lessons.join(", ")]);

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div>
      <TabExportBar
        count={sorted.length}
        label="unikal so'z"
        onCSV={() => saveAs(generateCSV(headers, toRows(sorted)), "wordmaps.csv")}
        onXLSX={async () => { const blob = await generateMultiSheetXLSX([{ name: "So'z xaritasi", headers, rows: toRows(sorted) }]); saveAs(blob, "wordmaps.xlsx"); }}
      />
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border/50">
              <th className="p-2 text-left"><SortHeader label="So'z" col="word" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
              <th className="p-2 text-left">Tarjima (UZ)</th>
              <th className="p-2 text-left">Tarjima (AR)</th>
              <th className="p-2 text-left">Kontekst</th>
              <th className="p-2 text-left"><SortHeader label="Takrorlar" col="count" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
              <th className="p-2 text-left"><SortHeader label="Darslar" col="lessonCount" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 300).map((wm, i) => (
              <tr key={i} className="border-b border-border/30 hover:bg-muted/10" data-testid={`row-wordmap-${i}`}>
                <td className="p-2 font-medium">{wm.word}</td>
                <td className="p-2 text-primary/80">{wm.translationUz}</td>
                <td className="p-2 text-violet-400/80" dir="rtl" style={arabicStyle(wm.translationAr || "")}>{wm.translationAr}</td>
                <td className="p-2 text-xs text-muted-foreground max-w-[200px] truncate">{wm.contextualMeaning}</td>
                <td className="p-2"><Badge variant="secondary" className="text-xs">{wm.count}</Badge></td>
                <td className="p-2 text-xs text-muted-foreground">{wm.lessons.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length > 300 && <p className="text-xs text-muted-foreground text-center py-2">Dastlabki 300 ta ko'rsatilmoqda. To'liq ma'lumotni yuklab oling.</p>}
        {sorted.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">So'z xaritasi ma'lumotlari topilmadi</p>}
      </div>
    </div>
  );
}

function SentenceDataTab({ data, search, isLoading }: { data: SentenceRow[]; search: string; isLoading: boolean }) {
  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(s => s.sentence.toLowerCase().includes(q) || s.translation.toLowerCase().includes(q) || (s.translationAr || "").includes(q));
  }, [data, search]);

  const { sorted, toggleSort, SortIcon } = useSortable<SentenceRow>(filtered, "lessonTitle");

  const headers = ["Gap", "Tarjima (UZ)", "Tarjima (AR)", "Grammatika", "Kalit so'zlar", "So'z xaritasi", "Dars"];
  const toRows = (d: SentenceRow[]) => d.map(s => [s.sentence, s.translation, s.translationAr, s.grammarNotes, (s.keyWords || []).join(", "), String(s.wordMapCount), s.lessonTitle]);

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div>
      <TabExportBar
        count={sorted.length}
        label="gap"
        onCSV={() => saveAs(generateCSV(headers, toRows(sorted)), "sentences.csv")}
        onXLSX={async () => { const blob = await generateMultiSheetXLSX([{ name: "Gaplar", headers, rows: toRows(sorted) }]); saveAs(blob, "sentences.xlsx"); }}
      />
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border/50">
              <th className="p-2 text-left">Gap</th>
              <th className="p-2 text-left">Tarjima</th>
              <th className="p-2 text-left">AR</th>
              <th className="p-2 text-left">Grammatika</th>
              <th className="p-2 text-left"><SortHeader label="Dars" col="lessonTitle" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 200).map((s, i) => (
              <tr key={i} className="border-b border-border/30 hover:bg-muted/10" data-testid={`row-sentence-${i}`}>
                <td className="p-2 font-medium max-w-[300px]">{s.sentence}</td>
                <td className="p-2 text-primary/80 max-w-[250px]">{s.translation}</td>
                <td className="p-2 text-violet-400/80 max-w-[250px]" dir="rtl" style={arabicStyle(s.translationAr || "")}>{s.translationAr}</td>
                <td className="p-2 text-xs text-muted-foreground max-w-[200px] truncate">{s.grammarNotes}</td>
                <td className="p-2 text-xs text-muted-foreground max-w-[150px] truncate">{s.lessonTitle}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length > 200 && <p className="text-xs text-muted-foreground text-center py-2">Dastlabki 200 ta ko'rsatilmoqda.</p>}
        {sorted.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Ma'lumot topilmadi</p>}
      </div>
    </div>
  );
}

function QuizDataTab({ data, search, isLoading }: { data: QuizRow[]; search: string; isLoading: boolean }) {
  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(quiz => quiz.question.toLowerCase().includes(q) || quiz.explanation.toLowerCase().includes(q));
  }, [data, search]);

  const { sorted, toggleSort, SortIcon } = useSortable<QuizRow>(filtered, "lessonTitle");

  const headers = ["Savol", "Variantlar", "To'g'ri javob", "Izoh", "Turi", "Dars"];
  const toRows = (d: QuizRow[]) => d.map(q => [q.question, (q.options || []).join(" | "), q.options[q.correctIndex] || "", q.explanation, q.type, q.lessonTitle]);

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div>
      <TabExportBar
        count={sorted.length}
        label="savol"
        onCSV={() => saveAs(generateCSV(headers, toRows(sorted)), "quizzes.csv")}
        onXLSX={async () => { const blob = await generateMultiSheetXLSX([{ name: "Testlar", headers, rows: toRows(sorted) }]); saveAs(blob, "quizzes.xlsx"); }}
      />
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border/50">
              <th className="p-2 text-left">Savol</th>
              <th className="p-2 text-left">Variantlar</th>
              <th className="p-2 text-left">To'g'ri javob</th>
              <th className="p-2 text-left"><SortHeader label="Turi" col="type" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
              <th className="p-2 text-left"><SortHeader label="Dars" col="lessonTitle" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 200).map((q, i) => (
              <tr key={i} className="border-b border-border/30 hover:bg-muted/10" data-testid={`row-quiz-${i}`}>
                <td className="p-2 font-medium max-w-[300px]">{q.question}</td>
                <td className="p-2 text-xs text-muted-foreground max-w-[250px]">{(q.options || []).join(" | ")}</td>
                <td className="p-2 text-green-400 text-xs">{q.options[q.correctIndex]}</td>
                <td className="p-2"><Badge variant="outline" className="text-[10px]">{q.type}</Badge></td>
                <td className="p-2 text-xs text-muted-foreground max-w-[150px] truncate">{q.lessonTitle}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length > 200 && <p className="text-xs text-muted-foreground text-center py-2">Dastlabki 200 ta ko'rsatilmoqda.</p>}
        {sorted.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Ma'lumot topilmadi</p>}
      </div>
    </div>
  );
}

function PhraseDataTab({ data, search, isLoading }: { data: PhraseRow[]; search: string; isLoading: boolean }) {
  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(p => p.phrase.toLowerCase().includes(q) || p.translation.toLowerCase().includes(q));
  }, [data, search]);

  const { sorted, toggleSort, SortIcon } = useSortable<PhraseRow>(filtered, "phrase");

  const headers = ["Ibora", "Tarjima (UZ)", "Tarjima (AR)", "Kontekst", "Dars"];
  const toRows = (d: PhraseRow[]) => d.map(p => [p.phrase, p.translation, p.translationAr, p.context, p.lessonTitle]);

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div>
      <TabExportBar
        count={sorted.length}
        label="ibora"
        onCSV={() => saveAs(generateCSV(headers, toRows(sorted)), "phrases.csv")}
        onXLSX={async () => { const blob = await generateMultiSheetXLSX([{ name: "Iboralar", headers, rows: toRows(sorted) }]); saveAs(blob, "phrases.xlsx"); }}
      />
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border/50">
              <th className="p-2 text-left"><SortHeader label="Ibora" col="phrase" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
              <th className="p-2 text-left">Tarjima</th>
              <th className="p-2 text-left">AR</th>
              <th className="p-2 text-left">Kontekst</th>
              <th className="p-2 text-left"><SortHeader label="Dars" col="lessonTitle" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 200).map((p, i) => (
              <tr key={i} className="border-b border-border/30 hover:bg-muted/10" data-testid={`row-phrase-${i}`}>
                <td className="p-2 font-medium">{p.phrase}</td>
                <td className="p-2 text-primary/80">{p.translation}</td>
                <td className="p-2 text-violet-400/80" dir="rtl" style={arabicStyle(p.translationAr || "")}>{p.translationAr}</td>
                <td className="p-2 text-xs text-muted-foreground max-w-[200px] truncate">{p.context}</td>
                <td className="p-2 text-xs text-muted-foreground max-w-[150px] truncate">{p.lessonTitle}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Ma'lumot topilmadi</p>}
      </div>
    </div>
  );
}

function FlashcardDataTab({ data, search, isLoading }: { data: FlashcardRow[]; search: string; isLoading: boolean }) {
  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(f => f.front.toLowerCase().includes(q) || f.back.toLowerCase().includes(q));
  }, [data, search]);

  const { sorted, toggleSort, SortIcon } = useSortable<FlashcardRow>(filtered, "front");

  const headers = ["Old tomon", "Orqa tomon (UZ)", "Orqa tomon (AR)", "Turi", "Dars"];
  const toRows = (d: FlashcardRow[]) => d.map(f => [f.front, f.back, f.backAr, f.type, f.lessonTitle]);

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div>
      <TabExportBar
        count={sorted.length}
        label="kartochka"
        onCSV={() => saveAs(generateCSV(headers, toRows(sorted)), "flashcards.csv")}
        onXLSX={async () => { const blob = await generateMultiSheetXLSX([{ name: "Kartochkalar", headers, rows: toRows(sorted) }]); saveAs(blob, "flashcards.xlsx"); }}
      />
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border/50">
              <th className="p-2 text-left"><SortHeader label="Old tomon" col="front" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
              <th className="p-2 text-left">Orqa tomon</th>
              <th className="p-2 text-left">AR</th>
              <th className="p-2 text-left"><SortHeader label="Turi" col="type" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
              <th className="p-2 text-left"><SortHeader label="Dars" col="lessonTitle" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 200).map((f, i) => (
              <tr key={i} className="border-b border-border/30 hover:bg-muted/10" data-testid={`row-flashcard-${i}`}>
                <td className="p-2 font-medium">{f.front}</td>
                <td className="p-2 text-primary/80">{f.back}</td>
                <td className="p-2 text-violet-400/80" dir="rtl" style={arabicStyle(f.backAr || "")}>{f.backAr}</td>
                <td className="p-2"><Badge variant="outline" className="text-[10px]">{f.type}</Badge></td>
                <td className="p-2 text-xs text-muted-foreground max-w-[150px] truncate">{f.lessonTitle}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Ma'lumot topilmadi</p>}
      </div>
    </div>
  );
}

function SavedWordDataTab({ data, search, isLoading }: { data: SavedWordRow[]; search: string; isLoading: boolean }) {
  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(sw => sw.word.toLowerCase().includes(q) || (sw.translationUz || "").toLowerCase().includes(q) || sw.userName.toLowerCase().includes(q));
  }, [data, search]);

  const { sorted, toggleSort, SortIcon } = useSortable<SavedWordRow>(filtered, "word");

  const headers = ["So'z", "Tarjima (UZ)", "Tarjima (AR)", "So'z turi", "Kontekst", "Foydalanuvchi", "Dars", "O'rganilgan", "Sana"];
  const toRows = (d: SavedWordRow[]) => d.map(sw => [sw.word, sw.translationUz || "", sw.translationAr || "", sw.partOfSpeech || "", sw.contextualMeaning || "", sw.userName, sw.lessonTitle, sw.isLearned ? "Ha" : "Yo'q", new Date(sw.createdAt).toLocaleDateString("uz-UZ")]);

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div>
      <TabExportBar
        count={sorted.length}
        label="saqlangan so'z"
        onCSV={() => saveAs(generateCSV(headers, toRows(sorted)), "saved_words.csv")}
        onXLSX={async () => { const blob = await generateMultiSheetXLSX([{ name: "Saqlangan so'zlar", headers, rows: toRows(sorted) }]); saveAs(blob, "saved_words.xlsx"); }}
      />
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border/50">
              <th className="p-2 text-left"><SortHeader label="So'z" col="word" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
              <th className="p-2 text-left">Tarjima (UZ)</th>
              <th className="p-2 text-left">AR</th>
              <th className="p-2 text-left">Turi</th>
              <th className="p-2 text-left"><SortHeader label="Foydalanuvchi" col="userName" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
              <th className="p-2 text-left"><SortHeader label="Dars" col="lessonTitle" toggleSort={toggleSort} SortIcon={SortIcon} /></th>
              <th className="p-2 text-left">Holat</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 200).map((sw, i) => (
              <tr key={i} className="border-b border-border/30 hover:bg-muted/10" data-testid={`row-saved-${i}`}>
                <td className="p-2 font-medium">{sw.word}</td>
                <td className="p-2 text-primary/80">{sw.translationUz}</td>
                <td className="p-2 text-violet-400/80" dir="rtl" style={arabicStyle(sw.translationAr || "")}>{sw.translationAr}</td>
                <td className="p-2"><Badge variant="secondary" className="text-[10px]">{sw.partOfSpeech || "-"}</Badge></td>
                <td className="p-2 text-xs">{sw.userName}</td>
                <td className="p-2 text-xs text-muted-foreground max-w-[150px] truncate">{sw.lessonTitle}</td>
                <td className="p-2">
                  <Badge variant={sw.isLearned ? "default" : "outline"} className="text-[10px]">
                    {sw.isLearned ? "O'rganilgan" : "O'rganilmoqda"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length > 200 && <p className="text-xs text-muted-foreground text-center py-2">Dastlabki 200 ta ko'rsatilmoqda.</p>}
        {sorted.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Saqlangan so'zlar topilmadi</p>}
      </div>
    </div>
  );
}
