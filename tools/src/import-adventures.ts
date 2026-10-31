import { importAdventureAssets } from "./adventure-assets";
import { repoRoot } from "./repoRoot";

const result = await importAdventureAssets(repoRoot);
if (result.problems.length) {
  for (const problem of result.problems) console.error(problem);
  process.exitCode = 1;
} else
  console.log(`Published ${result.count} adventure${result.count === 1 ? "" : "s"} from assets/.`);
