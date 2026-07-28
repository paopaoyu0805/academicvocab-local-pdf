import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves this project below "/academicvocab-local-pdf/".
  // Relative URLs keep the app's assets and worker reachable from that path.
  base: "./",
  cacheDir: "../cache/vite-android-pwa",
  plugins: [{
    name: "sites-static-worker-entry",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "server/index.js",
        source: "export default { async fetch(request, env) { return env.ASSETS.fetch(request); } };"
      });
    }
  }]
});
