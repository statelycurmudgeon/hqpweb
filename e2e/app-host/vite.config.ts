import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import pkg from "../../package.json" with { type: "json" };

// The phone app's page for the browser tests (main.ts): apps/mobile's build, with stand-ins.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [svelte()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(""),
  },
  publicDir: "../../apps/web/public",
  build: { outDir: "dist", emptyOutDir: true },
});
