import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// Two test projects: pure logic and server code run in Node; client code runs in jsdom.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: "node",
            environment: "node",
            include: ["tests/rules/**/*.test.ts", "tests/server/**/*.test.ts"],
          },
        },
        {
          extends: true,
          test: {
            name: "client",
            environment: "jsdom",
            include: ["tests/client/**/*.test.{ts,tsx}"],
            setupFiles: ["tests/client/setup.ts"],
          },
        },
      ],
    },
  }),
);
