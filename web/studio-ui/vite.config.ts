import { defineConfig } from "vite";

// Сборка кладётся в хаб: src/Gearbit.Hub/wwwroot (оттуда её раздаёт сервер и WPF-приложение).
// В режиме разработки (npm run dev) запросы /ws и /api уходят на запущенный хаб.
const hub = process.env.GEARBIT_HUB ?? "http://localhost:5280";

export default defineConfig({
  base: "./",
  build: {
    outDir: "../../src/Gearbit.Hub/wwwroot",
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
