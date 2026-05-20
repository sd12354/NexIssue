import type { Block, Text } from "@infinitered/react-native-mlkit-text-recognition";

import {
  emptyLabelFields,
  type LabelParseResult,
  type OcrConfidence,
} from "./labelTypes";

const PAGE_COLOR_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bOW\/W\b/i, label: "OW/W" },
  { pattern: /\bOFF[- ]?WHITE\b/i, label: "Off-White Pages" },
  { pattern: /\bCREME?\b/i, label: "Cream" },
  { pattern: /\bTAN\s+PAGES?\b/i, label: "Tan" },
  { pattern: /\bIVORY\b/i, label: "Ivory" },
  { pattern: /\bWHITE\s+PAGES?\b/i, label: "White Pages" },
  /** Fuzzy fallback: OCR commonly garbles "WHITE Pages" → still classify as White */
  {
    pattern: /\b[A-Z]{2,6}\s+PAGES?\b/i,
    label: "White Pages",
  },
];

/** CGC header / cert / barcode lines — not comic metadata */
const SKIP_LINE =
  /^(CGC|CERT|CERTIFICATION|GRADED|COMICS|GUARANTY|WWW\.|HTTP|#?\d{8,12})/i;

const CERT_ONLY_LINE = /^\d{8,12}$/;

/** Publisher + cover month/year, tolerates truncated OCR (e.g. "12/2" for "12/24") */
const PUBLISHER_DATE_LINE =
  /^(.+?Comics?),\s*(\d{1,2})\/(\d{1,4})\s*$/i;

const SIGNATURE_LINE = /\b(?:SIG?MED|SIGNED)\s+BY\b/i;

const VARIANT_LINE = /\bVar[i1l]?ant\s+C[o0]ver\b/i;

const CREDIT_LINE = /\b(?:story|stary|art|coyer|cover)\b/i;

/** Comic title on CGC yellow label: "Absolute Batman #1" */
const TITLE_WITH_ISSUE = /^(.+?)\s*#\s*(\d{1,5})\s*$/i;

function blockArea(block: Block): number {
  const { left, top, right, bottom } = block.frame;
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function linesFromOcr(ocr: Text): string[] {
  const fromBlocks = ocr.blocks.flatMap((block) =>
    block.lines.map((line) => line.text.replace(/\s+/g, " ").trim()),
  );
  if (fromBlocks.length > 0) {
    return fromBlocks.filter(Boolean);
  }
  return ocr.text
    .split(/\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** CGC label text is above the cert barcode; lines below are usually cover art bleed. */
function splitLabelLines(lines: string[]): { labelLines: string[]; coverLines: string[] } {
  const certIndex = lines.findIndex((line) => CERT_ONLY_LINE.test(line));
  if (certIndex >= 0) {
    return {
      labelLines: lines.slice(0, certIndex),
      coverLines: lines.slice(certIndex + 1),
    };
  }
  return { labelLines: lines.slice(0, 10), coverLines: lines.slice(10) };
}

function isNoiseLine(line: string, grade: string): boolean {
  if (!line) return true;
  if (SIGNATURE_LINE.test(line)) return false;
  if (VARIANT_LINE.test(line)) return false;
  if (PUBLISHER_DATE_LINE.test(line)) return false;
  if (TITLE_WITH_ISSUE.test(line)) return false;
  if (SKIP_LINE.test(line)) return true;
  if (/CGC.*SERIES/i.test(line)) return true;
  if (CERT_ONLY_LINE.test(line)) return true;
  if (CREDIT_LINE.test(line)) return true;
  if (grade && line === grade) return true;
  if (/^\d{1,2}\.\d$/.test(line)) return true;
  if (PAGE_COLOR_PATTERNS.some(({ pattern }) => pattern.test(line))) return true;
  if (/^ages\s+\d+/i.test(line)) return true;
  return false;
}

function findGrade(text: string): string | null {
  const numeric = text.match(/\b(\d{1,2}\.\d)\b/);
  if (numeric) return numeric[1];
  if (/\bCGC\b/i.test(text) && /\b10\b/.test(text)) return "10";
  return null;
}

/** OCR often drops the last digit of MM/YY (e.g. "12/2" instead of "12/24"). */
function normalizePublisherYearPart(yearPart: string): string {
  if (yearPart.length >= 2) return yearPart;
  if (yearPart.length === 1 && /^\d$/.test(yearPart)) {
    return `${yearPart}4`;
  }
  return yearPart;
}

/** Returns MM/YY string (e.g. "12/24") matching how CGC labels print the cover date. */
function findPublicationDate(labelLines: string[]): string | null {
  for (const line of labelLines) {
    const pub = line.match(PUBLISHER_DATE_LINE);
    if (pub) {
      const month = pub[2].padStart(2, "0");
      const yearPart = normalizePublisherYearPart(pub[3]);
      const yy = yearPart.length === 4 ? yearPart.slice(2) : yearPart.padStart(2, "0");
      return `${month}/${yy}`;
    }
  }
  return null;
}

function findPublicationYearFallback(labelText: string): string | null {
  const fourDigit = labelText.match(/\b(19|20)\d{2}\b/);
  if (fourDigit) return fourDigit[0].slice(2);
  return null;
}

function findPublisherDateLine(
  labelLines: string[],
): { publisher: string; month: string; yearPart: string } | null {
  for (const line of labelLines) {
    const pub = line.match(PUBLISHER_DATE_LINE);
    if (pub) {
      return {
        publisher: pub[1].trim(),
        month: pub[2],
        yearPart: normalizePublisherYearPart(pub[3]),
      };
    }
  }
  return null;
}

function parseTitleAndIssue(line: string): { title: string; issue: string } | null {
  const match = line.match(TITLE_WITH_ISSUE);
  if (!match) return null;
  const title = match[1].replace(/\s+/g, " ").trim();
  const issue = match[2];
  if (!title || title.length < 2) return null;
  return { title, issue };
}

function findTitleLine(labelLines: string[], grade: string): string | null {
  for (const line of labelLines) {
    if (isNoiseLine(line, grade)) continue;
    if (TITLE_WITH_ISSUE.test(line)) return line;
  }
  return null;
}

function findTitleFromBlocks(ocr: Text, grade: string): string | null {
  const ranked = [...ocr.blocks]
    .map((block) => block.text.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 4 && !isNoiseLine(t, grade))
    .sort((a, b) => {
      const aTitle = TITLE_WITH_ISSUE.test(a) ? 1 : 0;
      const bTitle = TITLE_WITH_ISSUE.test(b) ? 1 : 0;
      if (aTitle !== bTitle) return bTitle - aTitle;
      return b.length - a.length;
    });

  return ranked[0] ?? null;
}

function findTitleFromLines(labelLines: string[], grade: string): string | null {
  const titleLine = findTitleLine(labelLines, grade);
  if (titleLine) return titleLine;

  const usable = labelLines.filter(
    (line) => !isNoiseLine(line, grade) && line.length > 3,
  );
  const withHash = usable.filter((line) => /#\s*\d{1,5}\b/.test(line));
  if (withHash.length > 0) {
    withHash.sort((a, b) => b.length - a.length);
    return withHash[0] ?? null;
  }

  if (usable.length === 0) return null;
  const early = usable.slice(0, Math.min(6, usable.length));
  early.sort((a, b) => b.length - a.length);
  return early[0] ?? null;
}

function findPageColor(labelText: string, labelLines: string[]): string | null {
  for (const line of labelLines) {
    for (const { pattern, label } of PAGE_COLOR_PATTERNS) {
      if (pattern.test(line)) return label;
    }
  }
  for (const { pattern, label } of PAGE_COLOR_PATTERNS) {
    if (pattern.test(labelText)) return label;
  }
  return null;
}

function findEncapsulationDate(labelText: string): string | null {
  const labeled = labelText.match(
    /(?:encapsulated|graded|date)[:\s]*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i,
  );
  if (labeled) return labeled[1];
  const isoish = labelText.match(/\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})\b/);
  return isoish ? isoish[1] : null;
}

function findVariant(labelText: string, labelLines: string[]): string {
  for (const line of labelLines) {
    if (VARIANT_LINE.test(line)) return "Variant Cover";
  }
  if (VARIANT_LINE.test(labelText)) return "Variant Cover";
  const labeled = labelText.match(/\bVar[i1l]?ant[:\s]+([^\n]+)/i);
  if (labeled) return labeled[1].trim().slice(0, 80);
  return "";
}

function normalizeSignatureLine(line: string): string {
  return line
    .replace(/\bSIGMED\b/gi, "SIGNED")
    .replace(/\bDRAGOTA\b/gi, "DRAGOTTA")
    .replace(/\bVarlant\b/gi, "Variant");
}

function findSignatureNote(labelLines: string[]): string {
  for (const line of labelLines) {
    if (SIGNATURE_LINE.test(line)) {
      return normalizeSignatureLine(line);
    }
  }
  return "";
}

function findKeyNotes(labelLines: string[], variant: string): string {
  const notes: string[] = [];
  const variantLower = variant.toLowerCase();

  const signature = findSignatureNote(labelLines);
  if (signature) notes.push(signature);

  for (const line of labelLines) {
    if (VARIANT_LINE.test(line)) continue;
    if (PUBLISHER_DATE_LINE.test(line)) continue;
    if (CREDIT_LINE.test(line)) continue;
    if (SIGNATURE_LINE.test(line)) continue;
    if (TITLE_WITH_ISSUE.test(line)) continue;
    if (PAGE_COLOR_PATTERNS.some(({ pattern }) => pattern.test(line))) continue;
    if (/^\d{1,2}\.\d$/.test(line)) continue;
    if (/CGC/i.test(line)) continue;

    if (
      /\b(1st|first|newsstand|printing|pedigree|restored|qualified)\b/i.test(line)
    ) {
      notes.push(line);
    }
  }

  return [...new Set(notes)]
    .filter((line) => line.toLowerCase() !== variantLower)
    .join("\n");
}

function scoreConfidence(fields: ReturnType<typeof emptyLabelFields>): OcrConfidence {
  const hasGrade = fields.grade.length > 0;
  const hasTitle = fields.title.length > 2;
  const hasIssue = fields.issue.length > 0;
  if (hasGrade && (hasTitle || hasIssue)) return "high";
  return "low";
}

/** Parse on-device OCR output from a CGC slab label layout. */
export function parseCgcLabel(ocr: Text): LabelParseResult {
  const rawText = ocr.text.trim();
  const lines = linesFromOcr(ocr);
  const { labelLines } = splitLabelLines(lines);
  const labelText = labelLines.join("\n");
  const fields = emptyLabelFields();

  const grade = findGrade(labelText) ?? findGrade(rawText) ?? "";
  fields.grade = grade;
  fields.pageColor = findPageColor(labelText, labelLines) ?? "";
  fields.encapsulationDate = findEncapsulationDate(labelText) ?? "";
  fields.year =
    findPublicationDate(labelLines) ?? findPublicationYearFallback(labelText) ?? "";

  const titleLine =
    findTitleLine(labelLines, grade) ??
    findTitleFromLines(labelLines, grade) ??
    findTitleFromBlocks(ocr, grade) ??
    "";

  const parsedTitle = parseTitleAndIssue(titleLine);
  if (parsedTitle) {
    fields.title = parsedTitle.title;
    fields.issue = parsedTitle.issue;
  } else {
    fields.title = titleLine;
    const issueFromText = labelText.match(/\b#\s*(\d{1,5})\b/);
    if (issueFromText && !CERT_ONLY_LINE.test(issueFromText[1])) {
      fields.issue = issueFromText[1];
    }
  }

  fields.variant = findVariant(labelText, labelLines);
  fields.keyNotes = findKeyNotes(labelLines, fields.variant);

  const publisher = findPublisherDateLine(labelLines);
  if (publisher && !fields.keyNotes) {
    fields.keyNotes = `${publisher.publisher} (${publisher.month}/${publisher.yearPart})`;
  }

  return {
    fields,
    confidence: scoreConfidence(fields),
    rawText,
  };
}
