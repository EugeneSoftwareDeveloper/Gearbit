import { cpSync, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

// Сборка кладётся в хаб: src/Gearbit.Hub/wwwroot (оттуда её раздаёт сервер и WPF-приложение).
// В режиме разработки (npm run dev) запросы /ws и /api уходят на запущенный хаб.
const hub = process.env.GEARBIT_HUB ?? "http://localhost:5280";

/**
 * Картинки редактора блоков (флажок, стрелки, кнопки масштаба) лежат в пакете scratch-blocks.
 * Отдаём их как scratch-media/ и в dev-сервере, и в сборке. Звуки не нужны: в редакторе они выключены.
 */
function scratchMedia(): Plugin {
  const source = fileURLToPath(new URL("./node_modules/scratch-blocks/media", import.meta.url));
  const types: Record<string, string> = { ".svg": "image/svg+xml", ".png": "image/png", ".gif": "image/gif", ".cur": "image/x-icon" };
  const wanted = (file: string) => statSync(file).isDirectory() || extname(file) in types;
  return {
    name: "gearbit-scratch-media",
    configureServer(server) {
      server.middlewares.use("/scratch-media", (req, res, next) => {
        const file = normalize(join(source, decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/")));
        if (!file.startsWith(source) || !existsSync(file) || !wanted(file) || statSync(file).isDirectory()) return next();
        res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
        res.end(readFileSync(file));
      });
    },
    writeBundle(options) {
      const out = resolve(options.dir ?? "dist", "scratch-media");
      cpSync(source, out, { recursive: true, filter: wanted });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [scratchMedia()],
  build: {
    outDir: "../../src/Gearbit.Hub/wwwroot",
    emptyOutDir: true,
    target: "es2022",
    // Редактор блоков (Blockly + scratch-blocks) — отдельный большой файл, грузится при первом открытии вкладки.
    chunkSizeWarningLimit: 2500,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/ws": { target: hub.replace(/^http/, "ws"), ws: true },
      "/api": { target: hub },
    },
  },
});
