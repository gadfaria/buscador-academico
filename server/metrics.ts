// Port of Qual_indice: exact match on the ISSN column, then on EISSN if not found.
import { readFile } from "node:fs/promises";
import type { Metrics } from "../shared/types.ts";

type Row = [string, string | null, string | null, number | null, number | null, number | null, string | null];

let index: Promise<Map<string, Metrics>> | undefined;

async function load() {
  const file = new URL("./data/fatores.json", import.meta.url);
  const rows = JSON.parse(await readFile(file, "utf8")) as Row[];
  const map = new Map<string, Metrics>();
  const toMetrics = (r: Row): Metrics => ({ jcr: r[3], citeScore: r[4], h5: r[5], qualis: r[6] ?? "" });
  for (const r of rows) if (r[1] && !map.has(r[1].toUpperCase())) map.set(r[1].toUpperCase(), toMetrics(r));
  for (const r of rows) if (r[2] && !map.has(r[2].toUpperCase())) map.set(r[2].toUpperCase(), toMetrics(r));
  return map;
}

export async function lookupMetrics(issns: string[]): Promise<Record<string, Metrics>> {
  index ??= load();
  const map = await index;
  const found: Record<string, Metrics> = {};
  for (const issn of issns) {
    const metrics = map.get(issn.trim().toUpperCase());
    if (metrics) found[issn] = metrics;
  }
  return found;
}
