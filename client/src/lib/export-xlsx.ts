import ExcelJS from "exceljs";
import type { VocabEntry, LessonExportData, ExportConfig } from "./export-types";
import { prepareVocabulary } from "./export-transform";

const BRAND = "Tube Mentor AI";

const COLORS = {
  headerBg: "FF10B981",
  headerFont: "FFFFFFFF",
  altRowBg: "FFF0FDF4",
  borderColor: "FFD1D5DB",
  titleBg: "FF065F46",
  titleFont: "FFFFFFFF",
};

function applyHeaderStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: COLORS.headerFont }, size: 11 };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.headerBg },
  };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = {
    top: { style: "thin", color: { argb: COLORS.borderColor } },
    bottom: { style: "thin", color: { argb: COLORS.borderColor } },
    left: { style: "thin", color: { argb: COLORS.borderColor } },
    right: { style: "thin", color: { argb: COLORS.borderColor } },
  };
}

function applyDataCell(cell: ExcelJS.Cell, isAlt: boolean, isArabic = false) {
  if (isAlt) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.altRowBg },
    };
  }
  cell.alignment = {
    vertical: "middle",
    horizontal: isArabic ? "right" : "left",
    wrapText: true,
  };
  cell.border = {
    top: { style: "thin", color: { argb: COLORS.borderColor } },
    bottom: { style: "thin", color: { argb: COLORS.borderColor } },
    left: { style: "thin", color: { argb: COLORS.borderColor } },
    right: { style: "thin", color: { argb: COLORS.borderColor } },
  };
  cell.font = { size: 11 };
}

export async function generateXLSX(
  data: LessonExportData,
  config: ExportConfig
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = BRAND;
  workbook.created = new Date();

  const vocab = prepareVocabulary(data, config);
  addVocabularySheet(workbook, vocab, data.title);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function addVocabularySheet(
  workbook: ExcelJS.Workbook,
  vocab: VocabEntry[],
  title: string
) {
  const sheet = workbook.addWorksheet("Lug'at");

  sheet.columns = [
    { key: "num", width: 6 },
    { key: "word", width: 22 },
    { key: "translation", width: 24 },
    { key: "partOfSpeech", width: 14 },
    { key: "example", width: 34 },
    { key: "difficulty", width: 12 },
  ];

  const titleRow = sheet.addRow([`${title} — Lug'at ro'yxati`]);
  sheet.mergeCells(titleRow.number, 1, titleRow.number, 6);
  const titleCell = titleRow.getCell(1);
  titleCell.font = { bold: true, size: 14, color: { argb: COLORS.titleFont } };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.titleBg },
  };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  titleRow.height = 30;

  const brandRow = sheet.addRow([BRAND]);
  sheet.mergeCells(brandRow.number, 1, brandRow.number, 6);
  const brandCell = brandRow.getCell(1);
  brandCell.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
  brandCell.alignment = { horizontal: "center" };

  sheet.addRow([]);

  const headers = ["#", "Arab so'z", "O'zbek tarjima", "So'z turi", "Misol", "Daraja"];
  const headerRow = sheet.addRow(headers);
  headerRow.height = 24;
  headerRow.eachCell((cell) => applyHeaderStyle(cell));

  vocab.forEach((entry, idx) => {
    const row = sheet.addRow([
      idx + 1,
      entry.word,
      entry.translation,
      entry.partOfSpeech || "",
      entry.example || "",
      entry.difficulty || "",
    ]);
    const isAlt = idx % 2 === 1;
    row.eachCell((cell, colNumber) => {
      const isArabic = colNumber === 2;
      applyDataCell(cell, isAlt, isArabic);
    });
  });

  sheet.addRow([]);
  const footerRow = sheet.addRow([`Jami: ${vocab.length} ta so'z`]);
  sheet.mergeCells(footerRow.number, 1, footerRow.number, 6);
  const footerCell = footerRow.getCell(1);
  footerCell.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
  footerCell.alignment = { horizontal: "right" };
}
