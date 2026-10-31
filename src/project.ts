import { useEffect, useRef, useState } from "react";
import { EMPTY_FILTERS, type MetricFilters } from "../shared/review.ts";
import type { PlatformId, ScreeningRow, Work } from "../shared/types.ts";

export interface Sequence { id: string; text: string; selected: boolean; counts: Partial<Record<PlatformId, number | "ERRO">> }
export interface LogEntry { at: string; action: string; sequence: string; total: number | null }
export interface SelectionRow { id: string; title: string; scores: number[][] } // scores[evaluator][criterion]; 0 = no score

export interface Project {
  termLines: string;
  sequences: Sequence[];
  platforms: PlatformId[];
  maxPerPlatform: number;
  results: Work[];
  screening: ScreeningRow[];
  terms: string[];
  filters: MetricFilters;
  criteria: string[];
  selection: SelectionRow[];
  log: LogEntry[];
}

export const EVALUATORS = 5;
export const CRITERIA = 10;

export const emptyProject = (): Project => ({
  termLines: "",
  sequences: [],
  platforms: ["capes", "periodicos", "doaj", "eric", "pubmed", "openalex", "educapes"],
  maxPerPlatform: 1000,
  results: [],
  screening: [],
  terms: Array(20).fill(""),
  filters: EMPTY_FILTERS,
  criteria: Array(CRITERIA).fill(""),
  selection: [],
  log: [],
});

const DB = "buscador-academico";
const STORE = "projects";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function load(): Promise<Project | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const get = db.transaction(STORE).objectStore(STORE).get("current");
    get.onsuccess = () => resolve(get.result);
    get.onerror = () => reject(get.error);
  });
}

async function save(project: Project) {
  const db = await openDb();
  db.transaction(STORE, "readwrite").objectStore(STORE).put(project, "current");
}

export type Update = (change: Partial<Project> | ((p: Project) => Partial<Project>)) => void;

export function useProject() {
  const [project, setProject] = useState<Project>(emptyProject);
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    load().then((stored) => {
      if (stored) setProject({ ...emptyProject(), ...stored });
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(project), 400);
  }, [project, ready]);

  const update: Update = (change) =>
    setProject((current) => ({ ...current, ...(typeof change === "function" ? change(current) : change) }));

  return { project, update, ready, replace: setProject };
}

export const logEntry = (action: string, sequence = "", total: number | null = null): LogEntry => ({
  at: new Date().toLocaleString("pt-BR"), action, sequence, total,
});
