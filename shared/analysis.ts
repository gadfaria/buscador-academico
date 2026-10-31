// Port de n_Analise: Buscar_Autores, Buscar_Orientadores, Buscar_Periodicos, Buscar_Anos, Gerar_Nuvem.
import { countTerm } from "./review.ts";
import type { Work } from "./types.ts";

export interface Tally { label: string; count: number }

/** "Maria A. de Souza" ou "Souza, Maria A." viram "SOUZA, M. A. D." como na planilha. */
export function normalizePerson(raw: string): string {
  let name = raw.trim().toUpperCase().replaceAll(".", "");
  const comma = name.indexOf(",");
  if (comma >= 0) name = `${name.slice(comma + 1).trim()} ${name.slice(0, comma).trim()}`;
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  const last = parts[parts.length - 1];
  return `${last}, ${parts.slice(0, -1).map((p) => `${p[0]}.`).join(" ")}`;
}

function splitPeople(field: string): string[] {
  return field
    .replaceAll(" Ed.", "")
    .replaceAll(" ", " ")
    .replace(/\[[^\]]*\]/g, "")
    .split(";")
    .map(normalizePerson)
    .filter(Boolean);
}

function tally(values: string[]): Tally[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([label, count]) => ({ label, count }));
}

const byCount = (a: Tally, b: Tally) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR");

export function analyze(works: Pick<Work, "authors" | "advisor" | "venue" | "year">[]) {
  return {
    authors: tally(works.flatMap((w) => splitPeople(w.authors))).sort(byCount),
    advisors: tally(works.flatMap((w) => splitPeople(w.advisor))).sort(byCount),
    venues: tally(works.map((w) => w.venue.toUpperCase()).filter(Boolean)).sort(byCount),
    years: tally(works.map((w) => w.year).filter(Boolean)).sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export function termCloud(works: Pick<Work, "title" | "keywords">[], terms: string[]): Tally[] {
  return terms
    .map((label) => ({ label, count: works.reduce((sum, w) => sum + countTerm(w, label), 0) }))
    .filter((t) => t.count > 0)
    .sort(byCount);
}

/** Texto para colar em geradores externos: termos compostos unidos por hífen, repetidos pela frequência. */
export function cloudText(tallies: Tally[]): string {
  return tallies.flatMap((t) => Array(t.count).fill(t.label.replaceAll(" ", "-"))).join(" ");
}
