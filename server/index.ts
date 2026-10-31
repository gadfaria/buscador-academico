import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { findConnector, connectors, platformInfo } from "./connectors.ts";
import { lookupMetrics } from "./metrics.ts";

const app = new Hono();

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: error.message }, 502);
});

app.get("/api/platforms", (c) => c.json(platformInfo()));

// Port of Testar_Plataformas
app.get("/api/platforms/check", async (c) => {
  const active = connectors.filter((p) => p.enabled?.() ?? true);
  const results = await Promise.all(active.map(async (p) => {
    try {
      await p.count("educacao");
      return [p.id, true] as const;
    } catch {
      return [p.id, false] as const;
    }
  }));
  return c.json(Object.fromEntries(results));
});

const connectorFor = (id: string) => {
  const connector = findConnector(id);
  if (!connector) throw new Error(`Plataforma indisponível: ${id}`);
  return connector;
};

app.post("/api/count", async (c) => {
  const { platform, query } = await c.req.json();
  return c.json({ count: await connectorFor(platform).count(query) });
});

app.post("/api/page", async (c) => {
  const { platform, query, page } = await c.req.json();
  return c.json({ works: await connectorFor(platform).page(query, page) });
});

app.post("/api/details", async (c) => {
  const { platform, link } = await c.req.json();
  const connector = connectorFor(platform);
  return c.json(connector.details ? await connector.details(link) : {});
});

app.post("/api/metrics", async (c) => {
  const { issns } = await c.req.json();
  return c.json(await lookupMetrics(issns));
});

if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist" }));
}

const port = Number(process.env.API_PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`API em http://localhost:${port}`);
