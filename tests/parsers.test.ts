import { describe, expect, it } from "vitest";
import { parseBdtd, parseEducapesCount, parseEducapesDetails, parseEducapesPage, parsePubmed, parseSucupira } from "../server/connectors.ts";

describe("parsers de HTML/XML", () => {
  it("lê lista e total do EduCapes", () => {
    const html = `<div class="paginacao">Resultado 1-10 de 39177.</div>
      <div headers="t1" class="t1"><a href="/handle/1/2">Evas&#x00E3;o&#x20;escolar</a></div><div class="t2">Reis, Paulo, 1962-; Universidade Federal do Paraná. Setor X</div><div class="t3">Lima, Ana</div><div class="t4"><div class="data">29-Fev-2024</div></div>`;
    expect(parseEducapesCount(html)).toBe(39177);
    expect(parseEducapesPage(html)[0]).toMatchObject({ title: "Evasão escolar", authors: "Lima, Ana", advisor: "Reis, Paulo", year: "2024", link: "https://educapes.capes.gov.br/handle/1/2" });
  });
  it("lê metadados DC do EduCapes usando a maior descrição como resumo", () => {
    const html = `<meta name="DC.description" content="curta"><meta name="DC.description" content="uma descricao bem maior"><meta name="DC.subject" content="a"><meta name="DC.subject" content="b">`;
    expect(parseEducapesDetails(html)).toMatchObject({ abstract: "uma descricao bem maior", keywords: "a; b" });
  });
  it("lê resumo, palavras e orientador do Sucupira", () => {
    const html = `<span id="resumo">A evas&atilde;o</span><span id="palavras">predi&ccedil;&atilde;o;dados.</span><span id="orientador">ED FERREIRA</span>`;
    expect(parseSucupira(html)).toEqual({ abstract: "A evasão", keywords: "predição; dados", advisor: "ED FERREIRA" });
  });
  it("lê artigo do PubMed com resumo estruturado e DOI", () => {
    const xml = `<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID Version="1">9</PMID><Article><Journal><ISSN IssnType="Print">1351-5578</ISSN><JournalIssue><PubDate><Year>2019</Year></PubDate></JournalIssue><Title>Nurse researcher</Title></Journal><ArticleTitle>A review.</ArticleTitle><Abstract><AbstractText Label="AIM">Parte 1.</AbstractText><AbstractText>Parte 2.</AbstractText></Abstract><AuthorList><Author><LastName>Lima</LastName><ForeName>Ana</ForeName></Author></AuthorList><PublicationTypeList><PublicationType>Journal Article</PublicationType></PublicationTypeList></Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="doi">10.1/ABC</ArticleId></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>`;
    expect(parsePubmed(xml)[0]).toMatchObject({ title: "A review.", authors: "Lima, Ana", venue: "NURSE RESEARCHER", issn: "1351-5578", year: "2019", type: "Artigo", abstract: "Parte 1. Parte 2.", doi: "10.1/abc", link: "https://pubmed.ncbi.nlm.nih.gov/9/" });
  });
  it("lê registro da BDTD com o formato da especificação da API", () => {
    const record = {
      id: "UFPR_1", title: "Evasão escolar", formats: ["masterThesis"], publicationDates: ["2019"],
      institutions: ["UFPR"], subjects: [["Educação", "Evasão"]], summary: ["Resumo."],
    };
    expect(parseBdtd({ records: [{ ...record, authors: { primary: { "Lima, Ana": [] }, secondary: { "Reis, Paulo": ["adv"] } } }] })[0]).toMatchObject({
      title: "Evasão escolar", authors: "Lima, Ana", advisor: "Reis, Paulo", venue: "UFPR", year: "2019", type: "Mestrado",
      keywords: "Educação; Evasão", abstract: "Resumo.", link: "https://bdtd.ibict.br/vufind/Record/UFPR_1",
    });
    expect(parseBdtd({ records: [{ ...record, authors: { main: { "Lima, Ana": [] } } }] })[0].authors).toBe("Lima, Ana");
    expect(parseBdtd({})).toEqual([]);
  });
});
