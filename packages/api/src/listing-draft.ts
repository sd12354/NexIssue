import type { Comic } from "./queries/comics";

/** eBay Collectible Comic Books — override via server secret if needed. */
export const EBAY_COMIC_CATEGORY_ID = "259104";

export type ListingDraft = {
  title: string;
  description: string;
  itemSpecifics: Record<string, string>;
  suggestedPrice: number | null;
  categoryId: string;
  categoryLabel: string;
};

const TITLE_MAX = 80;

function formatGrade(grade: Comic["grade"]): string | null {
  if (grade == null) return null;
  return Number(grade).toFixed(1);
}

function truncateTitle(value: string): string {
  if (value.length <= TITLE_MAX) return value;
  return `${value.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

function buildTitle(comic: Comic): string {
  const parts: string[] = [];
  if (comic.title) parts.push(comic.title.trim());
  if (comic.issue) parts.push(`#${comic.issue.trim()}`);
  const grade = formatGrade(comic.grade);
  if (grade) parts.push(`${comic.grader} ${grade}`);
  const keyNote = (comic.key_notes ?? []).find((n) => n.trim());
  if (keyNote) parts.push(keyNote.trim());
  if (comic.variant?.trim()) parts.push(comic.variant.trim());
  const joined = parts.filter(Boolean).join(" ");
  return truncateTitle(joined || `Graded Comic ${comic.cert_number}`);
}

function buildItemSpecifics(comic: Comic): Record<string, string> {
  const specifics: Record<string, string> = {
    "Professional Grader": comic.grader,
    "Certification Number": comic.cert_number,
    Graded: "Yes",
  };
  const grade = formatGrade(comic.grade);
  if (grade) specifics.Grade = grade;
  if (comic.issue?.trim()) specifics["Issue Number"] = comic.issue.trim();
  if (comic.year != null) specifics["Publication Year"] = String(comic.year);
  if (comic.variant?.trim()) specifics.Variant = comic.variant.trim();
  if (comic.encapsulation_date?.trim()) {
    specifics["Encapsulation Date"] = comic.encapsulation_date.trim();
  }
  const keyNotes = (comic.key_notes ?? []).filter((n) => n.trim());
  if (keyNotes.length > 0) specifics["Key Notes"] = keyNotes.join("; ");
  return specifics;
}

function buildDescription(comic: Comic, specifics: Record<string, string>): string {
  const titleLine = [comic.title, comic.issue ? `#${comic.issue}` : null]
    .filter(Boolean)
    .join(" ");
  const grade = formatGrade(comic.grade);
  const lines: string[] = [
    "<p><strong>Graded comic slab for sale.</strong></p>",
    "<ul>",
  ];
  if (titleLine) lines.push(`<li><strong>Title:</strong> ${escapeHtml(titleLine)}</li>`);
  if (grade) {
    lines.push(
      `<li><strong>Grade:</strong> ${escapeHtml(comic.grader)} ${escapeHtml(grade)}</li>`,
    );
  }
  lines.push(
    `<li><strong>Certification #:</strong> ${escapeHtml(comic.cert_number)}</li>`,
  );
  for (const [label, value] of Object.entries(specifics)) {
    if (label === "Professional Grader" || label === "Certification Number" || label === "Grade") {
      continue;
    }
    lines.push(`<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`);
  }
  lines.push("</ul>");
  lines.push(
    "<p>Ships securely with slab protected. Photos are of the actual item you will receive.</p>",
  );
  return lines.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function suggestPrice(comic: Comic): number | null {
  const cost = comic.acquired_cost;
  if (cost == null || cost <= 0) return null;
  return Math.round(cost * 1.25 * 100) / 100;
}

/**
 * Build an eBay listing draft from catalog comic data (PRD §5.4).
 * Title is templated from issue + grade + key notes; description and item
 * specifics are derived from the same fields.
 */
export function generateListingDraft(comic: Comic): ListingDraft {
  const itemSpecifics = buildItemSpecifics(comic);
  return {
    title: buildTitle(comic),
    description: buildDescription(comic, itemSpecifics),
    itemSpecifics,
    suggestedPrice: suggestPrice(comic),
    categoryId: EBAY_COMIC_CATEGORY_ID,
    categoryLabel: "Collectible Comic Books",
  };
}
