import { defineConfig } from "vite";

// Relative base keeps the built game portable: GitHub Pages, itch.io,
// or any plain static host can serve dist/ from a sub-directory.
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
  },
});
