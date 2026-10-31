// Port of Filtra and Tipologia_Converte (a_Codigos).
// The VBA did ~300 manual replacements because it read responses as raw text. Responses here are already
// UTF-8, so decoding entities and fixing mojibake is enough. Its swaps of Greek/Cyrillic letters for
// lookalikes (α → a, б → 6) were NOT ported: they corrupted the data.

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", deg: "º", ordm: "º", ordf: "ª", reg: "®", acute: "´",
  aacute: "á", Aacute: "Á", acirc: "â", Acirc: "Â", agrave: "à", Agrave: "À", atilde: "ã", Atilde: "Ã",
  eacute: "é", Eacute: "É", ecirc: "ê", Ecirc: "Ê", egrave: "è", Egrave: "È",
  iacute: "í", Iacute: "Í", igrave: "ì", Igrave: "Ì", oacute: "ó", Oacute: "Ó", ocirc: "ô", Ocirc: "Ô",
  otilde: "õ", Otilde: "Õ", ouml: "ö", Ouml: "Ö", uacute: "ú", Uacute: "Ú", uuml: "ü", Uuml: "Ü",
  ntilde: "ñ", Ntilde: "Ñ", ccedil: "ç", Ccedil: "Ç", yacute: "ý", Yacute: "Ý",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] !== "#") return NAMED[code] ?? match;
    const value = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return value <= 0x10ffff ? String.fromCodePoint(value) : match;
  });
}

function fixMojibake(text: string): string {
  if (!/Ã[\u0080-¿]|â€/.test(text)) return text;
  const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
  if (bytes.some((_, i) => text.charCodeAt(i) > 255)) return text;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return text;
  }
}

export function cleanText(input: unknown): string {
  if (input === null || input === undefined) return "";
  let text = fixMojibake(decodeEntities(String(input)));
  text = text
    .replace(/<[^>]+>/g, " ")
    .replace(/\[Periódico revisado por pares\]/g, "")
    .replace(/Directory of Open Access Journals \(DOAJ\)/g, "")
    .replace(/[​﻿]/g, "")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’′]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/ :/g, ":")
    .trim()
    .normalize("NFC");
  const books = text.toUpperCase().indexOf("SCIELO BOOKS");
  if (books >= 0) text = text.slice(0, books).trim();
  return text.replace(/^(resumo|background):?\s+/i, "");
}

const TYPES: Record<string, string> = {
  "TESE": "Doutorado", "DOCTORALTHESIS": "Doutorado", "TESE DE DOUTORADO": "Doutorado", "DOUTORADO": "Doutorado",
  "DISSERTAÇÃO": "Mestrado", "MASTERTHESIS": "Mestrado", "DISSERTAÇÃO DE MESTRADO": "Mestrado", "MESTRADO": "Mestrado",
  "MESTRADO PROFISSIONAL": "Mestrado Profissional", "DOUTORADO PROFISSIONAL": "Doutorado Profissional",
  "TCC": "Graduação",
  "BOOK": "Livro", "BOOK AND CONFERENCE PROCEEDINGS": "Livro",
  "CHAPTER AND CONFERENCE PAPER": "Capítulo", "CHAPTER": "Capítulo", "BOOK_CHAPTER": "Capítulo", "BOOK-CHAPTER": "Capítulo",
  "ARTICLE": "Artigo", "JOUR": "Artigo", "EDITORIAL INTRODUCTORY JOURNAL ARTICLE": "Artigo",
  "REFERENCE WORK ENTRY": "Trabalho de Referência", "LIVING REFERENCE WORK ENTRY": "Trabalho de Referência",
  "BOOK AND REFERENCE WORK": "Trabalho de Referência", "REFERENCE_ENTRY": "Trabalho de Referência",
  "REFERENCEWORKENTRY": "Trabalho de Referência", "REFERENCEWORK": "Trabalho de Referência",
  "CONFERENCE_PROCEEDING": "Anais de Conferência", "CONFERENCEPAPER": "Anais de Conferência",
  "DISSERTATION": "Dissertação", "REPORT": "Relatório", "SYSTEMATIC REVIEW": "Revisão Sistemática",
  "REVIEW": "Revisão", "LETTER": "Carta", "CONGRESS": "Congresso", "EDITORIAL": "Editorial",
  "RANDOMIZED CONTROLLED TRIAL": "Ensaio Clínico Randomizado Controlado",
  "CASE REPORTS": "Relatos de Casos", "OBSERVATIONAL STUDY": "Estudo de Observação",
  "META-ANALYSIS SYSTEMATIC REVIEW": "Revisão Sistemática de Meta-Análise",
  "PRACTICE GUIDELINE": "Orientação de Prática", "PUBLISHED ERRATUM": "Errata de Publicação",
};

export function convertType(raw: string): string {
  const key = raw.trim().toUpperCase();
  return TYPES[key] ?? key;
}
