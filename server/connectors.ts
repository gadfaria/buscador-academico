import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { normalizeQuery } from "../shared/sequences.ts";
import { cleanText, convertType } from "../shared/text.ts";
import type { PlatformId, PlatformInfo, Work } from "../shared/types.ts";
import { getJson, getText } from "./http.ts";

type Draft = Partial<Work> & { title: string };

export interface Connector {
  id: PlatformId;
  label: string;
  pageSize: number;
  enabled?: () => boolean;
  note?: string;
  count(query: string): Promise<number>;
  page(query: string, page: number): Promise<Draft[]>;
  details?(link: string): Promise<Partial<Work>>;
}

const list = (value: unknown): any[] => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);
const joinClean = (values: unknown[]) => values.map(cleanText).filter(Boolean).join("; ");
const year = (value: unknown) => (String(value ?? "").match(/\d{4}/) ?? [""])[0];
const stripDoi = (value: unknown) => String(value ?? "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase();

const capes: Connector = {
  id: "capes",
  label: "CAPES T&D",
  pageSize: 20,
  note: "Resumo, palavras-chave e orientador vêm do Sucupira, na etapa 'Completar dados'.",
  async count(query) {
    return (await this.search(query, 1)).total;
  },
  async page(query, page) {
    const data = await this.search(query, page);
    return data.tesesDissertacoes.map((t: any) => ({
      title: cleanText(t.titulo),
      authors: cleanText(t.autor),
      venue: cleanText(t.instituicao).toUpperCase(),
      program: cleanText(t.nomePrograma),
      year: year(t.dataDefesa),
      type: convertType(t.grauAcademico ?? ""),
      link: t.link && t.link !== "undefined" ? t.link : "",
    }));
  },
  async details(link) {
    if (!/^https:\/\/sucupira(-legado)?\.capes\.gov\.br\//.test(link)) throw new Error("Link fora do Sucupira");
    return parseSucupira(await getText(link));
  },
  search(query: string, pagina: number) {
    const termo = normalizeQuery(query).replaceAll("-", " ");
    return getJson("https://catalogodeteses.capes.gov.br/catalogo-teses/rest/busca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ termo, filtros: [], pagina, registrosPorPagina: 20 }),
    });
  },
} as Connector & { search(query: string, pagina: number): Promise<any> };

/** Capes_Resumos: mesmos ids de campo que a planilha lê. */
export function parseSucupira(html: string): Partial<Work> {
  const $ = cheerio.load(html);
  return {
    abstract: cleanText($("#resumo").text()),
    keywords: cleanText($("#palavras").text()).split(";").map((k) => k.trim().replace(/\.$/, "")).filter(Boolean).join("; "),
    advisor: cleanText($("#orientador").text()),
  };
}

const PRIMO = "https://rnp-primo.hosted.exlibrisgroup.com/primo_library/libweb/webservices/rest";

const periodicos: Connector = {
  id: "periodicos",
  label: "Periódicos CAPES",
  pageSize: 50,
  note: "Usa o token de convidado da interface pública, não uma API documentada.",
  async count(query) {
    return Number((await primoSearch(query, 0, 1)).info.total);
  },
  async page(query, page) {
    const data = await primoSearch(query, (page - 1) * 50, 50);
    return data.docs.map(({ pnx }: any) => {
      const add = pnx.addata ?? {};
      const doi = stripDoi(add.doi?.[0]);
      return {
        title: cleanText(pnx.display?.title?.[0] ?? add.atitle?.[0]),
        authors: joinClean(pnx.search?.creator ?? add.au ?? []),
        venue: cleanText(add.jtitle?.[0]).toUpperCase(),
        issn: add.issn?.[0] ?? add.eissn?.[0] ?? "",
        year: year(add.date?.[0] ?? pnx.search?.creationdate?.[0]),
        type: convertType(pnx.display?.type?.[0] ?? ""),
        keywords: joinClean(pnx.search?.subject ?? []),
        abstract: cleanText(pnx.search?.description?.[0]),
        link: doi ? `https://doi.org/${doi}` : "",
        doi,
      };
    });
  },
};

async function primoSearch(query: string, offset: number, limit: number) {
  const token = await getJson<string>(`${PRIMO}/v1/guestJwt/CAPES?viewId=CAPES_V3`);
  const term = encodeURIComponent(normalizeQuery(query).replaceAll(",", " "));
  return getJson(
    `${PRIMO}/primo-explore/v1/pnxs?inst=CAPES&limit=${limit}&offset=${offset}&q=any,contains,${term},AND&scope=default_scope&sort=rank&tab=default_tab&vid=CAPES_V3`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
}

const doajUrl = (query: string, page: number, pageSize: number) =>
  `https://doaj.org/api/search/articles/${encodeURIComponent(normalizeQuery(query).replaceAll(":", " "))}?page=${page}&pageSize=${pageSize}`;

const doaj: Connector = {
  id: "doaj",
  label: "DOAJ",
  pageSize: 50,
  async count(query) {
    return (await getJson(doajUrl(query, 1, 1))).total;
  },
  async page(query, page) {
    const data = await getJson(doajUrl(query, page, 50));
    return data.results.map(({ bibjson: b, id }: any) => ({
      title: cleanText(b.title),
      authors: joinClean(list(b.author).map((a) => a.name)),
      venue: cleanText(b.journal?.title).toUpperCase(),
      issn: list(b.identifier).find((i) => i.type === "pissn" || i.type === "eissn")?.id ?? b.journal?.issns?.[0] ?? "",
      year: b.year ?? "",
      type: "Artigo",
      keywords: joinClean(list(b.keywords)),
      abstract: cleanText(b.abstract),
      link: `https://doaj.org/article/${id}`,
      doi: stripDoi(list(b.identifier).find((i) => i.type === "doi")?.id),
    }));
  },
};

const ericUrl = (query: string, start: number, rows: number) =>
  `https://api.ies.ed.gov/eric/?search=${encodeURIComponent(normalizeQuery(query))}&format=json&start=${start}&rows=${rows}` +
  "&fields=id,title,author,source,publicationdateyear,description,subject,publicationtype,issn";

const eric: Connector = {
  id: "eric",
  label: "ERIC",
  pageSize: 200,
  async count(query) {
    return (await getJson(ericUrl(query, 0, 0))).response.numFound;
  },
  async page(query, page) {
    const data = await getJson(ericUrl(query, (page - 1) * 200, 200));
    return data.response.docs.map((d: any) => {
      const types = list(d.publicationtype);
      return {
        title: cleanText(d.title),
        authors: joinClean(list(d.author)),
        venue: cleanText(d.source).toUpperCase(),
        issn: (String(list(d.issn)[0] ?? "").match(/\d{4}-\d{3}[\dX]/i) ?? [""])[0],
        year: String(d.publicationdateyear ?? ""),
        type: types.includes("Journal Articles") ? "Artigo" : cleanText(types[0]),
        keywords: joinClean(list(d.subject)),
        abstract: cleanText(d.description),
        link: `https://eric.ed.gov/?id=${d.id}`,
      };
    });
  },
};

const NCBI = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const ncbiKey = () => (process.env.NCBI_API_KEY ? `&api_key=${process.env.NCBI_API_KEY}` : "");
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });
const nodeText = (node: any): string =>
  typeof node === "object" && node !== null ? String(node["#text"] ?? "") : String(node ?? "");

