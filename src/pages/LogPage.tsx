import { confirm } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Project, Update } from "../project.ts";
import { downloadCsv, Empty, PageIntro } from "../ui.tsx";

export function LogPage({ project, update }: { project: Project; update: Update }) {
  const rows = [...project.log].reverse();

  const clear = async () => {
    const ok = await confirm({
      title: "Apagar o histórico?",
      description: "O registro das buscas não poderá ser recuperado. Se precisar dele para descrever o método da revisão, baixe a planilha antes.",
      action: "Apagar histórico",
      destructive: true,
    });
    if (ok) update({ log: [] });
  };

  return (
    <>
      <PageIntro title="Histórico">
        Registro de tudo que foi feito, útil para descrever o método da sua revisão.
      </PageIntro>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="outline" disabled={!rows.length} onClick={() => downloadCsv("historico.csv", ["Data/Hora", "Ação", "Busca", "Total"], project.log.map((l) => [l.at, l.action, l.sequence, l.total]))}>Baixar planilha</Button>
        <Button variant="ghost" disabled={!rows.length} onClick={clear}>Apagar histórico</Button>
      </div>
      {rows.length === 0 ? <Empty>Nenhuma ação registrada ainda.</Empty> : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Data e hora</TableHead><TableHead>Ação</TableHead><TableHead>Busca</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>{l.at}</TableCell><TableCell>{l.action}</TableCell>
                  <TableCell className="whitespace-normal">{l.sequence}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.total?.toLocaleString("pt-BR")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
