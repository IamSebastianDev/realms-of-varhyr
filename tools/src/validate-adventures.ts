import { readAdventures } from "./adventure-assets";
import { repoRoot } from "./repoRoot";

// Checks every adventure under assets/adventures: references, deck legality, graph reachability, paths to the final battle.
//   npm run adventures -w @realms/tools
const { adventures, problems } = await readAdventures(repoRoot);
for (const adventure of adventures)
  console.log(
    `${adventure.id}: ${adventure.nodes.length} nodes, ${adventure.events.length} events, ${adventure.enemies.length} enemies`,
  );
if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exitCode = 1;
} else console.log(`${adventures.length} adventure${adventures.length === 1 ? "" : "s"} valid.`);
