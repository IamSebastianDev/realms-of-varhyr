import { resolve } from "node:path";

/** The repository root. Tools run with their own package as the working directory, so paths are anchored here instead. */
export const repoRoot = resolve(import.meta.dirname, "../..");
