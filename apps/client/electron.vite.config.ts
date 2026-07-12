import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import svgr from "vite-plugin-svgr";

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: resolve(__dirname, "electron/main/index.ts"),
      },
    },
  },
  preload: {
    build: {
      lib: {
        entry: resolve(__dirname, "electron/preload/index.ts"),
      },
    },
  },
  renderer: {
    root: "src/renderer",
    plugins: [react(), tailwindcss(), svgr()],
  },
});
