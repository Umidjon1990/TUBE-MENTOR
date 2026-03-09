import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  ShadingType,
  convertInchesToTwip,
} from "docx";
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

const COLORS = {
  emerald: "047857",
  blue: "1D4ED8",
  amber: "B45309",
  cyan: "0891B2",
  violet: "7C3AED",
  gray: "6B7280",
  lightGray: "F3F4F6",
  white: "FFFFFF",
  black: "111827",
  brand: "0D9488",
};

function brandingHeader(title: string): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: "TUBE MENTOR AI",
          bold: true,
          size: 20,
          color: COLORS.brand,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: 36,
          color: COLORS.black,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 2, color: COLORS.brand },
      },
      children: [
        new TextRun({
          text: "O'qituvchi uchun ishchi varaq",
          size: 22,
          color: COLORS.gray,
          font: "Arial",
        }),
      ],
    }),
  ];
}

function sectionHeading(text: string, color: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 400, after: 200 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 28,
        color,
        font: "Arial",
      }),
    ],
  });
}

function buildTextSection(blocks: SentenceBlock[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  paragraphs.push(sectionHeading("Matn va Tarjima", COLORS.emerald));

  for (const block of blocks) {
    if (block.sentence) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          spacing: { before: 200, after: 80 },
          children: [
            new TextRun({
              text: block.sentence,
              size: 26,
              color: COLORS.emerald,
              font: "Arial",
              rightToLeft: true,
            }),
            new TextRun({
              text: `  ${block.index}.`,
              bold: true,
              size: 20,
              color: COLORS.gray,
              font: "Arial",
            }),
          ],
        })
      );
    }

    if (block.translation) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: `${block.index}. `,
              bold: true,
              size: 20,
              color: COLORS.gray,
              font: "Arial",
            }),
            new TextRun({
              text: block.translation,
              size: 22,
              color: COLORS.blue,
              font: "Arial",
            }),
          ],
        })
      );
    }

    if (block.wordMap && block.wordMap.length > 0) {
      const wordParts: TextRun[] = [];
      block.wordMap.forEach((w, idx) => {
        wordParts.push(
          new TextRun({
            text: w.word,
            bold: true,
            size: 20,
            color: COLORS.emerald,
            font: "Arial",
            rightToLeft: true,
          })
        );
        wordParts.push(
          new TextRun({
            text: `[${w.translation}]`,
            size: 18,
            color: COLORS.blue,
            font: "Arial",
          })
        );
        if (idx < block.wordMap!.length - 1) {
          wordParts.push(
            new TextRun({
              text: "   ",
              size: 18,
              font: "Arial",
            })
          );
        }
      });
      paragraphs.push(
        new Paragraph({
          spacing: { after: 150 },
          shading: { type: ShadingType.SOLID, color: "FFF0FDF4" },
          children: wordParts,
        })
      );
    }
  }

  return paragraphs;
}

function buildVocabularySection(vocab: VocabEntry[]): (Paragraph | Table)[] {
  if (vocab.length === 0) return [];
  const elements: (Paragraph | Table)[] = [];
  elements.push(sectionHeading("Lug'at", COLORS.cyan));

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        width: { size: 20, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.SOLID, color: COLORS.cyan },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Arab so'z", bold: true, size: 20, color: COLORS.white, font: "Arial" })],
          }),
        ],
      }),
      new TableCell({
        width: { size: 25, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.SOLID, color: COLORS.cyan },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Tarjima", bold: true, size: 20, color: COLORS.white, font: "Arial" })],
          }),
        ],
      }),
      new TableCell({
        width: { size: 15, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.SOLID, color: COLORS.cyan },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Turi", bold: true, size: 20, color: COLORS.white, font: "Arial" })],
          }),
        ],
      }),
      new TableCell({
        width: { size: 40, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.SOLID, color: COLORS.cyan },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Misol", bold: true, size: 20, color: COLORS.white, font: "Arial" })],
          }),
        ],
      }),
    ],
  });

  const dataRows = vocab.map(
    (v, idx) =>
      new TableRow({
        children: [
          new TableCell({
            shading: idx % 2 === 0 ? { type: ShadingType.SOLID, color: COLORS.lightGray } : undefined,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: v.word, size: 20, color: COLORS.emerald, font: "Arial", rightToLeft: true })],
              }),
            ],
          }),
          new TableCell({
            shading: idx % 2 === 0 ? { type: ShadingType.SOLID, color: COLORS.lightGray } : undefined,
            children: [
              new Paragraph({
                children: [new TextRun({ text: v.translation, size: 20, color: COLORS.blue, font: "Arial" })],
              }),
            ],
          }),
          new TableCell({
            shading: idx % 2 === 0 ? { type: ShadingType.SOLID, color: COLORS.lightGray } : undefined,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: v.partOfSpeech || "-", size: 18, color: COLORS.gray, font: "Arial" })],
              }),
            ],
          }),
          new TableCell({
            shading: idx % 2 === 0 ? { type: ShadingType.SOLID, color: COLORS.lightGray } : undefined,
            children: [
              new Paragraph({
                children: [new TextRun({ text: v.example || "-", size: 18, color: COLORS.gray, font: "Arial" })],
              }),
            ],
          }),
        ],
      })
  );

  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    })
  );

  return elements;
}

