export type PlatformId =
  | "capes" | "periodicos" | "doaj" | "bdtd" | "eric"
  | "pubmed" | "openalex" | "educapes" | "springer";

export interface Work {
  id: string;
  platform: string; // rótulo exibido; "Importado (RIS)" para importações manuais
  year: string;
  type: string;
  title: string;
  keywords: string;
  authors: string; // separados por ";"
  venue: string;
  issn: string;
  program: string;
  link: string;
  advisor: string;
  abstract: string;
  sequence: string;
  doi: string;
}

export interface Metrics { jcr: number | null; citeScore: number | null; h5: number | null; qualis: string }

export const EMPTY_METRICS: Metrics = { jcr: null, citeScore: null, h5: null, qualis: "" };

export type ScreeningRow = Work & { metrics: Metrics; decision: "" | "S" | "N" };

export interface PlatformInfo {
  id: PlatformId;
  label: string;
  pageSize: number;
  enabled: boolean;
  note?: string;
}
