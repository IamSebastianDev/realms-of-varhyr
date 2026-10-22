import { defineConfig } from "vitest/config";

// The full-match tests play whole games, which needs more than the default five seconds when packages are tested in parallel.
export default defineConfig({ test: { testTimeout: 30_000 } });