function buildPhrasesSection(phrases: PhraseEntry[]): Paragraph[] {
  if (phrases.length === 0) return [];
  const paragraphs: Paragraph[] = [];
  paragraphs.push(sectionHeading("Iboralar", COLORS.violet));

  phrases.forEach((p, idx) => {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 120, after: 40 },
        children: [
          new TextRun({
            text: `${idx + 1}. `,
            bold: true,
            size: 20,
            color: COLORS.gray,
            font: "Arial",
          }),
          new TextRun({
            text: p.phrase,
            bold: true,
            size: 22,
            color: COLORS.emerald,
            font: "Arial",
          }),
        ],
      })
    );
    paragraphs.push(
      new Paragraph({
        spacing: { after: 80 },
        indent: { left: convertInchesToTwip(0.3) },
        children: [
          new TextRun({
            text: p.translation,
            size: 20,
            color: COLORS.blue,
            font: "Arial",
          }),
        ],
      })
    );
    if (p.context) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 120 },
          indent: { left: convertInchesToTwip(0.3) },
          children: [
            new TextRun({
              text: `Kontekst: ${p.context}`,
              italics: true,
              size: 18,
              color: COLORS.gray,
              font: "Arial",
            }),
          ],
        })
      );
    }
  });

  return paragraphs;
}

function buildQuizSection(quizzes: QuizEntry[], withAnswers: boolean): Paragraph[] {
  if (quizzes.length === 0) return [];
  const paragraphs: Paragraph[] = [];
  paragraphs.push(
    sectionHeading(withAnswers ? "Test (Javoblar bilan)" : "Test", COLORS.blue)
  );

  quizzes.forEach((q, idx) => {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({
            text: `${idx + 1}. ${q.question}`,
            bold: true,
            size: 22,
            color: COLORS.black,
            font: "Arial",
          }),
        ],
      })
    );

    q.options.forEach((opt, optIdx) => {
      const isCorrect = withAnswers && optIdx === q.correctIndex;
      const letter = String.fromCharCode(65 + optIdx);
      paragraphs.push(
        new Paragraph({
          spacing: { after: 40 },
          indent: { left: convertInchesToTwip(0.4) },
          children: [
            new TextRun({
              text: `${letter}) ${opt}`,
              size: 20,
              bold: isCorrect,
              color: isCorrect ? COLORS.emerald : COLORS.black,
              font: "Arial",
            }),
            ...(isCorrect
              ? [
                  new TextRun({
                    text: "  \u2713",
                    bold: true,
                    size: 20,
                    color: COLORS.emerald,
                    font: "Arial",
                  }),
                ]
              : []),
          ],
        })
      );
    });

    if (withAnswers && q.explanation) {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 60, after: 120 },
          indent: { left: convertInchesToTwip(0.4) },
          children: [
            new TextRun({
              text: `Izoh: ${q.explanation}`,
              italics: true,
              size: 18,
              color: COLORS.gray,
              font: "Arial",
            }),
          ],
        })
      );
    }
  });

  if (!withAnswers) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 400 },
        children: [
          new TextRun({
            text: "Javoblar:",
            bold: true,
            size: 22,
            color: COLORS.black,
            font: "Arial",
          }),
        ],
      })
    );
    for (let i = 0; i < quizzes.length; i++) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: `${i + 1}. ___________`,
              size: 20,
              color: COLORS.gray,
              font: "Arial",
            }),
          ],
        })
      );
    }
  }

  return paragraphs;
}

