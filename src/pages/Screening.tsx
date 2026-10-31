import { ChevronDown } from "lucide-react";
import { useMemo } from "react";
import { confirm } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { countTerm, eligibleForMetrics, passesMetricFilters, QUALIS } from "../../shared/review.ts";
import { extractTerms } from "../../shared/sequences.ts";
import { EMPTY_METRICS } from "../../shared/types.ts";
import { fetchMetrics } from "../api.ts";
import { CRITERIA, EVALUATORS, type Project, type Update } from "../project.ts";
import { downloadCsv, Empty, PageIntro, usePaged } from "../ui.tsx";

const ANY = "todos";
const PENDING = "pendente";

export function visibleScreening(project: Project) {
  return project.screening.filter((row) => passesMetricFilters(row, project.filters));
}

export function Screening({ project, update, onTransport }: { project: Project; update: Update; onTransport: () => void }) {
  const filtered = useMemo(() => visibleScreening(project), [project.screening, project.filters]);
  const { visible, pager } = usePaged(filtered);
  const terms = project.terms.filter(Boolean);
  const setFilter = (key: keyof Project["filters"], value: string) => update((p) => ({ filters: { ...p.filters, [key]: value } }));

  const loadTerms = () => {
    const found = extractTerms(project.sequences.filter((s) => s.selected).map((s) => s.text));
    update({ terms: [...found, ...Array(20 - found.length).fill("")] });
  };

  const refreshMetrics = async () => {
    const metrics = await fetchMetrics([...new Set(project.screening.map((r) => r.issn).filter(Boolean))]);
    update((p) => ({ screening: p.screening.map((r) => ({ ...r, metrics: (eligibleForMetrics(r) && metrics[r.issn]) || EMPTY_METRICS })) }));
  };

  const transport = async () => {
    const ok = await confirm({
      title: `Avançar com ${filtered.length.toLocaleString("pt-BR")} trabalhos?`,
      description: project.selection.length
        ? "A Seleção será refeita com estes trabalhos, e as notas já dadas serão substituídas."
        : "Os trabalhos listados agora seguirão para a avaliação.",
      action: "Avançar",
      destructive: project.selection.length > 0,
    });
    if (!ok) return;
    update({
      selection: filtered.map((r) => ({
        id: r.id,
        title: r.title,
        scores: Array.from({ length: EVALUATORS }, () => Array(CRITERIA).fill(0)),
      })),
    });
    onTransport();
  };

  const exportCsv = () => downloadCsv("tratamento.csv",
    ["Autor(a)", "Título", "Resumo", "Palavras-chave", "Orientador(a)", "Instituição/Periódico", "ISSN", "Tipologia", "Plataforma", "Ano", "JCR", "CiteScore", "Google h-5", "Qualis", ...terms, "Total", "Resultado (S/N)"],
    filtered.map((r) => {
      const counts = terms.map((t) => countTerm(r, t));
      return [r.authors, r.title, r.abstract, r.keywords, r.advisor, r.venue, r.issn, r.type, r.platform, r.year,
        r.metrics.jcr, r.metrics.citeScore, r.metrics.h5, r.metrics.qualis, ...counts, counts.reduce((a, b) => a + b, 0), r.decision];
    }));

  const numberFilter = (key: "jcr" | "citeScore" | "h5", label: string) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} className="w-28" inputMode="decimal" value={project.filters[key]} onChange={(e) => setFilter(key, e.target.value)} />
    </div>
  );

  return (
    <>
      <PageIntro step={3} title="Filtre pela qualidade dos periódicos">
        Defina os valores mínimos desejados. Teses, dissertações e outros tipos de trabalho não são afetados por estes filtros.
      </PageIntro>
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-4">
          {numberFilter("jcr", "JCR mínimo")}
          {numberFilter("citeScore", "CiteScore mínimo")}
          {numberFilter("h5", "Google h5 mínimo")}
          <div className="flex flex-col gap-1">
            <Label id="qualis-label">Qualis até</Label>
            <Select value={project.filters.qualis || ANY} onValueChange={(v) => setFilter("qualis", v === ANY ? "" : v)}>
              <SelectTrigger aria-labelledby="qualis-label" className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Todos</SelectItem>
                {QUALIS.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="pb-2 font-medium">{filtered.length.toLocaleString("pt-BR")} de {project.screening.length.toLocaleString("pt-BR")} trabalhos</p>
        </CardContent>
      </Card>
      <Collapsible className="mb-4 rounded-lg border bg-card">
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-medium">
          Contar termos nos títulos e palavras-chave ({terms.length} de 20)
          <ChevronDown className="size-5 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3 px-4 pb-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {project.terms.map((term, i) => (
              <Input key={i} aria-label={`Termo ${i + 1}`} placeholder={`Termo ${i + 1}`} value={term}
                onChange={(e) => update((p) => ({ terms: p.terms.map((t, j) => (j === i ? e.target.value : t)) }))} />
            ))}
          </div>
          <Button variant="outline" className="self-start" onClick={loadTerms}>Usar os termos das minhas buscas</Button>
        </CollapsibleContent>
      </Collapsible>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="lg" disabled={!filtered.length} onClick={transport}>Avançar para a Seleção</Button>
        <Button variant="outline" onClick={refreshMetrics} disabled={!project.screening.length}>Atualizar índices</Button>
        <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>Baixar planilha</Button>
      </div>
      {project.screening.length === 0 ? <Empty>Nada por aqui ainda. Na etapa 2, clique em “Avançar para o Tratamento”.</Empty> : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trabalho</TableHead><TableHead>Ano</TableHead>
                <TableHead className="text-right">JCR</TableHead><TableHead className="text-right">CiteScore</TableHead><TableHead className="text-right">h5</TableHead><TableHead>Qualis</TableHead>
                {terms.map((t) => <TableHead key={t} className="text-right">{t}</TableHead>)}
                {terms.length > 0 && <TableHead className="text-right">Total</TableHead>}
                <TableHead>Decisão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => {
                const counts = terms.map((t) => countTerm(r, t));
                return (
                  <TableRow key={r.id}>
                    <TableCell className="min-w-80 whitespace-normal">
                      <p className="font-medium">{r.title}</p>
                      <p className="text-muted-foreground">{[r.type, r.venue].filter(Boolean).join(" · ")}</p>
                    </TableCell>
                    <TableCell>{r.year}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.metrics.jcr}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.metrics.citeScore}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.metrics.h5}</TableCell>
                    <TableCell>{r.metrics.qualis}</TableCell>
                    {counts.map((c, i) => <TableCell key={i} className="text-right tabular-nums">{c || ""}</TableCell>)}
                    {terms.length > 0 && <TableCell className="text-right font-semibold tabular-nums">{counts.reduce((a, b) => a + b, 0)}</TableCell>}
                    <TableCell>
                      <Select value={r.decision || PENDING} onValueChange={(value) => update((p) => ({
                        screening: p.screening.map((x) => (x.id === r.id ? { ...x, decision: value === PENDING ? "" : value as "S" | "N" } : x)),
                      }))}>
                        <SelectTrigger aria-label={`Decisão sobre ${r.title}`} className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={PENDING}>Pendente</SelectItem>
                          <SelectItem value="S">Incluir</SelectItem>
                          <SelectItem value="N">Excluir</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {pager}
    </>
  );
}
