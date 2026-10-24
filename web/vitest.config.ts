import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "src/components/Console.tsx",
        "src/components/TryRefusal.tsx",
        "src/data/session.ts",
        "src/lib/envelope.ts",
        "src/lib/presets.ts",
        "src/lib/halberd.ts",
      ],
      exclude: ["src/**/*.test.{ts,tsx}"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});