export function parsePubmed(content: string): Draft[] {
  const articles = list(xml.parse(content).PubmedArticleSet?.PubmedArticle);
  return articles.map((entry) => {
    const citation = entry.MedlineCitation;
    const article = citation.Article;
    const ids = list(entry.PubmedData?.ArticleIdList?.ArticleId);
    const issue = article.Journal?.JournalIssue?.PubDate ?? {};
    const pmid = nodeText(citation.PMID);
    const types = list(article.PublicationTypeList?.PublicationType).map(nodeText);
    return {
      title: cleanText(nodeText(article.ArticleTitle)),
      authors: joinClean(list(article.AuthorList?.Author).map((a) => a.CollectiveName ?? [a.LastName, a.ForeName].filter(Boolean).join(", "))),
      venue: cleanText(nodeText(article.Journal?.Title)).toUpperCase(),
      issn: nodeText(article.Journal?.ISSN),
      year: year(issue.Year ?? issue.MedlineDate),
      type: types.includes("Journal Article") || types.length === 0 ? "Artigo" : convertType(types[0]),
      keywords: joinClean(list(citation.KeywordList?.Keyword).map(nodeText)),
      abstract: cleanText(list(article.Abstract?.AbstractText).map(nodeText).join(" ")),
      link: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      doi: stripDoi(nodeText(ids.find((i) => i["@_IdType"] === "doi"))),
    };
  });
}

