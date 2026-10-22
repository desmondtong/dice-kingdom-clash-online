import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "coverage", ".partykit", "public", "node_modules"]),
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    // Browser code (React client) and its tests
    files: ["src/**/*.{ts,tsx}", "tests/client/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    // Room server (Cloudflare Workers runtime) and its tests
    files: ["party/**/*.ts", "tests/server/**/*.ts"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    // Tooling config files
    files: ["*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
  prettier,
]);
