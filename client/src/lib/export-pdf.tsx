import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
} from "@react-pdf/renderer";
import type {
  ExportConfig,
  LessonExportData,
  SentenceBlock,
  VocabEntry,
  PhraseEntry,
  QuizEntry,
  FlashcardEntry,
  SummaryData,
} from "./export-types";
import {
  prepareTextBlocks,
  prepareVocabulary,
  preparePhrases,
  prepareQuizzes,
  prepareFlashcards,
  prepareSummary,
} from "./export-transform";

Font.register({
  family: "Amiri",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/amiri/Amiri-Regular.ttf",
      fontWeight: 400,
    },
    {
      src: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/amiri/Amiri-Bold.ttf",
      fontWeight: 700,
    },
  ],
});

Font.register({
  family: "NotoSans",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf",
      fontWeight: 400,
    },
    {
      src: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf",
      fontWeight: 700,
    },
  ],
});

const WORD_COLORS = [
  "#DC2626", "#2563EB", "#059669", "#D97706", "#7C3AED",
  "#DB2777", "#0891B2", "#4F46E5", "#B45309", "#0D9488",
];

const colors = {
  arabText: "#059669",
  arabBg: "#ecfdf5",
  uzTranslation: "#2563eb",
  uzBg: "#eff6ff",
  wordByWord: "#d97706",
  wordByWordBg: "#fffbeb",
  vocab: "#0891b2",
  vocabBg: "#ecfeff",
  vocabAlt: "#7c3aed",
  phrases: "#7c3aed",
  phrasesBg: "#f5f3ff",
  quiz: "#dc2626",
  quizBg: "#fef2f2",
  flashcard: "#0d9488",
  flashcardBg: "#f0fdfa",
  summary: "#4f46e5",
  summaryBg: "#eef2ff",
  brand: "#059669",
  brandLight: "#d1fae5",
  gray: "#6b7280",
  grayLight: "#f3f4f6",
  dark: "#111827",
  white: "#ffffff",
  border: "#e5e7eb",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 50,
    paddingBottom: 60,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: colors.dark,
  },
  brandBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: colors.brand,
  },
  header: {
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: colors.brand,
  },
  brandName: {
    fontSize: 8,
    color: colors.brand,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    letterSpacing: 1,
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: colors.dark,
    marginBottom: 4,
  },
  level: {
    fontSize: 9,
    color: colors.gray,
    fontFamily: "Helvetica",
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    marginTop: 16,
    paddingBottom: 4,
    borderBottomWidth: 1,
  },
  sentenceBlock: {
    marginBottom: 10,
    padding: 8,
    borderRadius: 4,
  },
  arabicText: {
    fontSize: 14,
    color: colors.arabText,
    textAlign: "right" as const,
    marginBottom: 4,
    fontFamily: "Amiri",
    fontWeight: 700 as const,
    lineHeight: 1.8,
  },
  uzText: {
    fontSize: 10,
    color: colors.uzTranslation,
    marginBottom: 4,
    fontFamily: "NotoSans",
  },
  wordMapRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
    marginTop: 4,
    backgroundColor: "#f0fdf4",
    padding: 6,
    borderRadius: 4,
  },
  wordMapItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 2,
    marginBottom: 2,
  },
  wordMapAr: {
    fontSize: 11,
    color: colors.arabText,
    fontFamily: "Amiri",
    fontWeight: 700 as const,
  },
  wordMapUz: {
    fontSize: 8,
    color: colors.uzTranslation,
    fontFamily: "NotoSans",
  },
  tableHeader: {
    flexDirection: "row" as const,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: "row" as const,
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  tableRowAlt: {
    backgroundColor: colors.grayLight,
  },
  tableCell: {
    fontSize: 9,
    paddingHorizontal: 4,
  },
  phraseBlock: {
    marginBottom: 8,
    padding: 8,
    backgroundColor: colors.phrasesBg,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: colors.phrases,
  },
  phraseText: {
    fontSize: 12,
    color: colors.phrases,
    fontFamily: "Amiri",
    fontWeight: 700 as const,
    textAlign: "right" as const,
    marginBottom: 2,
    lineHeight: 1.6,
  },
  phraseTranslation: {
    fontSize: 10,
    color: colors.dark,
    marginBottom: 2,
  },
  phraseContext: {
    fontSize: 8,
    color: colors.gray,
    fontStyle: "italic" as const,
  },
  quizBlock: {
    marginBottom: 10,
    padding: 8,
    backgroundColor: colors.quizBg,
    borderRadius: 4,
  },
  quizQuestion: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.dark,
    marginBottom: 6,
  },
  quizOption: {
    fontSize: 9,
    color: colors.dark,
    marginBottom: 3,
    paddingLeft: 12,
  },
  quizOptionCorrect: {
    fontSize: 9,
    color: colors.brand,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
    paddingLeft: 12,
  },
  quizExplanation: {
    fontSize: 8,
    color: colors.gray,
    fontStyle: "italic" as const,
    marginTop: 4,
  },
  flashcardGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  flashcard: {
    width: "48%",
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  flashcardFront: {
    fontSize: 13,
    fontFamily: "Amiri",
    fontWeight: 700 as const,
    color: colors.flashcard,
    textAlign: "right" as const,
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    lineHeight: 1.6,
  },
  flashcardBack: {
    fontSize: 10,
    color: colors.dark,
    fontFamily: "NotoSans",
  },
  summaryBlock: {
    padding: 12,
    backgroundColor: colors.summaryBg,
    borderRadius: 6,
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: colors.summary,
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 10,
    color: colors.dark,
    lineHeight: 1.5,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7,
    color: colors.gray,
  },
  pageNumber: {
    fontSize: 7,
    color: colors.gray,
  },
});

