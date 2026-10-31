import { useState } from "react";
import { confirm } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { scoreSummary } from "../../shared/review.ts";
import { EVALUATORS, type Project, type Update } from "../project.ts";
import { downloadCsv, Empty, PageIntro, usePaged } from "../ui.tsx";

const SCALE = ["1 - Discordo totalmente", "2 - Discordo", "3 - Não estou decidido", "4 - Concordo", "5 - Concordo totalmente"];

export function Selection({ project, update, onNext }: { project: Project; update: Update; onNext: () => void }) {
  const [evaluator, setEvaluator] = useState(0);
  const { visible, pager } = usePaged(project.selection);
  const criteria = project.criteria.map((name, index) => ({ name, index })).filter((c) => c.name.trim());
  const summary = (scores: number[][]) => scoreSummary(scores.flat().filter(Boolean));

  const setScore = (id: string, criterion: number, value: number) => update((p) => ({
    selection: p.selection.map((row) => row.id !== id ? row : {
      ...row,
      scores: row.scores.map((line, e) => e !== evaluator ? line : line.map((v, c) => (c === criterion ? value : v))),
    }),
  }));

  const exportCsv = () => downloadCsv("selecao-qualificada.csv",
    ["Título", "Média", "Dp", ...Array.from({ length: EVALUATORS }, (_, e) => criteria.map((c) => `A${e + 1} C${c.index + 1}`)).flat()],
    project.selection.map((row) => {
      const { mean, sd } = summary(row.scores);
      return [row.title, mean, sd, ...row.scores.flatMap((line) => criteria.map((c) => line[c.index] || ""))];
    }));

  const clear = async () => {
    const ok = await confirm({
      title: "Apagar a seleção?",
      description: "Todos os trabalhos desta etapa e as notas de todos os avaliadores serão apagados.",
      action: "Apagar seleção",
      destructive: true,
    });
    if (ok) update({ selection: [] });
  };

  return (
    <>
      <PageIntro step={4} title="Avalie os trabalhos">
        Escreva os critérios de inclusão, escolha quem está avaliando e dê uma nota de 1 a 5 para cada critério. A média é calculada automaticamente.
      </PageIntro>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="font-serif text-lg">Critérios de inclusão e exclusão</CardTitle>
          <CardDescription>Preencha até 10 critérios. Apenas os preenchidos aparecem na tabela.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {project.criteria.map((name, i) => (
            <Input key={i} aria-label={`Critério ${i + 1}`} placeholder={`Critério ${i + 1}`} value={name}
              onChange={(e) => update((p) => ({ criteria: p.criteria.map((c, j) => (j === i ? e.target.value : c)) }))} />
          ))}
        </CardContent>
      </Card>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={String(evaluator)} onValueChange={(v) => setEvaluator(Number(v))}>
          <TabsList aria-label="Avaliador" className="h-auto flex-wrap justify-start">
            {Array.from({ length: EVALUATORS }, (_, e) => <TabsTrigger key={e} value={String(e)} className="flex-none">Avaliador {e + 1}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button onClick={onNext}>Ir para a Análise</Button>
          <Button variant="outline" onClick={exportCsv} disabled={!project.selection.length}>Baixar planilha</Button>
          <Button variant="ghost" disabled={!project.selection.length} onClick={clear}>Apagar seleção</Button>
        </div>
      </div>
      {project.selection.length === 0 ? <Empty>Nenhum trabalho para avaliar. Na etapa 3, clique em “Avançar para a Seleção”.</Empty>
        : criteria.length === 0 ? <Empty>Escreva ao menos um critério acima para começar a dar notas.</Empty> : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trabalho</TableHead>
                {criteria.map((c) => <TableHead key={c.index} className="min-w-44">{c.name}</TableHead>)}
                <TableHead className="text-right">Média</TableHead><TableHead className="text-right">Desvio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => {
                const { mean, sd } = summary(row.scores);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="min-w-72 whitespace-normal font-medium">{row.title}</TableCell>
                    {criteria.map((c) => (
                      <TableCell key={c.index}>
                        {/* Select nativo de propósito: até 1.000 Radix Selects por página pesariam na tela. */}
                        <select className="h-11 w-full rounded-md border border-input bg-card px-2 text-base" aria-label={`${c.name}: ${row.title}`}
                          value={row.scores[evaluator][c.index]} onChange={(e) => setScore(row.id, c.index, Number(e.target.value))}>
                          <option value={0}>Sem nota</option>
                          {SCALE.map((label, i) => <option key={i} value={i + 1}>{label}</option>)}
                        </select>
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-semibold tabular-nums">{mean?.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}</TableCell>
                    <TableCell className="text-right tabular-nums">{sd?.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}</TableCell>
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
