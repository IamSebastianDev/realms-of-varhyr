import { defineConfig } from "vitest/config";

// Tests run without the build plugins in vite.config.ts.
export default defineConfig({ test: { include: ["tests/**/*.test.{ts,tsx}"] } });
