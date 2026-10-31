// Equivalent of Public Sub http(): timeouts and one retry. Unlike the spreadsheet, it keeps TLS validation
// on, and it enforces a minimum interval per host to respect API rate limits.
const MIN_INTERVAL_MS: Record<string, number> = { "eutils.ncbi.nlm.nih.gov": 350 };
const DEFAULT_INTERVAL_MS = 150;
const nextSlot = new Map<string, number>();

async function waitForSlot(host: string) {
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, slot + (MIN_INTERVAL_MS[host] ?? DEFAULT_INTERVAL_MS));
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
}

export class UpstreamError extends Error {
  constructor(readonly host: string, readonly status: number) {
    super(`${host} respondeu ${status}`);
  }
}

export async function request(url: string, init: RequestInit = {}): Promise<Response> {
  const host = new URL(url).host;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    await waitForSlot(host);
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "User-Agent": "BuscadorAcademico/0.1", ...init.headers },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response;
      lastError = new UpstreamError(host, response.status);
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export const getJson = async <T = any>(url: string, init?: RequestInit): Promise<T> => (await request(url, init)).json() as Promise<T>;
export const getText = async (url: string, init?: RequestInit): Promise<string> => (await request(url, init)).text();