function buildFlashcardsSection(flashcards: FlashcardEntry[]): (Paragraph | Table)[] {
  if (flashcards.length === 0) return [];
  const elements: (Paragraph | Table)[] = [];
  elements.push(sectionHeading("Flashkartalar", COLORS.violet));

  const rows: TableRow[] = [];
  for (let i = 0; i < flashcards.length; i += 2) {
    const cells: TableCell[] = [];
    for (let j = i; j < Math.min(i + 2, flashcards.length); j++) {
      const fc = flashcards[j];
      cells.push(
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          margins: {
            top: convertInchesToTwip(0.1),
            bottom: convertInchesToTwip(0.1),
            left: convertInchesToTwip(0.15),
            right: convertInchesToTwip(0.15),
          },
          shading: { type: ShadingType.SOLID, color: COLORS.lightGray },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.cyan },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.cyan },
            left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.cyan },
            right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.cyan },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 60 },
              children: [
                new TextRun({
                  text: fc.front,
                  bold: true,
                  size: 22,
                  color: COLORS.emerald,
                  font: "Arial",
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: fc.back,
                  size: 20,
                  color: COLORS.blue,
                  font: "Arial",
                }),
              ],
            }),
          ],
        })
      );
    }
    if (cells.length === 1) {
      cells.push(
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [] })],
        })
      );
    }
    rows.push(new TableRow({ children: cells }));
  }

  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    })
  );

  return elements;
}

function buildSummarySection(summary: SummaryData): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  paragraphs.push(sectionHeading("Xulosa", COLORS.brand));

  if (summary.summaryShort) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 100, after: 60 },
        children: [
          new TextRun({
            text: "Qisqa xulosa:",
            bold: true,
            size: 22,
            color: COLORS.black,
            font: "Arial",
          }),
        ],
      })
    );
    paragraphs.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: summary.summaryShort,
            size: 20,
            color: COLORS.gray,
            font: "Arial",
          }),
        ],
      })
    );
  }

  if (summary.summaryShortAr) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 100, after: 60 },
        children: [
          new TextRun({
            text: "Qisqa xulosa (arabcha):",
            bold: true,
            size: 22,
            color: COLORS.emerald,
            font: "Arial",
          }),
        ],
      })
    );
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: summary.summaryShortAr,
            size: 22,
            color: COLORS.emerald,
            font: "Arial",
            rightToLeft: true,
          }),
        ],
      })
    );
  }

  if (summary.summaryDetailed) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 100, after: 60 },
        children: [
          new TextRun({
            text: "Batafsil xulosa:",
            bold: true,
            size: 22,
            color: COLORS.black,
            font: "Arial",
          }),
        ],
      })
    );
    paragraphs.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: summary.summaryDetailed,
            size: 20,
            color: COLORS.gray,
            font: "Arial",
          }),
        ],
      })
    );
  }

  if (summary.summaryDetailedAr) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 100, after: 60 },
        children: [
          new TextRun({
            text: "Batafsil xulosa (arabcha):",
            bold: true,
            size: 22,
            color: COLORS.emerald,
            font: "Arial",
          }),
        ],
      })
    );
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: summary.summaryDetailedAr,
            size: 22,
            color: COLORS.emerald,
            font: "Arial",
            rightToLeft: true,
          }),
        ],
      })
    );
  }

  return paragraphs;
}

export async function generateDocx(
  data: LessonExportData,
  config: ExportConfig
): Promise<Blob> {
  const textBlocks = prepareTextBlocks(data, config);
  const vocab = prepareVocabulary(data, config);
  const phrases = preparePhrases(data, config);
  const quizzes = prepareQuizzes(data, config);
  const flashcards = prepareFlashcards(data, config);
  const summary = prepareSummary(data, config);

  const children: (Paragraph | Table)[] = [];

  children.push(...brandingHeader(data.title));

  if (textBlocks.length > 0) {
    children.push(...buildTextSection(textBlocks));
  }

  if (vocab.length > 0) {
    children.push(...buildVocabularySection(vocab));
  }

  if (phrases.length > 0) {
    children.push(...buildPhrasesSection(phrases));
  }

  if (quizzes.length > 0) {
    children.push(...buildQuizSection(quizzes, config.quizWithAnswers));
  }

  if (flashcards.length > 0) {
    children.push(...buildFlashcardsSection(flashcards));
  }

  if (summary) {
    children.push(...buildSummarySection(summary));
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
      border: {
        top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.brand },
      },
      children: [
        new TextRun({
          text: "Tube Mentor AI bilan tayyorlangan",
          size: 16,
          color: COLORS.gray,
          italics: true,
          font: "Arial",
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.8),
              bottom: convertInchesToTwip(0.8),
              left: convertInchesToTwip(0.8),
              right: convertInchesToTwip(0.8),
            },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBlob(doc);
  return buffer;
}

export function downloadDocx(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".docx") ? filename : `${filename}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
