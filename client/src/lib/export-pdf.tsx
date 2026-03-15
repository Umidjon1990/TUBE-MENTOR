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
  QuizEntry,
  FlashcardEntry,
  SummaryData,
} from "./export-types";
import {
  prepareTextBlocks,
  prepareVocabulary,
  prepareQuizzes,
  prepareFlashcards,
  prepareSummary,
} from "./export-transform";

Font.register({
  family: "ArabicFont",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/scheherazadenew/ScheherazadeNew-Regular.ttf",
      fontWeight: 400,
      fontStyle: "normal",
    },
    {
      src: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/scheherazadenew/ScheherazadeNew-Bold.ttf",
      fontWeight: 700,
      fontStyle: "normal",
    },
    {
      src: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/scheherazadenew/ScheherazadeNew-Regular.ttf",
      fontWeight: 400,
      fontStyle: "italic",
    },
    {
      src: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/scheherazadenew/ScheherazadeNew-Bold.ttf",
      fontWeight: 700,
      fontStyle: "italic",
    },
  ],
});


const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function hasArabic(text: string | undefined | null): boolean {
  if (!text) return false;
  return ARABIC_REGEX.test(text);
}

function splitMixedText(text: string): Array<{ text: string; isArabic: boolean }> {
  const segments: Array<{ text: string; isArabic: boolean }> = [];
  let current = "";
  let currentIsArabic = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charIsArabic = ARABIC_REGEX.test(char);
    const isNeutral = /[\s\d\p{P}]/u.test(char);

    if (current === "") {
      currentIsArabic = charIsArabic;
      current = char;
    } else if (isNeutral) {
      current += char;
    } else if (charIsArabic === currentIsArabic) {
      current += char;
    } else {
      segments.push({ text: current, isArabic: currentIsArabic });
      current = char;
      currentIsArabic = charIsArabic;
    }
  }
  if (current) {
    segments.push({ text: current, isArabic: currentIsArabic });
  }
  return segments;
}

function flattenChildren(children: any): string {
  if (children == null) return "";
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(flattenChildren).join("");
  return String(children);
}