function Header({ title, level }: { title: string; level: string }) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.brandBar} />
      <Text style={styles.brandName}>TUBE MENTOR AI</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.level}>Daraja: {level}</Text>
    </View>
  );
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>Tube Mentor AI | tubementor.ai</Text>
      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) =>
          `${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

function TextBlocksSection({ blocks }: { blocks: SentenceBlock[] }) {
  if (!blocks.length) return null;
  return (
    <View>
      <Text
        style={[
          styles.sectionTitle,
          { color: colors.arabText, borderBottomColor: colors.arabText },
        ]}
      >
        Matn va Tarjima
      </Text>
      {blocks.map((block) => (
        <View key={block.index} style={styles.sentenceBlock} wrap={false}>
          {block.sentence ? (
            <Text style={styles.arabicText}>{block.sentence}  {block.index}.</Text>
          ) : null}
          {block.translation ? (
            <Text style={styles.uzText}>{block.index}. {block.translation}</Text>
          ) : null}
          {block.wordMap && block.wordMap.length > 0 ? (
            <View style={{ flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8, marginTop: 4, justifyContent: "flex-end" as const }}>
              {[...block.wordMap].reverse().map((w, wi) => {
                const origIdx = block.wordMap!.length - 1 - wi;
                const clr = WORD_COLORS[origIdx % WORD_COLORS.length];
                return (
                  <View key={wi} style={{ alignItems: "center" as const, marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: clr, fontFamily: "Amiri", fontWeight: 700 as const }}>{w.word}</Text>
                    <Text style={{ fontSize: 8, color: clr, fontFamily: "NotoSans", marginTop: 1 }}>{w.translation}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function VocabularySection({ vocab }: { vocab: VocabEntry[] }) {
  if (!vocab.length) return null;
  return (
    <View>
      <Text
        style={[
          styles.sectionTitle,
          { color: colors.vocab, borderBottomColor: colors.vocab },
        ]}
      >
        Lug'at
      </Text>
      <View style={styles.tableHeader}>
        <Text
          style={[
            styles.tableCell,
            { width: "25%", fontFamily: "Helvetica-Bold", color: colors.vocab },
          ]}
        >
          Arab so'zi
        </Text>
        <Text
          style={[
            styles.tableCell,
            { width: "25%", fontFamily: "Helvetica-Bold", color: colors.vocab },
          ]}
        >
          Tarjima
        </Text>
        <Text
          style={[
            styles.tableCell,
            {
              width: "15%",
              fontFamily: "Helvetica-Bold",
              color: colors.vocab,
            },
          ]}
        >
          Turi
        </Text>
        <Text
          style={[
            styles.tableCell,
            {
              width: "30%",
              fontFamily: "Helvetica-Bold",
              color: colors.vocab,
            },
          ]}
        >
          Misol
        </Text>
      </View>
      {vocab.map((v, i) => (
        <View
          key={i}
          style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
          wrap={false}
        >
          <Text
            style={[
              styles.tableCell,
              {
                width: "25%",
                textAlign: "right" as const,
                fontFamily: "Amiri",
                fontWeight: 700 as const,
                color: colors.arabText,
                lineHeight: 1.6,
              },
            ]}
          >
            {v.word}
          </Text>
          <Text style={[styles.tableCell, { width: "25%" }]}>
            {v.translation}
          </Text>
          <Text
            style={[styles.tableCell, { width: "15%", color: colors.gray }]}
          >
            {v.partOfSpeech || "—"}
          </Text>
          <Text
            style={[styles.tableCell, { width: "30%", color: colors.gray }]}
          >
            {v.example || "—"}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PhrasesSection({ phrases }: { phrases: PhraseEntry[] }) {
  if (!phrases.length) return null;
  return (
    <View>
      <Text
        style={[
          styles.sectionTitle,
          { color: colors.phrases, borderBottomColor: colors.phrases },
        ]}
      >
        Iboralar
      </Text>
      {phrases.map((p, i) => (
        <View key={i} style={styles.phraseBlock} wrap={false}>
          <Text style={styles.phraseText}>{p.phrase}</Text>
          <Text style={styles.phraseTranslation}>{p.translation}</Text>
          {p.context ? (
            <Text style={styles.phraseContext}>{p.context}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function QuizzesSection({
  quizzes,
  withAnswers,
}: {
  quizzes: QuizEntry[];
  withAnswers: boolean;
}) {
  if (!quizzes.length) return null;
  return (
    <View>
      <Text
        style={[
          styles.sectionTitle,
          { color: colors.quiz, borderBottomColor: colors.quiz },
        ]}
      >
        {withAnswers ? "Test (Javoblar bilan)" : "Test"}
      </Text>
      {quizzes.map((q, qi) => (
        <View key={qi} style={styles.quizBlock} wrap={false}>
          <Text style={styles.quizQuestion}>
            {qi + 1}. {q.question}
          </Text>
          {q.options.map((opt, oi) => (
            <Text
              key={oi}
              style={
                withAnswers && oi === q.correctIndex
                  ? styles.quizOptionCorrect
                  : styles.quizOption
              }
            >
              {String.fromCharCode(65 + oi)}) {opt}
              {withAnswers && oi === q.correctIndex ? " ✓" : ""}
            </Text>
          ))}
          {withAnswers && q.explanation ? (
            <Text style={styles.quizExplanation}>{q.explanation}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function FlashcardsSection({
  flashcards,
}: {
  flashcards: FlashcardEntry[];
}) {
  if (!flashcards.length) return null;
  return (
    <View>
      <Text
        style={[
          styles.sectionTitle,
          { color: colors.flashcard, borderBottomColor: colors.flashcard },
        ]}
      >
        Flashkartalar
      </Text>
      <View style={styles.flashcardGrid}>
        {flashcards.map((f, i) => (
          <View
            key={i}
            style={[styles.flashcard, { backgroundColor: colors.flashcardBg }]}
            wrap={false}
          >
            <Text style={styles.flashcardFront}>{f.front}</Text>
            <Text style={styles.flashcardBack}>{f.back}</Text>
            {f.type ? (
              <Text
                style={{ fontSize: 7, color: colors.gray, marginTop: 4 }}
              >
                {f.type}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function SummarySection({ summary }: { summary: SummaryData }) {
  return (
    <View>
      <Text
        style={[
          styles.sectionTitle,
          { color: colors.summary, borderBottomColor: colors.summary },
        ]}
      >
        Xulosa
      </Text>
      {summary.summaryShort ? (
        <View style={styles.summaryBlock} wrap={false}>
          <Text style={styles.summaryLabel}>Qisqa xulosa</Text>
          <Text style={styles.summaryText}>{summary.summaryShort}</Text>
        </View>
      ) : null}
      {summary.summaryShortAr ? (
        <View style={styles.summaryBlock} wrap={false}>
          <Text style={styles.summaryLabel}>Qisqa xulosa (arabcha)</Text>
          <Text style={[styles.summaryText, { textAlign: "right" as const, fontFamily: "Amiri", lineHeight: 1.8 }]}>{summary.summaryShortAr}</Text>
        </View>
      ) : null}
      {summary.summaryDetailed ? (
        <View style={styles.summaryBlock} wrap={false}>
          <Text style={styles.summaryLabel}>Batafsil xulosa</Text>
          <Text style={styles.summaryText}>{summary.summaryDetailed}</Text>
        </View>
      ) : null}
      {summary.summaryDetailedAr ? (
        <View style={styles.summaryBlock} wrap={false}>
          <Text style={styles.summaryLabel}>Batafsil xulosa (arabcha)</Text>
          <Text style={[styles.summaryText, { textAlign: "right" as const, fontFamily: "Amiri", lineHeight: 1.8 }]}>{summary.summaryDetailedAr}</Text>
        </View>
      ) : null}
    </View>
  );
}

function MiniGuidePDF({
  data,
  config,
}: {
  data: LessonExportData;
  config: ExportConfig;
}) {
  const textBlocks = prepareTextBlocks(data, config);
  const vocabulary = prepareVocabulary(data, config);
  const phrases = preparePhrases(data, config);
  const quizzes = prepareQuizzes(data, config);
  const flashcards = prepareFlashcards(data, config);
  const summary = prepareSummary(data, config);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header title={data.title} level={data.level} />
        <TextBlocksSection blocks={textBlocks} />
        <VocabularySection vocab={vocabulary} />
        <PhrasesSection phrases={phrases} />
        <QuizzesSection
          quizzes={quizzes}
          withAnswers={config.quizWithAnswers}
        />
        <FlashcardsSection flashcards={flashcards} />
        {summary ? <SummarySection summary={summary} /> : null}
        <Footer />
      </Page>
    </Document>
  );
}

function QuizSheetPDF({
  data,
  config,
}: {
  data: LessonExportData;
  config: ExportConfig;
}) {
  const quizzes = prepareQuizzes(data, config);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header title={`${data.title} — Test varaq`} level={data.level} />
        <QuizzesSection
          quizzes={quizzes}
          withAnswers={config.quizWithAnswers}
        />
        <Footer />
      </Page>
    </Document>
  );
}

function FlashcardsPDF({
  data,
  config,
}: {
  data: LessonExportData;
  config: ExportConfig;
}) {
  const flashcards = prepareFlashcards(data, config);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header
          title={`${data.title} — Flashkartalar`}
          level={data.level}
        />
        <FlashcardsSection flashcards={flashcards} />
        <Footer />
      </Page>
    </Document>
  );
}

export async function generateMiniGuidePDF(
  data: LessonExportData,
  config: ExportConfig
): Promise<Blob> {
  const doc = <MiniGuidePDF data={data} config={config} />;
  const blob = await pdf(doc).toBlob();
  return blob;
}

export async function generateQuizSheetPDF(
  data: LessonExportData,
  config: ExportConfig
): Promise<Blob> {
  const doc = <QuizSheetPDF data={data} config={config} />;
  const blob = await pdf(doc).toBlob();
  return blob;
}

export async function generateFlashcardsPDF(
  data: LessonExportData,
  config: ExportConfig
): Promise<Blob> {
  const doc = <FlashcardsPDF data={data} config={config} />;
  const blob = await pdf(doc).toBlob();
  return blob;
}

export async function generatePDF(
  data: LessonExportData,
  config: ExportConfig
): Promise<Blob> {
  const hasOnlyQuiz =
    config.sections.length === 1 && config.sections[0] === "quizzes";
  const hasOnlyFlashcards =
    config.sections.length === 1 && config.sections[0] === "flashcards";

  if (hasOnlyQuiz) {
    return generateQuizSheetPDF(data, config);
  }
  if (hasOnlyFlashcards) {
    return generateFlashcardsPDF(data, config);
  }
  return generateMiniGuidePDF(data, config);
}
