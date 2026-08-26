import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // @ts-ignore
    threads: false,
  },
  resolve: {
    alias: {
      "@": import.meta.dirname,
    },
  },
});
