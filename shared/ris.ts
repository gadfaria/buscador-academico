// Importação manual: cobre bases sem API aberta (SciELO, Google Acadêmico), que exportam RIS.
import { cleanText, convertType } from "./text.ts";
import type { Work } from "./types.ts";

export function parseRis(content: string, sequence = ""): Work[] {
  const works: Work[] = [];
  let tags = new Map<string, string[]>();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/);
    if (!match) continue;
    const [, tag, value] = match;
    if (tag === "ER") {
      const pick = (...names: string[]) => names.flatMap((n) => tags.get(n) ?? []);
      const first = (...names: string[]) => pick(...names)[0] ?? "";
      works.push({
        id: crypto.randomUUID(),
        platform: "Importado (RIS)",
        year: (first("PY", "Y1", "DA").match(/\d{4}/) ?? [""])[0],
        type: convertType(first("TY")),
        title: cleanText(first("TI", "T1")),
        keywords: pick("KW").map(cleanText).join("; "),
        authors: pick("AU", "A1").map(cleanText).join("; "),
        venue: cleanText(first("JO", "JF", "T2")),
        issn: first("SN").split(/[\s;,]/)[0] ?? "",
        program: "",
        link: first("UR"),
        advisor: "",
        abstract: cleanText(first("AB", "N2")),
        sequence,
        doi: first("DO").toLowerCase(),
      });
      tags = new Map();
    } else {
      tags.set(tag, [...(tags.get(tag) ?? []), value.trim()]);
    }
  }
  return works;
}
