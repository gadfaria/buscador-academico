import { describe, expect, it } from "vitest";
import { analyze, cloudText, normalizePerson, termCloud } from "../shared/analysis.ts";
import { countTerm, dedupe, eligibleForMetrics, passesMetricFilters, scoreSummary } from "../shared/review.ts";
import { parseRis } from "../shared/ris.ts";
import { countSequences, extractTerms, generateSequences, normalizeQuery } from "../shared/sequences.ts";
import { cleanText, convertType } from "../shared/text.ts";
import type { Work } from "../shared/types.ts";

const work = (over: Partial<Work>): Work => ({
  id: "1", platform: "DOAJ", year: "", type: "Artigo", title: "", keywords: "", authors: "", venue: "", issn: "",
  program: "", link: "", advisor: "", abstract: "", sequence: "", doi: "", ...over,
});
const metrics = (jcr: number | null, citeScore: number | null, h5: number | null, qualis: string) => ({ jcr, citeScore, h5, qualis });
const none = { jcr: "", citeScore: "", h5: "", qualis: "" };

describe("gerador de sequências", () => {
  it("segue a ordem do VBA: grupos maiores primeiro, sinônimos em produto cartesiano", () => {
    expect(generateSequences(["Evasão", "ensino médio;EJA"])).toEqual([
      'evasão AND "ensino médio"', "evasão AND eja", "evasão", '"ensino médio"', "eja",
    ]);
  });
  it("gera todas as combinações de três termos", () => {
    expect(generateSequences(["a", "b", "c"])).toEqual(["a AND b AND c", "a AND b", "a AND c", "b AND c", "a", "b", "c"]);
  });
  it("remove aspas digitadas e ignora linhas vazias", () => {
    expect(generateSequences(['"a b"', "  "])).toEqual(['"a b"']);
  });
  it("conta sem gerar e bate com a geração", () => {
    const lines = ["a;b", "c;d;e", "f", "g;h"];
    expect(countSequences(lines)).toBe(generateSequences(lines).length);
  });
  it("limita a grupos de 10 termos como a planilha", () => {
    const lines = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(countSequences(lines)).toBe(2 ** 11 - 1 - 1);
  });
  it("normaliza aspas curvas", () => {
    expect(normalizeQuery("“a b” AND c")).toBe('"a b" AND c');
  });
  it("extrai termos únicos das sequências, até o limite", () => {
    expect(extractTerms(['"a b" AND c', "(c OR d)"])).toEqual(["a b", "c", "d"]);
    expect(extractTerms(["a AND b AND c"], 2)).toEqual(["a", "b"]);
  });
});

describe("limpeza de texto", () => {
  it("decodifica entidades e remove tags", () => {
    expect(cleanText("Educa&ccedil;&atilde;o <b>b&#xe1;sica</b> &#8211; EJA")).toBe("Educação básica - EJA");
  });
  it("corrige mojibake", () => {
    expect(cleanText("EducaÃ§Ã£o")).toBe("Educação");
  });
  it("preserva letras gregas, que o VBA trocava por latinas", () => {
    expect(cleanText("α-sinucleína")).toBe("α-sinucleína");
  });
  it("remove o prefixo Resumo e o que vem depois de SciELO Books", () => {
    expect(cleanText("RESUMO: Texto do estudo SciELO Books rodapé")).toBe("Texto do estudo");
  });
  it("converte tipologia e mantém desconhecidas em maiúsculas", () => {
    expect(convertType("masterThesis")).toBe("Mestrado");
    expect(convertType("Article")).toBe("Artigo");
    expect(convertType("poster")).toBe("POSTER");
  });
});

