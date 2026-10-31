import type { Metrics, PlatformId, PlatformInfo, Work } from "../shared/types.ts";

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Erro ${response.status}`);
  return data;
}

/** Retries for a few seconds: in development Vite usually starts before the API. */
export async function fetchPlatforms(attempts = 10): Promise<PlatformInfo[]> {
  const response = await fetch("/api/platforms").catch(() => null);
  if (response?.ok) return response.json();
  if (attempts <= 1) throw new Error("API indisponível");
  await new Promise((resolve) => setTimeout(resolve, 500));
  return fetchPlatforms(attempts - 1);
}

export const checkPlatforms = (): Promise<Record<string, boolean>> => fetch("/api/platforms/check").then((r) => r.json());
export const fetchCount = (platform: PlatformId, query: string, signal?: AbortSignal) =>
  post<{ count: number }>("/api/count", { platform, query }, signal).then((r) => r.count);
export const fetchPage = (platform: PlatformId, query: string, page: number, signal?: AbortSignal) =>
  post<{ works: (Partial<Work> & { title: string })[] }>("/api/page", { platform, query, page }, signal).then((r) => r.works);
export const fetchDetails = (platform: PlatformId, link: string, signal?: AbortSignal) =>
  post<Partial<Work>>("/api/details", { platform, link }, signal);
export const fetchMetrics = (issns: string[]) => post<Record<string, Metrics>>("/api/metrics", { issns });
