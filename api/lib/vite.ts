import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";

type App = Hono<{ Bindings: HttpBindings }>;

export function serveStaticFiles(app: App) {
  const distPath = path.resolve(import.meta.dirname, "../dist/public");

  const serveIndexFresh = (c: any) => {
    const content = fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8");
    c.header("Cache-Control", "no-store, no-cache, must-revalidate");
    return c.html(content);
  };

  // El index.html (shell de la app) nunca debe cachearse en el navegador: es el que
  // apunta al JS/CSS con hash del build actual. Si el navegador lo cachea, el usuario
  // se queda viendo una version vieja de la app para siempre aunque el servidor ya
  // tenga el codigo nuevo.
  app.get("/", serveIndexFresh);
  app.get("/index.html", serveIndexFresh);

  app.use("*", serveStatic({ root: "./dist/public" }));

  app.notFound((c) => {
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    return serveIndexFresh(c);
  });
}
