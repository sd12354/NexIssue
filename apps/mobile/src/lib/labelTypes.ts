import type { Grader } from "./cert";

export type OcrConfidence = "high" | "low";

/** Parsed fields from a CGC slab label (editable on confirm screen). */
export type ParsedLabelFields = {
  title: string;
  issue: string;
  variant: string;
  grade: string;
  year: string;
  pageColor: string;
  encapsulationDate: string;
  keyNotes: string;
};

export function emptyLabelFields(): ParsedLabelFields {
  return {
    title: "",
    issue: "",
    variant: "",
    grade: "",
    year: "",
    pageColor: "",
    encapsulationDate: "",
    keyNotes: "",
  };
}

export type LabelParseResult = {
  fields: ParsedLabelFields;
  confidence: OcrConfidence;
  rawText: string;
};

export type CapturedCovers = {
  front: {
    uri: string;
    contentType: "image/png" | "image/jpeg";
    extension: "png" | "jpg";
    backgroundRemoved: boolean;
  };
  back: {
    uri: string;
    contentType: "image/png" | "image/jpeg";
    extension: "png" | "jpg";
    backgroundRemoved: boolean;
  };
};

export type CertConfirmParams = {
  grader: Grader;
  certNumber: string;
  label?: ParsedLabelFields;
  rawOcrText?: string;
  ocrConfidence?: OcrConfidence;
  covers?: CapturedCovers;
};