const esearch = (query: string, start: number, max: number) =>
  getJson(`${NCBI}/esearch.fcgi?db=pubmed&retmode=json&retstart=${start}&retmax=${max}&term=${encodeURIComponent(normalizeQuery(query))}${ncbiKey()}`);

const pubmed: Connector = {
  id: "pubmed",
  label: "PubMed",
  pageSize: 100,
  async count(query) {
    return Number((await esearch(query, 0, 0)).esearchresult.count);
  },
  async page(query, page) {
    const ids: string[] = (await esearch(query, (page - 1) * 100, 100)).esearchresult.idlist;
    if (ids.length === 0) return [];
    return parsePubmed(await getText(`${NCBI}/efetch.fcgi?db=pubmed&retmode=xml&id=${ids.join(",")}${ncbiKey()}`));
  },
};

function openAlexAbstract(index: Record<string, number[]> | null): string {
  if (!index) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word;
  return cleanText(words.join(" "));
}

const openAlexUrl = (query: string, page: number, perPage: number) => {
  const params = new URLSearchParams({
    search: normalizeQuery(query),
    page: String(page),
    "per-page": String(perPage),
    select: "id,doi,title,publication_year,type,authorships,primary_location,abstract_inverted_index,keywords",
  });
  if (process.env.OPENALEX_API_KEY) params.set("api_key", process.env.OPENALEX_API_KEY);
  if (process.env.CONTACT_EMAIL) params.set("mailto", process.env.CONTACT_EMAIL);
  return `https://api.openalex.org/works?${params}`;
};

const openalex: Connector = {
  id: "openalex",
  label: "OpenAlex",
  pageSize: 100,
  note: "Substitui o Google Acadêmico, que proíbe consultas automatizadas.",
  async count(query) {
    return (await getJson(openAlexUrl(query, 1, 1))).meta.count;
  },
  async page(query, page) {
    const data = await getJson(openAlexUrl(query, page, 100));
    return data.results.map((w: any) => {
      const source = w.primary_location?.source;
      const doi = stripDoi(w.doi);
      return {
        title: cleanText(w.title),
        authors: joinClean(list(w.authorships).map((a) => a.author?.display_name)),
        venue: cleanText(source?.display_name).toUpperCase(),
        issn: source?.issn_l ?? "",
        year: String(w.publication_year ?? ""),
        type: convertType(w.type ?? ""),
        keywords: joinClean(list(w.keywords).map((k) => k.display_name)),
        abstract: openAlexAbstract(w.abstract_inverted_index),
        link: doi ? `https://doi.org/${doi}` : w.id,
        doi,
      };
    });
  },
};

const EDUCAPES = "https://educapes.capes.gov.br";

export function parseEducapesCount(html: string): number {
  return Number(cheerio.load(html)(".paginacao").first().text().match(/de\s+(\d+)/)?.[1] ?? 0);
}

/** O DSpace mistura pessoas e instituições no mesmo campo e anexa o ano de nascimento: "Lima, Ana, 1962-". */
function people(field: string): string {
  return field
    .split(";")
    .map((name) => name.replace(/,\s*\d{4}-(\d{4})?\s*$/, "").trim())
    .filter((name) => name && !/universidade|faculdade|instituto|setor|curso|programa|departamento|centro/i.test(name))
    .join("; ");
}

export function parseEducapesPage(html: string): Draft[] {
  const $ = cheerio.load(html);
  return $("div.t1 a").toArray().map((anchor) => {
    const row = $(anchor).parent();
    const date = row.nextAll("div.t4").first().text();
    return {
      title: cleanText($(anchor).text()),
      authors: people(cleanText(row.nextAll("div.t3").first().text())),
      advisor: people(cleanText(row.nextAll("div.t2").first().text())),
      year: year(date),
      type: "Objeto Educacional",
      link: `${EDUCAPES}${$(anchor).attr("href")}`,
    };
  });
}