function SmartText({ children, style, ...props }: any) {
  const text = flattenChildren(children);
  if (!text) return null;

  if (!hasArabic(text)) {
    return <Text style={style} {...props}>{text}</Text>;
  }

  const baseStyle = Array.isArray(style) ? Object.assign({}, ...style) : (style || {});

  const letterChars = text.split("").filter((c: string) => !/[\s\d\p{P}]/u.test(c));
  const arabicCount = letterChars.filter((c: string) => ARABIC_REGEX.test(c)).length;
  const allArabic = letterChars.length > 0 && arabicCount === letterChars.length;

  if (allArabic) {
    return (
      <Text style={{ ...baseStyle, fontFamily: "ArabicFont", textAlign: "right" as const, lineHeight: baseStyle.lineHeight || 1.8 }} {...props}>
        {text}
      </Text>
    );
  }

  const segments = splitMixedText(text);
  return (
    <Text style={{ ...baseStyle, fontFamily: "Helvetica" }} {...props}>
      {segments.map((seg, i) =>
        seg.isArabic ? (
          <Text key={i} style={{ fontFamily: "ArabicFont" }}>{seg.text}</Text>
        ) : (
          <Text key={i}>{seg.text}</Text>
        )
      )}
    </Text>
  );
}

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
    fontFamily: "ArabicFont",
    fontWeight: 700 as const,
    lineHeight: 1.8,
  },
  uzText: {
    fontSize: 10,
    color: colors.uzTranslation,
    marginBottom: 4,
    fontFamily: "Helvetica",
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
    fontFamily: "ArabicFont",
    fontWeight: 700 as const,
  },
  wordMapUz: {
    fontSize: 8,
    color: colors.uzTranslation,
    fontFamily: "Helvetica",
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
    fontFamily: "ArabicFont",
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
    fontFamily: "Helvetica",
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
      <Text style={styles.brandName}>TUBE MENTOR</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.level}>Daraja: {level}</Text>
    </View>
  );
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>Tube Mentor | tubementor.ai</Text>
      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) =>
          `${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

function TextBlocksSection({ blocks, targetLanguage = "ar" }: { blocks: SentenceBlock[]; targetLanguage?: string }) {
  if (!blocks.length) return null;
  const isArabic = targetLanguage === "ar";
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
          {block.sentence && block.wordMap && block.wordMap.length > 0 ? (
            <View style={{
              flexDirection: "row" as const,
              flexWrap: "wrap" as const,
              gap: 8,
              justifyContent: isArabic ? "flex-end" as const : "flex-start" as const,
              marginBottom: 6,
            }}>
              {isArabic ? (
                <>
                  <Text style={{ fontSize: 10, color: colors.gray, fontFamily: "Helvetica" }}>{block.index}.</Text>
                  {[...block.wordMap].reverse().map((w, wi) => {
                    const origIdx = block.wordMap!.length - 1 - wi;
                    const clr = WORD_COLORS[origIdx % WORD_COLORS.length];
                    return (
                      <View key={wi} style={{ alignItems: "center" as const }}>
                        <Text style={{ fontSize: 13, color: clr, fontFamily: "ArabicFont", fontWeight: 700 as const }}>{w.word}</Text>
                        <SmartText style={{ fontSize: 8, color: clr, fontWeight: 700 as const, marginTop: 1 }}>{w.translation}</SmartText>
                      </View>
                    );
                  })}
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 10, color: colors.gray, fontFamily: "Helvetica" }}>{block.index}.</Text>
                  {block.wordMap.map((w, wi) => {
                    const clr = WORD_COLORS[wi % WORD_COLORS.length];
                    return (
                      <View key={wi} style={{ alignItems: "center" as const }}>
                        <Text style={{ fontSize: 13, color: clr, fontFamily: "Helvetica-Bold" }}>{w.word}</Text>
                        <SmartText style={{ fontSize: 8, color: clr, fontWeight: 700 as const, marginTop: 1 }}>{w.translation}</SmartText>
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          ) : block.sentence ? (
            isArabic ? (
              <Text style={styles.arabicText}>{block.sentence}  {block.index}.</Text>
            ) : (
              <SmartText style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: colors.arabText, marginBottom: 4 }}>{`${block.index}. ${block.sentence}`}</SmartText>
            )
          ) : null}
          {block.translation ? (
            <SmartText style={styles.uzText}>{`${block.index}. ${block.translation}`}</SmartText>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function VocabularySection({ vocab, targetLanguage = "ar" }: { vocab: VocabEntry[]; targetLanguage?: string }) {
  if (!vocab.length) return null;
  const isArabic = targetLanguage === "ar";
  const wordLabel = isArabic ? "Arab so'zi" : "Ingliz so'zi";
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
          {wordLabel}
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
              isArabic ? {
                width: "25%",
                textAlign: "right" as const,
                fontFamily: "ArabicFont",
                fontWeight: 700 as const,
                color: colors.arabText,
                lineHeight: 1.6,
              } : {
                width: "25%",
                textAlign: "left" as const,
                fontFamily: "Helvetica-Bold",
                color: colors.arabText,
              },
            ]}
          >
            {v.word}
          </Text>
          <SmartText style={[styles.tableCell, { width: "25%" }]}>
            {v.translation}
          </SmartText>
          <SmartText
            style={[styles.tableCell, { width: "15%", color: colors.gray }]}
          >
            {v.partOfSpeech || "—"}
          </SmartText>
          <SmartText
            style={[styles.tableCell, { width: "30%", color: colors.gray }]}
          >
            {v.example || "—"}
          </SmartText>
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
          <View style={{ flexDirection: "row" as const, marginBottom: 6 }}>
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: colors.dark }}>{qi + 1}. </Text>
            <SmartText style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: colors.dark, flex: 1 }}>
              {q.question}
            </SmartText>
          </View>
          {q.options.map((opt, oi) => {
            const isCorrect = withAnswers && oi === q.correctIndex;
            const prefix = isCorrect ? `✓ ${String.fromCharCode(65 + oi)})` : `${String.fromCharCode(65 + oi)})`;
            return (
              <View key={oi} style={{ flexDirection: "row" as const, marginBottom: 3, paddingLeft: 12 }}>
                <Text style={{ fontSize: 9, color: isCorrect ? colors.brand : colors.dark, fontFamily: isCorrect ? "Helvetica-Bold" : "Helvetica", width: 28 }}>
                  {prefix}
                </Text>
                <SmartText style={{ fontSize: 9, color: isCorrect ? colors.brand : colors.dark, fontFamily: isCorrect ? "Helvetica-Bold" : "Helvetica", flex: 1 }}>
                  {opt}
                </SmartText>
              </View>
            );
          })}
          {withAnswers && q.explanation ? (
            <SmartText style={styles.quizExplanation}>{q.explanation}</SmartText>
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
            <SmartText style={styles.flashcardBack}>{f.back}</SmartText>
            {f.backAr ? (
              <Text style={{ fontSize: 11, color: colors.arabText, fontFamily: "ArabicFont", fontWeight: 700 as const, textAlign: "right" as const, lineHeight: 1.6, marginTop: 4 }}>
                {f.backAr}
              </Text>
            ) : null}
            {f.type ? (
              <SmartText
                style={{ fontSize: 7, color: colors.gray, marginTop: 4 }}
              >
                {f.type}
              </SmartText>
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
          <SmartText style={styles.summaryText}>{summary.summaryShort}</SmartText>
        </View>
      ) : null}
      {summary.summaryShortAr ? (
        <View style={styles.summaryBlock} wrap={false}>
          <Text style={styles.summaryLabel}>Qisqa xulosa (arabcha)</Text>
          <Text style={[styles.summaryText, { textAlign: "right" as const, fontFamily: "ArabicFont", lineHeight: 1.8 }]}>{summary.summaryShortAr}</Text>
        </View>
      ) : null}
      {summary.summaryDetailed ? (
        <View style={styles.summaryBlock} wrap={false}>
          <Text style={styles.summaryLabel}>Batafsil xulosa</Text>
          <SmartText style={styles.summaryText}>{summary.summaryDetailed}</SmartText>
        </View>
      ) : null}
      {summary.summaryDetailedAr ? (
        <View style={styles.summaryBlock} wrap={false}>
          <Text style={styles.summaryLabel}>Batafsil xulosa (arabcha)</Text>
          <Text style={[styles.summaryText, { textAlign: "right" as const, fontFamily: "ArabicFont", lineHeight: 1.8 }]}>{summary.summaryDetailedAr}</Text>
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
  const quizzes = prepareQuizzes(data, config);
  const flashcards = prepareFlashcards(data, config);
  const summary = prepareSummary(data, config);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header title={data.title} level={data.level} />
        <TextBlocksSection blocks={textBlocks} targetLanguage={data.targetLanguage} />
        <VocabularySection vocab={vocabulary} targetLanguage={data.targetLanguage} />
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
