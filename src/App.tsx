import { GraduationCap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmHost, confirm } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dedupe } from "../shared/review.ts";
import type { PlatformInfo, Work } from "../shared/types.ts";
import { fetchPlatforms } from "./api.ts";
import { Analysis } from "./pages/Analysis.tsx";
import { LogPage } from "./pages/LogPage.tsx";
import { Results } from "./pages/Results.tsx";
import { Screening } from "./pages/Screening.tsx";
import { Selection } from "./pages/Selection.tsx";
import { Sequences } from "./pages/Sequences.tsx";
import { emptyProject, logEntry, useProject, type Project } from "./project.ts";
import { downloadFile } from "./ui.tsx";

export interface Job { label: string; done: number; total: number }
export interface JobControl {
  job: Job | null;
  run: (label: string, task: (ctx: { signal: AbortSignal; progress: (done: number, total: number, label?: string) => void }) => Promise<void>) => Promise<void>;
}

const STEPS = [
  { id: "sequencias", label: "1. Busca", count: (p: Project) => p.sequences.length },
  { id: "resultados", label: "2. Resultados", count: (p: Project) => p.results.length },
  { id: "tratamento", label: "3. Tratamento", count: (p: Project) => p.screening.length },
  { id: "selecao", label: "4. Seleção", count: (p: Project) => p.selection.length },
  { id: "analise", label: "5. Análise", count: () => 0 },
  { id: "historico", label: "Histórico", count: () => 0 },
];

export function App() {
  const { project, update, ready, replace } = useProject();
  const [tab, setTab] = useState("sequencias");
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const abort = useRef<AbortController>(undefined);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPlatforms().then(setPlatforms).catch(() => toast.error("Não foi possível iniciar o sistema. Recarregue a página em instantes."));
  }, []);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);

  const jobs: JobControl = {
    job,
    run: async (label, task) => {
      abort.current = new AbortController();
      setJob({ label, done: 0, total: 0 });
      try {
        await task({
          signal: abort.current.signal,
          progress: (done, total, text) => setJob({ label: text ?? label, done, total }),
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          toast.error("A operação não pôde ser concluída. Verifique sua internet e tente novamente.");
        }
      } finally {
        setJob(null);
      }
    },
  };

  const addWorks = (works: Work[], action: string, sequence = "") => {
    update((p) => {
      const merged = dedupe([...p.results, ...works]);
      return { results: merged.works, log: [...p.log, logEntry(action, sequence, works.length), logEntry("Remover Duplicados", sequence, merged.removed)] };
    });
  };

  const saveCopy = () => {
    downloadFile("buscador-academico-projeto.json", JSON.stringify(project), "application/json");
    toast.success("Cópia salva na sua pasta de downloads.");
  };

  const openCopy = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Project;
      const ok = await confirm({
        title: "Abrir esta cópia?",
        description: "O trabalho que está na tela agora será substituído pelo conteúdo do arquivo.",
        action: "Abrir cópia",
        destructive: true,
      });
      if (ok) replace({ ...emptyProject(), ...parsed });
    } catch {
      toast.error("Este arquivo não é uma cópia válida do projeto.");
    }
  };

  if (!ready) return null;

  return (
    <div className="min-h-screen">
      <Toaster />
      <ConfirmHost />
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-seal text-card"><GraduationCap className="size-7" aria-hidden /></span>
            <div>
              <h1 className="text-2xl leading-tight font-semibold">Buscador Acadêmico</h1>
              <p className="text-muted-foreground">Sua revisão de literatura, passo a passo</p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" onClick={saveCopy}>Salvar cópia</Button>
            <Button variant="outline" onClick={() => importInput.current?.click()}>Abrir cópia</Button>
            <input ref={importInput} type="file" accept=".json" hidden onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) openCopy(file);
              e.target.value = "";
            }} />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-3">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
              {STEPS.map((step) => {
                const count = step.count(project);
                return (
                  <TabsTrigger key={step.id} value={step.id} className="flex-none">
                    {step.label}{count > 0 && <span className="tabular-nums opacity-85">({count.toLocaleString("pt-BR")})</span>}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>
      </header>
      {job && (
        <div className="sticky top-0 z-40 border-b bg-accent" role="status">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{job.label}{job.total > 0 && ` · ${job.done.toLocaleString("pt-BR")} de ${job.total.toLocaleString("pt-BR")}`}</p>
              <Progress className="mt-2 h-3" value={job.total ? (job.done / job.total) * 100 : undefined} />
            </div>
            <Button variant="outline" onClick={() => abort.current?.abort()}>Cancelar</Button>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {tab === "sequencias" && <Sequences project={project} update={update} platforms={platforms} jobs={jobs} addWorks={addWorks} onDone={() => setTab("resultados")} />}
        {tab === "resultados" && <Results project={project} update={update} platforms={platforms} jobs={jobs} addWorks={addWorks} onTransport={() => setTab("tratamento")} />}
        {tab === "tratamento" && <Screening project={project} update={update} onTransport={() => setTab("selecao")} />}
        {tab === "selecao" && <Selection project={project} update={update} onNext={() => setTab("analise")} />}
        {tab === "analise" && <Analysis project={project} />}
        {tab === "historico" && <LogPage project={project} update={update} />}
      </main>
    </div>
  );
}