describe("resultados e tratamento", () => {
  it("remove duplicados por título normalizado ou DOI, mantendo o primeiro", () => {
    const result = dedupe([
      work({ id: "a", title: "Evasão Escolar: um estudo" }),
      work({ id: "b", title: "evasao escolar um estudo" }),
      work({ id: "c", title: "Outro", doi: "10.1/x" }),
      work({ id: "d", title: "Outro título", doi: "10.1/X" }),
      work({ id: "e", title: "" }), work({ id: "f", title: "" }),
    ]);
    expect(result.works.map((w) => w.id)).toEqual(["a", "c", "e", "f"]);
    expect(result.removed).toBe(2);
  });
  it("conta termos como a fórmula: título + palavras-chave, sem caixa, por substring", () => {
    expect(countTerm({ title: "Evasão e evasões", keywords: "EVASÃO" }, "evas")).toBe(3);
    expect(countTerm({ title: "abc", keywords: "" }, "")).toBe(0);
  });
  it("só aplica métricas a artigos fora das bases de teses", () => {
    expect(eligibleForMetrics({ platform: "DOAJ", type: "Artigo" })).toBe(true);
    expect(eligibleForMetrics({ platform: "BDTD", type: "Artigo" })).toBe(false);
    expect(eligibleForMetrics({ platform: "DOAJ", type: "Livro" })).toBe(false);
  });
  it("filtros: teses e não-artigos sempre passam", () => {
    const f = { ...none, jcr: "2" };
    expect(passesMetricFilters({ platform: "BDTD", type: "Mestrado", metrics: metrics(null, null, null, "") }, f)).toBe(true);
    expect(passesMetricFilters({ platform: "DOAJ", type: "Livro", metrics: metrics(null, null, null, "") }, f)).toBe(true);
  });
  it("filtros: limiar, Qualis cumulativo e artigo sem dados", () => {
    const row = (m: ReturnType<typeof metrics>) => ({ platform: "DOAJ", type: "Artigo", metrics: m });
    expect(passesMetricFilters(row(metrics(3, null, null, "")), { ...none, jcr: "2,5" })).toBe(true);
    expect(passesMetricFilters(row(metrics(1, null, null, "")), { ...none, jcr: "2,5" })).toBe(false);
    expect(passesMetricFilters(row(metrics(null, null, null, "")), { ...none, jcr: "2" })).toBe(false);
    expect(passesMetricFilters(row(metrics(null, null, null, "A2")), { ...none, qualis: "A3" })).toBe(true);
    expect(passesMetricFilters(row(metrics(null, null, null, "B1")), { ...none, qualis: "A3" })).toBe(false);
  });
  it("filtros: com valor em um filtro ativo, os demais sem valor são ignorados", () => {
    const row = { platform: "DOAJ", type: "Artigo", metrics: metrics(3, null, null, "") };
    expect(passesMetricFilters(row, { ...none, jcr: "2", citeScore: "5" })).toBe(true);
  });
  it("sem filtro ativo, tudo passa", () => {
    expect(passesMetricFilters({ platform: "DOAJ", type: "Artigo", metrics: metrics(null, null, null, "") }, none)).toBe(true);
  });
  it("seleção qualificada: média e desvio populacional com 1 casa", () => {
    expect(scoreSummary([5, 4, 3])).toEqual({ mean: 4, sd: 0.8 });
    expect(scoreSummary([])).toEqual({ mean: null, sd: null });
  });
});

describe("análise", () => {
  it("normaliza nomes para SOBRENOME, I.", () => {
    expect(normalizePerson("Souza, Maria A.")).toBe("SOUZA, M. A.");
    expect(normalizePerson("Maria Souza")).toBe("SOUZA, M.");
    expect(normalizePerson("Platão")).toBe("PLATÃO");
  });
  it("agrega e ordena por quantidade; anos em ordem cronológica", () => {
    const works = [
      work({ authors: "Souza, Maria; João Lima", advisor: "Paulo Reis [orientador]", venue: "Rev A", year: "2021" }),
      work({ authors: "Maria Souza", venue: "rev a", year: "2019" }),
    ];
    const r = analyze(works);
    expect(r.authors[0]).toEqual({ label: "SOUZA, M.", count: 2 });
    expect(r.venues).toEqual([{ label: "REV A", count: 2 }]);
    expect(r.advisors).toEqual([{ label: "REIS, P.", count: 1 }]);
    expect(r.years.map((y) => y.label)).toEqual(["2019", "2021"]);
  });
  it("gera texto da nuvem com termos hifenizados e repetidos", () => {
    const t = termCloud([work({ title: "ensino médio e ensino médio" })], ["ensino médio", "ausente"]);
    expect(cloudText(t)).toBe("ensino-médio ensino-médio");
  });
});

describe("importação RIS", () => {
  it("lê campos e múltiplos autores", () => {
    const ris = "TY  - JOUR\nTI  - Título &amp; teste\nAU  - Lima, A\nAU  - Reis, B\nPY  - 2020/01/02\nSN  - 1234-5678\nDO  - 10.1/ABC\nER  - \n";
    const [w] = parseRis(ris, "seq");
    expect(w).toMatchObject({ title: "Título & teste", authors: "Lima, A; Reis, B", year: "2020", type: "Artigo", issn: "1234-5678", doi: "10.1/abc", sequence: "seq" });
  });
});
