import { useState } from "react";
import { toast } from "sonner";
import { confirm } from "@/components/confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { countSequences, generateSequences } from "../../shared/sequences.ts";
import type { PlatformId, PlatformInfo, Work } from "../../shared/types.ts";
import { checkPlatforms, fetchCount, fetchPage } from "../api.ts";
import type { JobControl } from "../App.tsx";
import { logEntry, type Project, type Sequence, type Update } from "../project.ts";
import { Empty, PageIntro } from "../ui.tsx";

interface Props {
  project: Project;
  update: Update;
  platforms: PlatformInfo[];
  jobs: JobControl;
  addWorks: (works: Work[], action: string, sequence?: string) => void;
  onDone: () => void;
}

const newSequence = (text: string, selected = false): Sequence => ({ id: crypto.randomUUID(), text, selected, counts: {} });

export function Sequences({ project, update, platforms, jobs, addWorks, onDone }: Props) {
  const [manual, setManual] = useState("");
  const [health, setHealth] = useState<Record<string, boolean>>({});
  const lines = project.termLines.split("\n");
  const toGenerate = countSequences(lines);
  const firstTerms = (lines[0] ?? "").split(";").map((t) => t.trim().toLowerCase()).filter(Boolean);
  const active = platforms.filter((p) => p.enabled && project.platforms.includes(p.id));
  const selected = project.sequences.filter((s) => s.selected && s.text.trim());
  const busy = jobs.job !== null;
  const ready = !busy && selected.length > 0 && active.length > 0;
  const total = (s: Sequence) => Object.values(s.counts).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);

  const setSequence = (id: string, change: Partial<Sequence>) =>
    update((p) => ({ sequences: p.sequences.map((s) => (s.id === id ? { ...s, ...change } : s)) }));

  const generate = async () => {
    const ok = await confirm({
      title: toGenerate === 1 ? "Criar esta busca?" : `Criar ${toGenerate.toLocaleString("pt-BR")} buscas?`,
      description: "Serão criadas todas as combinações possíveis entre os termos digitados.",
      action: "Criar buscas",
    });
    if (ok) update((p) => ({ sequences: [...p.sequences, ...generateSequences(lines).map((t) => newSequence(t, p.sequences.length === 0 && toGenerate === 1))] }));
  };

  const addManual = () => {
    if (!manual.trim()) return;
    update((p) => ({ sequences: [...p.sequences, newSequence(manual.trim(), true)] }));
    setManual("");
  };

  const searchCounts = () => jobs.run("Contando resultados", async ({ signal, progress }) => {
    const steps = selected.length * active.length;
    let done = 0;
    for (const sequence of selected) {
      const counts: Sequence["counts"] = {};
      await Promise.all(active.map(async (platform) => {
        counts[platform.id] = await fetchCount(platform.id, sequence.text, signal).catch((error) => {
          if (error.name === "AbortError") throw error;
          return "ERRO" as const;
        });
        progress(++done, steps);
      }));
      setSequence(sequence.id, { counts });
      update((p) => ({ log: [...p.log, logEntry("Buscar Quantidades", sequence.text, total({ ...sequence, counts }))] }));
    }
  });

  const downloadTitles = async () => {
    const known = selected.reduce((sum, s) => sum + total(s), 0);
    const ok = await confirm({
      title: "Baixar os trabalhos encontrados?",
      description: known
        ? `Até ${known.toLocaleString("pt-BR")} trabalhos serão baixados. Isso pode levar alguns minutos, e você poderá cancelar a qualquer momento.`
        : `Serão baixados os trabalhos ${selected.length === 1 ? "da busca marcada" : `das ${selected.length} buscas marcadas`}. Isso pode levar alguns minutos, e você poderá cancelar a qualquer momento.`,
      action: "Baixar trabalhos",
    });
    if (!ok) return;
    return jobs.run("Baixando trabalhos", async ({ signal, progress }) => {
      const truncated: string[] = [];
      const failed: string[] = [];
      for (const sequence of selected) {
        const downloaded: Work[] = [];
        for (const platform of active) {
          try {
            const available = await fetchCount(platform.id, sequence.text, signal);
            const target = Math.min(available, project.maxPerPlatform);
            if (available > target) truncated.push(`${platform.label} (${target} de ${available})`);
            const before = downloaded.length;
            for (let page = 1; downloaded.length - before < target; page++) {
              const works = await fetchPage(platform.id, sequence.text, page, signal);
              if (works.length === 0) break;
              downloaded.push(...works.slice(0, target - (downloaded.length - before)).map((w) => toWork(w, platform.label, sequence.text)));
              progress(downloaded.length - before, target, `${platform.label}: ${sequence.text}`);
            }
          } catch (error) {
            if ((error as Error).name === "AbortError") { addWorks(downloaded, "Baixar Títulos (cancelado)", sequence.text); throw error; }
            failed.push(platform.label);
          }
        }
        addWorks(downloaded, "Baixar Títulos", sequence.text);
      }
      if (truncated.length) toast.warning(`Limite de trabalhos atingido em: ${[...new Set(truncated)].join(", ")}. Aumente o limite se quiser baixar mais.`);
      if (failed.length) toast.error(`Não foi possível baixar de: ${[...new Set(failed)].join(", ")}.`);
      onDone();
    });
  };

  const togglePlatform = (id: PlatformId) =>
    update((p) => ({ platforms: p.platforms.includes(id) ? p.platforms.filter((x) => x !== id) : [...p.platforms, id] }));

  const test = () => jobs.run("Verificando as bases", async () => setHealth(await checkPlatforms()));

  const clearAll = async () => {
    const ok = await confirm({
      title: "Apagar todas as buscas?",
      description: "Os termos, as buscas e as contagens desta etapa serão apagados. Os trabalhos já baixados continuam salvos.",
      action: "Apagar buscas",
      destructive: true,
    });
    if (ok) update({ sequences: [], termLines: "" });
  };

  const allSelected = project.sequences.length > 0 && project.sequences.every((s) => s.selected);

  return (
    <>
      <PageIntro step={1} title="Defina sua busca">
        Digite os termos da sua pesquisa, escolha as bases, marque as buscas desejadas e clique em “Baixar trabalhos”.
      </PageIntro>
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg">Termos da pesquisa</CardTitle>
            <CardDescription>Escreva um termo por linha. Para sinônimos, separe com ponto e vírgula.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Label htmlFor="terms" className="sr-only">Termos da pesquisa</Label>
            <Textarea id="terms" rows={5} placeholder={"Exemplo:\nevasão escolar; abandono escolar\nensino médio"} value={project.termLines}
              onChange={(e) => update({ termLines: e.target.value })} />
            <Button className="self-start" disabled={toGenerate === 0} onClick={generate}>
              {toGenerate > 0 ? `Criar ${toGenerate.toLocaleString("pt-BR")} ${toGenerate === 1 ? "busca" : "buscas"}` : "Criar buscas"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg">Bases de pesquisa</CardTitle>
            <CardDescription>Desmarque as bases que não quiser consultar.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {platforms.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <Checkbox id={`platform-${p.id}`} disabled={!p.enabled} checked={p.enabled && project.platforms.includes(p.id)} onCheckedChange={() => togglePlatform(p.id)} />
                  <Label htmlFor={`platform-${p.id}`}>{p.label}</Label>
                  {!p.enabled && <Badge variant="outline">Indisponível</Badge>}
                  {p.enabled && p.id in health && (
                    <Badge variant={health[p.id] ? "secondary" : "destructive"}>{health[p.id] ? "Funcionando" : "Fora do ar"}</Badge>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <Button variant="outline" disabled={busy} onClick={test}>Verificar bases</Button>
              <div className="flex flex-col gap-1">
                <Label htmlFor="max">Limite de trabalhos por base</Label>
                <Input id="max" className="w-32" type="number" min={1} value={project.maxPerPlatform} onChange={(e) => update({ maxPerPlatform: Number(e.target.value) || 1 })} />
              </div>
            </div>
            <p className="text-muted-foreground">Para SciELO e Google Acadêmico, exporte um arquivo RIS no site da base e importe na etapa 2.</p>
          </CardContent>
        </Card>
      </div>

      <h3 className="mb-1 text-lg font-semibold">Suas buscas</h3>
      <p className="mb-3 text-muted-foreground">{selected.length} de {project.sequences.length} marcadas. Termos da primeira linha aparecem em destaque.</p>
      <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); addManual(); }}>
        <Input className="min-w-64 flex-1" aria-label="Nova busca" placeholder='Ou digite uma busca pronta, ex.: "evasão escolar" AND "ensino médio"' value={manual} onChange={(e) => setManual(e.target.value)} />
        <Button type="submit" variant="outline">Adicionar busca</Button>
      </form>
      {project.sequences.length === 0 ? <Empty>Nenhuma busca ainda. Digite seus termos acima e clique em “Criar buscas”.</Empty> : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox aria-label="Marcar todas as buscas" checked={allSelected}
                    onCheckedChange={() => update((p) => ({ sequences: p.sequences.map((s) => ({ ...s, selected: !allSelected })) }))} />
                </TableHead>
                <TableHead>Busca</TableHead>
                {active.map((p) => <TableHead key={p.id} className="text-right">{p.label}</TableHead>)}
                <TableHead className="text-right">Total</TableHead>
                <TableHead><span className="sr-only">Remover</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {project.sequences.map((s) => (
                <TableRow key={s.id} data-state={s.selected ? "selected" : undefined} className="data-[state=selected]:bg-accent">
                  <TableCell><Checkbox aria-label={`Marcar ${s.text}`} checked={s.selected} onCheckedChange={(v) => setSequence(s.id, { selected: v === true })} /></TableCell>
                  <TableCell>
                    <Input aria-label="Texto da busca" className={`min-w-72 ${firstTerms.some((t) => s.text.includes(t)) ? "font-medium text-seal" : ""}`} value={s.text}
                      onChange={(e) => setSequence(s.id, { text: e.target.value, counts: {} })} />
                  </TableCell>
                  {active.map((p) => (
                    <TableCell key={p.id} className="text-right tabular-nums">
                      {s.counts[p.id] === "ERRO" ? <Badge variant="destructive">Falhou</Badge> : s.counts[p.id]?.toLocaleString("pt-BR")}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-semibold tabular-nums">{Object.keys(s.counts).length ? total(s).toLocaleString("pt-BR") : ""}</TableCell>
                  <TableCell>
                    <Button variant="ghost" aria-label={`Remover ${s.text}`} onClick={() => update((p) => ({ sequences: p.sequences.filter((x) => x.id !== s.id) }))}>Remover</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={!ready} onClick={downloadTitles}>Baixar trabalhos</Button>
        <Button size="lg" variant="secondary" disabled={!ready} onClick={searchCounts}>Só contar resultados</Button>
        {project.sequences.length > 0 && <Button variant="ghost" className="ml-auto" disabled={busy} onClick={clearAll}>Apagar buscas</Button>}
      </div>
      {!selected.length && project.sequences.length > 0 && <p className="mt-2 text-muted-foreground">Marque ao menos uma busca para continuar.</p>}
    </>
  );
}

function toWork(draft: Partial<Work> & { title: string }, platform: string, sequence: string): Work {
  return {
    year: "", type: "", keywords: "", authors: "", venue: "", issn: "", program: "", link: "", advisor: "", abstract: "", doi: "",
    ...draft, id: crypto.randomUUID(), platform, sequence,
  };
}
