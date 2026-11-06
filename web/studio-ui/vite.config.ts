import { defineConfig } from "vite";

// Сборка кладётся в хаб: src/BotStudio.Hub/wwwroot (оттуда её раздаёт сервер и WPF-приложение).
// В режиме разработки (npm run dev) запросы /ws и /api уходят на запущенный хаб.
const hub = process.env.BOTSTUDIO_HUB ?? "http://localhost:5280";

export default defineConfig({
  base: "./",
  build: {
    outDir: "../../src/BotStudio.Hub/wwwroot",
    emptyOutDir: true,
    target: "es2022",
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
