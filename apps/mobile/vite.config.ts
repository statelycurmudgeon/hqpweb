import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import pkg from "../../package.json" with { type: "json" };

// The app's page: the same App.svelte as the server's, with the core in-process (src/main.ts).
export default defineConfig({
  plugins: [svelte()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(""),
  },
  // The web app's icons and the like.
  publicDir: "../web/public",
  build: { outDir: "dist", emptyOutDir: true },
});
