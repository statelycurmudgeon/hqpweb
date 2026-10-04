// The curated ESLint set (docs/quality-plan.md, "The ESLint set"): bug classes we've
// had or are likely to have. Formatting stays with Prettier.
//
// Lives in lint/ with its own TypeScript 6.0, because typescript-eslint doesn't
// support TypeScript 7 yet. Run from the repo root: npm run lint.
//
// Existing violations are recorded in lint/eslint-suppressions.json: they don't fail,
// new ones do. Fix them as each file is refactored, then `npm run lint -- --prune-suppressions`.
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

export default tseslint.config(
  {
    ignores: ["**/node_modules/", "**/dist/", ".tsbuild/", "lint/", "tools/", "e2e/test-results/", "e2e/report/"],
  },
  {
    files: ["**/*.ts", "**/*.svelte"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // Root-level files that no tsconfig includes.
        projectService: { allowDefaultProject: ["vitest.config.ts", "test/*.ts"] },
        tsconfigRootDir: root,
        extraFileExtensions: [".svelte"],
      },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      // Promises nobody waits for: errors vanish and ordering breaks.
      "@typescript-eslint/no-floating-promises": "error",
      // Promises passed where they don't belong (an async handler where a plain one is expected).
      "@typescript-eslint/no-misused-promises": "error",
      // A new mode, state or field that a switch silently ignores.
      "@typescript-eslint/switch-exhaustiveness-check": ["error", { considerDefaultExhaustiveForUnions: true }],
      // Unused code. A leading _ marks a deliberately unused argument.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      // Reported, not yet blocking (the plan: fails above 60 lines or a complexity of 15, later).
      complexity: ["warn", 15],
      "max-lines-per-function": ["warn", { max: 60, skipBlankLines: true, skipComments: true }],
    },
  },
  // Svelte's own correctness and reactivity rules.
  ...svelte.configs.recommended,
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: { parserOptions: { parser: tseslint.parser, projectService: true, extraFileExtensions: [".svelte"] } },
  },
);
