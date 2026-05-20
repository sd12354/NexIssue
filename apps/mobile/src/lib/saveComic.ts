import {
  createComic,
  uploadComicPhoto,
  type Comic,
  type ComicInsert,
} from "@app/api";

import { supabase } from "./supabase";
import type { CapturedCovers, ParsedLabelFields } from "./labelTypes";
import { readCoverBytes } from "./coverPipeline";

export type SaveComicInput = {
  orgId: string;
  userId: string;
  grader: "CGC" | "CBCS";
  certNumber: string;
  label: ParsedLabelFields;
  covers: CapturedCovers;
};

function parseGrade(input: string): number | null {
  if (!input) return null;
  const match = input.match(/(\d{1,2}(?:\.\d)?)/);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (Number.isNaN(value)) return null;
  return value;
}

function parseYear(input: string): number | null {
  if (!input) return null;
  const four = input.match(/\b(19|20)\d{2}\b/);
  if (four) return Number.parseInt(four[0], 10);
  const mmYy = input.match(/^(\d{1,2})\/(\d{2})$/);
  if (mmYy) {
    const yy = Number.parseInt(mmYy[2], 10);
    return yy >= 50 ? 1900 + yy : 2000 + yy;
  }
  return null;
}

function parseEncapsulationDate(input: string): string | null {
  if (!input) return null;
  const match = input.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!match) return null;
  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  const yearRaw = match[3];
  const year =
    yearRaw.length === 4
      ? yearRaw
      : Number.parseInt(yearRaw, 10) >= 50
        ? `19${yearRaw}`
        : `20${yearRaw}`;
  return `${year}-${month}-${day}`;
}

function splitKeyNotes(input: string): string[] {
  if (!input) return [];
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export type SavedComic = {
  comic: Comic;
};

export async function saveComicAndCovers(
  input: SaveComicInput,
): Promise<SavedComic> {
  const insert: ComicInsert = {
    org_id: input.orgId,
    cert_number: input.certNumber,
    grader: input.grader,
    title: input.label.title || null,
    issue: input.label.issue || null,
    variant: input.label.variant || null,
    grade: parseGrade(input.label.grade),
    year: parseYear(input.label.year),
    encapsulation_date: parseEncapsulationDate(input.label.encapsulationDate),
    key_notes: splitKeyNotes(input.label.keyNotes),
    created_by: input.userId,
    status: "in_inventory",
  };

  const comic = await createComic(supabase, insert);

  const [frontBytes, backBytes] = await Promise.all([
    readCoverBytes(input.covers.front.uri),
    readCoverBytes(input.covers.back.uri),
  ]);

  await uploadComicPhoto(supabase, {
    orgId: input.orgId,
    comicId: comic.id,
    position: "front",
    body: frontBytes,
    contentType: input.covers.front.contentType,
    extension: input.covers.front.extension,
  });

  await uploadComicPhoto(supabase, {
    orgId: input.orgId,
    comicId: comic.id,
    position: "back",
    body: backBytes,
    contentType: input.covers.back.contentType,
    extension: input.covers.back.extension,
  });

  return { comic };
}
