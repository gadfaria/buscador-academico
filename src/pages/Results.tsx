import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { confirm } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dedupe, eligibleForMetrics } from "../../shared/review.ts";
import { parseRis } from "../../shared/ris.ts";
import { EMPTY_METRICS, type PlatformInfo, type ScreeningRow, type Work } from "../../shared/types.ts";
import { fetchDetails, fetchMetrics } from "../api.ts";
import type { JobControl } from "../App.tsx";
import { logEntry, type Project, type Update } from "../project.ts";
import { downloadCsv, Empty, PageIntro, usePaged } from "../ui.tsx";

interface Props {
  project: Project;
  update: Update;
  platforms: PlatformInfo[];
  jobs: JobControl;
  addWorks: (works: Work[], action: string, sequence?: string) => void;
  onTransport: () => void;
}

const DETAIL_PLATFORMS = new Set(["capes", "educapes"]);
const ALL = "todas";

export function Results({ project, update, platforms, jobs, addWorks, onTransport }: Props) {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState(ALL);
  const [open, setOpen] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return project.results.filter((w) =>
      (platform === ALL || w.platform === platform) &&
      (!needle || `${w.title} ${w.authors} ${w.venue} ${w.keywords}`.toLowerCase().includes(needle)));
  }, [project.results, query, platform]);
  const { visible, pager } = usePaged(filtered);
  const labels = [...new Set(project.results.map((w) => w.platform))];
  const missing = filtered.filter((w) => w.link && !w.abstract && platforms.some((p) => p.label === w.platform && DETAIL_PLATFORMS.has(p.id)));

  const complete = async () => {
    const ok = await confirm({
      title: `Buscar ${missing.length} resumos?`,
      description: "Cada trabalho é consultado no site de origem, o que pode levar alguns minutos.",
      action: "Buscar resumos",
    });
    if (!ok) return;
    return jobs.run("Buscando resumos", async ({ signal, progress }) => {
      let done = 0;
      let failed = 0;
      for (const work of missing) {
        const id = platforms.find((p) => p.label === work.platform)!.id;
        try {
          const details = await fetchDetails(id, work.link, signal);
          const filled = Object.fromEntries(Object.entries(details).filter(([, v]) => v));
          update((p) => ({ results: p.results.map((w) => (w.id === work.id ? { ...w, ...filled } : w)) }));
        } catch (error) {
          if ((error as Error).name === "AbortError") throw error;
          failed++;
        }
        progress(++done, missing.length);
      }
      update((p) => ({ log: [...p.log, logEntry("Baixar Resumos", "", done - failed)] }));
      if (failed) toast.warning(`${failed} resumos não puderam ser obtidos.`);
    });
  };

  const transport = async () => {
    const ok = await confirm({
      title: `Avançar com ${filtered.length.toLocaleString("pt-BR")} trabalhos?`,
      description: project.screening.length
        ? "A etapa de Tratamento será refeita com estes trabalhos, e o que estiver lá será substituído."
        : "Os trabalhos listados agora seguirão para a etapa de Tratamento.",
      action: "Avançar",
    });
    if (!ok) return;
    const eligible = filtered.filter((w) => w.issn && eligibleForMetrics(w));
    const metrics = await fetchMetrics([...new Set(eligible.map((w) => w.issn))]);
    const screening: ScreeningRow[] = filtered.map((w) => ({
      ...w,
      venue: w.venue.toUpperCase(),
      metrics: (eligibleForMetrics(w) && metrics[w.issn]) || EMPTY_METRICS,
      decision: "",
    }));
    update({ screening });
    onTransport();
  };

  const importRis = async (input: File) => {
    const works = parseRis(await input.text(), input.name);
    if (works.length === 0) return void toast.error("Nenhum trabalho encontrado neste arquivo. Confira se ele está no formato RIS.");
    addWorks(works, "Importar RIS", input.name);
    toast.success(`${works.length} trabalhos importados.`);
  };

  const exportCsv = () => downloadCsv("resultados.csv",
    ["Plataforma", "Ano", "Tipologia", "Título", "Palavras-chave", "Autor(a)", "Instituição/Periódico", "ISSN", "Programa", "Link", "Orientador(a)", "Resumo", "Sequência"],
    filtered.map((w) => [w.platform, w.year, w.type, w.title, w.keywords, w.authors, w.venue, w.issn, w.program, w.link, w.advisor, w.abstract, w.sequence]));

  const clear = async () => {
    const ok = await confirm({
      title: "Apagar todos os resultados?",
      description: `${project.results.length.toLocaleString("pt-BR")} trabalhos serão apagados. Para recuperá-los, será preciso baixar novamente.`,
      action: "Apagar resultados",
      destructive: true,
    });
    if (ok) update((p) => ({ results: [], log: [...p.log, logEntry("Limpar Resultados", "", p.results.length)] }));
  };

  const removeDuplicates = () => {
    const { works, removed } = dedupe(project.results);
    update((p) => ({ results: works, log: [...p.log, logEntry("Remover Duplicados", "", removed)] }));
    toast.success(removed ? `${removed} trabalhos repetidos removidos.` : "Nenhum trabalho repetido encontrado.");
  };

  return (
    <>
      <PageIntro step={2} title="Confira os trabalhos encontrados">
        Trabalhos repetidos já foram removidos. Use o filtro se quiser restringir a lista e depois clique em “Avançar para o Tratamento”.
      </PageIntro>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input className="min-w-64 flex-1" type="search" aria-label="Filtrar resultados" placeholder="Filtrar por título, autor ou periódico" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger aria-label="Base de pesquisa"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as bases</SelectItem>
            {labels.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="font-medium">{filtered.length.toLocaleString("pt-BR")} trabalhos</span>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="lg" disabled={!filtered.length} onClick={transport}>Avançar para o Tratamento</Button>
        <Button variant="outline" disabled={jobs.job !== null || missing.length === 0} onClick={complete}>Buscar resumos que faltam ({missing.length})</Button>
        <Button variant="outline" onClick={() => file.current?.click()}>Importar arquivo RIS</Button>
        <input ref={file} type="file" accept=".ris,.txt" hidden onChange={(e) => {
          const input = e.target.files?.[0];
          if (input) importRis(input);
          e.target.value = "";
        }} />
        <Button variant="outline" onClick={removeDuplicates}>Remover repetidos</Button>
        <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>Baixar planilha</Button>
        <Button variant="ghost" onClick={clear} disabled={!project.results.length}>Apagar resultados</Button>
      </div>
      {project.results.length === 0 ? <Empty>Nenhum trabalho ainda. Volte à etapa 1 para baixar ou importe um arquivo RIS.</Empty> : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Trabalho</TableHead><TableHead>Ano</TableHead><TableHead>Tipo</TableHead><TableHead>Base</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="min-w-80 whitespace-normal">
                    <p className="font-medium">{w.title || "(sem título)"}</p>
                    <p className="text-muted-foreground">{[w.authors, w.venue].filter(Boolean).join(" · ")}</p>
                    <Button variant="link" className="h-auto p-0" aria-expanded={open === w.id} onClick={() => setOpen(open === w.id ? null : w.id)}>
                      {open === w.id ? "Ocultar detalhes" : "Ver resumo"}
                    </Button>
                    {open === w.id && (
                      <div className="mt-2 flex max-w-prose flex-col gap-2 border-l-4 border-primary pl-3">
                        <p>{w.abstract || "Resumo não disponível."}</p>
                        {w.keywords && <p><b>Palavras-chave:</b> {w.keywords}</p>}
                        {w.advisor && <p><b>Orientação:</b> {w.advisor}</p>}
                        {w.link && <a className="text-primary underline" href={w.link} target="_blank" rel="noreferrer">Abrir o trabalho original</a>}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{w.year}</TableCell>
                  <TableCell className="whitespace-normal">{w.type}</TableCell>
                  <TableCell className="whitespace-normal">{w.platform}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {pager}
    </>
  );
}
