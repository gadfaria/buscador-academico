import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analyze, cloudText, termCloud, type Tally } from "../../shared/analysis.ts";
import type { Project } from "../project.ts";
import { Empty, PageIntro } from "../ui.tsx";
import { visibleScreening } from "./Screening.tsx";

const TOP = 20;

function Ranking({ title, items }: { title: string; items: Tally[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, TOP);
  const max = items[0]?.count ?? 1;
  return (
    <Card>
      <CardHeader><CardTitle className="font-serif text-lg">{title}</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="text-muted-foreground">Sem dados.</p> : (
          <ol className="flex flex-col gap-2">
            {shown.map((item) => (
              <li key={item.label} className="grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-x-2">
                <span className="col-span-2 [overflow-wrap:anywhere]">{item.label}</span>
                <span className="h-3"><span className="block h-full min-w-1 rounded-r bg-bar" style={{ width: `${(item.count / max) * 100}%` }} /></span>
                <span className="text-right font-medium tabular-nums">{item.count}</span>
              </li>
            ))}
          </ol>
        )}
        {items.length > TOP && <Button variant="link" className="mt-2 h-auto p-0" onClick={() => setAll(!all)}>{all ? `Ver só os ${TOP} primeiros` : `Ver todos (${items.length})`}</Button>}
      </CardContent>
    </Card>
  );
}

function Years({ items }: { items: Tally[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <Card>
      <CardHeader><CardTitle className="font-serif text-lg">Trabalhos por ano</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="text-muted-foreground">Sem dados.</p> : (
          <>
            <div className="flex h-48 items-end gap-0.5 border-b" role="img" aria-label="Gráfico de trabalhos por ano; os valores estão na tabela abaixo">
              {items.map((item) => (
                <div key={item.label} className="flex h-full min-w-0.5 flex-1 items-end" title={`${item.label}: ${item.count}`}>
                  <span className="w-full min-h-0.5 rounded-t bg-bar" style={{ height: `${(item.count / max) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-muted-foreground"><span>{items[0].label}</span><span>{items[items.length - 1].label}</span></div>
            <Collapsible className="mt-2">
              <CollapsibleTrigger asChild><Button variant="link" className="h-auto p-0">Ver os números em tabela</Button></CollapsibleTrigger>
              <CollapsibleContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Ano</TableHead><TableHead className="text-right">Trabalhos</TableHead></TableRow></TableHeader>
                  <TableBody>{items.map((i) => <TableRow key={i.label}><TableCell>{i.label}</TableCell><TableCell className="text-right tabular-nums">{i.count}</TableCell></TableRow>)}</TableBody>
                </Table>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function Analysis({ project }: { project: Project }) {
  const [source, setSource] = useState("screening");
  const works = useMemo(() => (source === "screening" ? visibleScreening(project) : project.results), [source, project]);
  const data = useMemo(() => analyze(works), [works]);
  const cloud = useMemo(() => termCloud(works, project.terms.filter(Boolean)), [works, project.terms]);
  const maxCloud = cloud[0]?.count ?? 1;

  const copyCloud = async () => {
    await navigator.clipboard.writeText(cloudText(cloud));
    toast.success("Texto copiado.");
  };

  return (
    <>
      <PageIntro step={5} title="Veja o panorama da literatura">
        Autores, periódicos, orientadores e anos mais frequentes nos trabalhos da sua revisão.
      </PageIntro>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={source} onValueChange={setSource}>
          <TabsList aria-label="Origem dos dados">
            <TabsTrigger value="screening">Trabalhos do Tratamento</TabsTrigger>
            <TabsTrigger value="results">Todos os resultados</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="font-medium">{works.length.toLocaleString("pt-BR")} trabalhos</span>
      </div>
      {works.length === 0 ? <Empty>Ainda não há trabalhos nesta origem.</Empty> : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Years items={data.years} />
          <Card>
            <CardHeader><CardTitle className="font-serif text-lg">Nuvem de termos</CardTitle></CardHeader>
            <CardContent>
              {cloud.length === 0 ? <p className="text-muted-foreground">Defina os termos na etapa 3 para ver a nuvem.</p> : (
                <>
                  <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-2 font-serif">
                    {cloud.map((t) => <span key={t.label} title={`${t.count} ocorrências`} style={{ fontSize: `${1 + (t.count / maxCloud) * 1.6}rem` }}>{t.label}</span>)}
                  </div>
                  <Button variant="outline" onClick={copyCloud}>Copiar texto da nuvem</Button>
                </>
              )}
            </CardContent>
          </Card>
          <Ranking title="Autores" items={data.authors} />
          <Ranking title="Periódicos e instituições" items={data.venues} />
          <Ranking title="Orientadores" items={data.advisors} />
        </div>
      )}
    </>
  );
}
