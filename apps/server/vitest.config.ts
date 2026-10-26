import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts", "test/integration/**/*.test.ts"],
          exclude: ["**/node_modules/**"],
          testTimeout: 60_000,
          hookTimeout: 180_000,
          fileParallelism: false,
        },
      },
    ],
  },
})
