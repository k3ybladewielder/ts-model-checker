import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function sanitizeSegment(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned : fallback;
}

function localModelStoragePlugin(): Plugin {
  const modelsRoot = path.resolve(__dirname, "../../models");

  return {
    name: "tsmc-local-model-storage",
    configureServer(server) {
      server.middlewares.use("/__tsmc/save-model", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
          if (body.length > 1024 * 1024) {
            res.statusCode = 413;
            res.end(JSON.stringify({ error: "Payload too large" }));
          }
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body) as {
              project?: string;
              spec?: { moduleName?: string };
              result?: unknown;
              tla?: { tlaFileContent: string; cfgFileContent: string } | null;
            };

            if (!payload.spec || typeof payload.spec.moduleName !== "string") {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Missing spec.moduleName" }));
              return;
            }

            const projectDir = sanitizeSegment(
              payload.project ?? "playground",
              "playground"
            );
            const moduleFile = sanitizeSegment(
              payload.spec.moduleName,
              "MySystem"
            );

            const targetDir = path.resolve(modelsRoot, projectDir);
            if (!targetDir.startsWith(modelsRoot + path.sep)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Invalid project path" }));
              return;
            }

            fs.mkdirSync(targetDir, { recursive: true });

            const files: string[] = [];
            const jsonPath = path.join(targetDir, `${moduleFile}.formal.json`);
            fs.writeFileSync(
              jsonPath,
              JSON.stringify(payload.spec, null, 2) + "\n",
              "utf8"
            );
            files.push(`${projectDir}/${moduleFile}.formal.json`);

            if (payload.tla) {
              fs.writeFileSync(
                path.join(targetDir, `${moduleFile}.tla`),
                payload.tla.tlaFileContent + "\n",
                "utf8"
              );
              fs.writeFileSync(
                path.join(targetDir, `${moduleFile}.cfg`),
                payload.tla.cfgFileContent + "\n",
                "utf8"
              );
              files.push(
                `${projectDir}/${moduleFile}.tla`,
                `${projectDir}/${moduleFile}.cfg`
              );
            }

            if (payload.result !== undefined) {
              fs.writeFileSync(
                path.join(targetDir, `${moduleFile}.report.json`),
                JSON.stringify(payload.result, null, 2) + "\n",
                "utf8"
              );
              files.push(`${projectDir}/${moduleFile}.report.json`);
            }

            res.setHeader("Content-Type", "application/json");
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, files }));
          } catch (err) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localModelStoragePlugin()],
  worker: {
    format: "es",
  },
});