export function parseEducapesDetails(html: string): Partial<Work> {
  const $ = cheerio.load(html);
  const meta = (name: string) => $(`meta[name="${name}"]`).toArray().map((m) => $(m).attr("content") ?? "");
  return {
    authors: people(joinClean(meta("DC.creator"))),
    keywords: joinClean(meta("DC.subject")),
    venue: cleanText(meta("DC.publisher")[0]).toUpperCase(),
    abstract: cleanText(meta("DC.description").sort((a, b) => b.length - a.length)[0]),
    type: cleanText(meta("DC.type")[0]),
  };
}

const educapesUrl = (query: string, start: number) =>
  `${EDUCAPES}/simple-search?query=${encodeURIComponent(normalizeQuery(query))}&start=${start}`;

const educapes: Connector = {
  id: "educapes",
  label: "EduCapes",
  pageSize: 10,
  note: "Sem API: lê o HTML público. Resumos exigem a etapa 'Completar dados'.",
  async count(query) {
    return parseEducapesCount(await getText(educapesUrl(query, 0)));
  },
  async page(query, page) {
    return parseEducapesPage(await getText(educapesUrl(query, (page - 1) * 10)));
  },
  async details(link) {
    if (!link.startsWith(`${EDUCAPES}/handle/`)) throw new Error("Link fora do EduCapes");
    return parseEducapesDetails(await getText(`${link}?mode=full`));
  },
};

const bdtdUrl = (query: string, page: number, limit: number) =>
  `https://bdtd.ibict.br/vufind/api/v1/search?lookfor=${encodeURIComponent(normalizeQuery(query))}&type=AllFields&page=${page}&limit=${limit}` +
  ["title", "authors", "formats", "publishDates", "subjects", "summary", "institutions", "id"].map((f) => `&field[]=${f}`).join("");

const bdtd: Connector = {
  id: "bdtd",
  label: "BDTD",
  pageSize: 100,
  note: "API VuFind; estava fora do ar nos testes e o conector não foi validado.",
  async count(query) {
    return (await getJson(bdtdUrl(query, 1, 0))).resultCount ?? 0;
  },
  async page(query, page) {
    const data = await getJson(bdtdUrl(query, page, 100));
    return list(data.records).map((r: any) => ({
      title: cleanText(r.title),
      authors: joinClean(Object.keys(r.authors?.primary ?? {})),
      advisor: joinClean(Object.keys(r.authors?.secondary ?? {})),
      venue: cleanText(list(r.institutions)[0]).toUpperCase(),
      year: year(list(r.publishDates)[0]),
      type: convertType(list(r.formats)[0] ?? ""),
      keywords: joinClean(list(r.subjects).flat()),
      abstract: cleanText(list(r.summary)[0]),
      link: `https://bdtd.ibict.br/vufind/Record/${r.id}`,
    }));
  },
};

const springerUrl = (query: string, start: number, size: number) =>
  `https://api.springernature.com/meta/v2/json?q=${encodeURIComponent(normalizeQuery(query))}&s=${start}&p=${size}&api_key=${process.env.SPRINGER_API_KEY}`;

const springer: Connector = {
  id: "springer",
  label: "Springer",
  pageSize: 25,
  enabled: () => Boolean(process.env.SPRINGER_API_KEY),
  note: "Exige SPRINGER_API_KEY; sem chave não foi validado.",
  async count(query) {
    return Number((await getJson(springerUrl(query, 1, 1))).result[0].total);
  },
  async page(query, page) {
    const data = await getJson(springerUrl(query, (page - 1) * 25 + 1, 25));
    return list(data.records).map((r: any) => ({
      title: cleanText(r.title),
      authors: joinClean(list(r.creators).map((c) => c.creator)),
      venue: cleanText(r.publicationName).toUpperCase(),
      issn: r.issn ?? "",
      year: year(r.publicationDate),
      type: convertType(r.contentType ?? ""),
      abstract: cleanText(r.abstract),
      link: list(r.url)[0]?.value ?? "",
      doi: stripDoi(r.doi),
    }));
  },
};

export const connectors: Connector[] = [capes, periodicos, doaj, bdtd, eric, pubmed, openalex, educapes, springer];

export const findConnector = (id: string) => connectors.find((c) => c.id === id && (c.enabled?.() ?? true));

export const platformInfo = (): PlatformInfo[] =>
  connectors.map(({ id, label, pageSize, note, enabled }) => ({ id, label, pageSize, note, enabled: enabled?.() ?? true }));
