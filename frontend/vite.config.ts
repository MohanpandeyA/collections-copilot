/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Writes asset-manifest.json: every built file, so the service worker can save all the app's
 *  screens on first visit (they are lazy-loaded, so otherwise an unopened screen fails offline). */
function assetManifest(): Plugin {
  return {
    name: "asset-manifest",
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith(".map")).map((f) => `/${f}`);
      this.emitFile({ type: "asset", fileName: "asset-manifest.json", source: JSON.stringify(files) });
    },
  };
}

export default defineConfig({
  // A new id on every build makes the browser see a new worker URL, so each deploy refreshes the offline copy
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  plugins: [react(), assetManifest()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
