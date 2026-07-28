import { defineConfig } from "vite";

export default defineConfig({
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
