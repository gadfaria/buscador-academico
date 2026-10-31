import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

const PAGE = 100;

export function usePaged<T>(items: T[]) {
  const [page, setPage] = useState(0);
  const last = Math.max(0, Math.ceil(items.length / PAGE) - 1);
  const current = Math.min(page, last);
  return {
    visible: items.slice(current * PAGE, (current + 1) * PAGE),
    pager: items.length > PAGE && (
      <div className="flex items-center justify-center gap-4 py-4">
        <Button variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Página anterior</Button>
        <span>Página {current + 1} de {last + 1}</span>
        <Button variant="outline" disabled={current === last} onClick={() => setPage(current + 1)}>Próxima página</Button>
      </div>
    ),
  };
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="rounded-lg border border-dashed bg-card px-6 py-12 text-center text-muted-foreground">{children}</p>
);

/** Header of each step: says in one sentence what to do there. */
export const PageIntro = ({ step, title, children }: { step?: number; title: string; children: ReactNode }) => (
  <div className="mb-5 max-w-3xl">
    <h2 className="text-2xl font-semibold">{step ? `Etapa ${step}: ` : ""}{title}</h2>
    <p className="mt-1 text-muted-foreground">{children}</p>
  </div>
);

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = Object.assign(document.createElement("a"), { href: url, download: name });
  anchor.click();
  URL.revokeObjectURL(url);
}

/** CSV with ";" and a BOM: opens directly in pt-BR Excel. */
export function downloadCsv(name: string, header: string[], rows: unknown[][]) {
  const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const content = [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n");
  downloadFile(name, `﻿${content}`, "text/csv;charset=utf-8");
}
