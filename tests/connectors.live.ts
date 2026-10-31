// Smoke test contra as APIs reais: npx tsx tests/connectors.live.ts
import { connectors } from "../server/connectors.ts";

for (const c of connectors) {
  if (!(c.enabled?.() ?? true)) { console.log(c.id.padEnd(11), "desativado"); continue; }
  try {
    const query = c.id === "eric" ? '"school dropout"' : '"evasão escolar"';
    const count = await c.count(query);
    const page = await c.page(query, 1);
    const w = page[0];
    console.log(c.id.padEnd(11), "total", String(count).padEnd(8), "pág", String(page.length).padEnd(4),
      JSON.stringify({ t: w?.title?.slice(0, 40), a: w?.authors?.slice(0, 24), v: w?.venue?.slice(0, 20), i: w?.issn, y: w?.year, ty: w?.type, abs: w?.abstract?.length, l: w?.link?.slice(0, 44) }));
    const withLink = page.find((p) => p.link);
    if (c.details && withLink) console.log("  details", JSON.stringify(await c.details(withLink.link!)).slice(0, 200));
  } catch (e) { console.log(c.id.padEnd(11), "ERRO", (e as Error).message); }
}
