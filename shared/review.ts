// Port das regras das abas Resultados, Tratamento e Seleção Qualificada.
import type { Metrics, ScreeningRow, Work } from "./types.ts";

function normalizeTitle(title: string): string {
  return title.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * Duplicados_btn: mantém a primeira ocorrência. A planilha compara só o título (exato, sem distinguir
 * caixa); aqui ignora também acentos e pontuação e compara o DOI, pois as bases grafam o mesmo título
 * de formas diferentes. Trabalhos sem título não são tratados como duplicados entre si.
 */
export function dedupe(works: Work[]): { works: Work[]; removed: number } {
  const seen = new Set<string>();
  const kept = works.filter((work) => {
    const keys = [work.doi && `doi:${work.doi.toLowerCase()}`, normalizeTitle(work.title) && `t:${normalizeTitle(work.title)}`]
      .filter(Boolean) as string[];
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
  return { works: kept, removed: works.length - kept.length };
}

/** Fórmula de Tratamento: ocorrências do termo em Título & Palavras-chave, sem separador e sem distinguir caixa. */
export function countTerm(work: Pick<Work, "title" | "keywords">, term: string): number {
  if (!term) return 0;
  return (work.title + work.keywords).toUpperCase().split(term.toUpperCase()).length - 1;
}

/** Periódicos só recebem métricas se forem artigos fora das bases de teses (Revisao_Transportar). */
export function eligibleForMetrics(work: Pick<Work, "platform" | "type">): boolean {
  return !isThesisPlatform(work.platform) && work.type === "Artigo";
}

function isThesisPlatform(platform: string): boolean {
  return platform === "CAPES T&D" || platform === "BDTD";
}

export interface MetricFilters { jcr: string; citeScore: string; h5: string; qualis: string }

export const EMPTY_FILTERS: MetricFilters = { jcr: "", citeScore: "", h5: "", qualis: "" };
export const QUALIS = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4", "B5", "C"];

function parseThreshold(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return value.trim() === "" || Number.isNaN(parsed) ? null : parsed;
}

/**
 * Revisao_Filtrar. A planilha codifica as mesmas regras gravando 999/A0 (passa) e 0/D0 (reprova) nas
 * células antes de aplicar o AutoFiltro:
 * - teses e não-artigos passam sempre;
 * - artigo com valor em algum filtro ativo: filtros ativos sem valor no artigo são ignorados;
 * - artigo sem valor em nenhum filtro ativo: reprova.
 */
export function passesMetricFilters(row: Pick<Work, "platform" | "type"> & { metrics: Metrics }, filters: MetricFilters): boolean {
  const numeric = [
    [row.metrics.jcr, parseThreshold(filters.jcr)],
    [row.metrics.citeScore, parseThreshold(filters.citeScore)],
    [row.metrics.h5, parseThreshold(filters.h5)],
  ] as const;
  const active = numeric.filter(([, limit]) => limit !== null);
  const qualisLimit = QUALIS.indexOf(filters.qualis);
  if (active.length === 0 && qualisLimit < 0) return true;
  if (isThesisPlatform(row.platform) || row.type !== "Artigo") return true;

  const hasValue = active.some(([value]) => value !== null) || (qualisLimit >= 0 && row.metrics.qualis !== "");
  if (!hasValue) return false;
  const numericOk = active.every(([value, limit]) => value === null || value >= limit!);
  const qualisRank = QUALIS.indexOf(row.metrics.qualis);
  const qualisOk = qualisLimit < 0 || qualisRank < 0 || qualisRank <= qualisLimit;
  return numericOk && qualisOk;
}

function roundOne(value: number): number {
  return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 10) / 10;
}

/** Média e desvio-padrão populacional (STDEVP) de todas as notas de todos os avaliadores, com 1 casa. */
export function scoreSummary(scores: number[]): { mean: number | null; sd: number | null } {
  if (scores.length === 0) return { mean: null, sd: null };
  const mean = scores.reduce((sum, v) => sum + v, 0) / scores.length;
  const variance = scores.reduce((sum, v) => sum + (v - mean) ** 2, 0) / scores.length;
  return { mean: roundOne(mean), sd: roundOne(Math.sqrt(variance)) };
}

export type { ScreeningRow };
