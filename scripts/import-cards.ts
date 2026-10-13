import { importCardAssets } from './card-assets';

try {
  const result = await importCardAssets(process.cwd());
  console.log(`${result.changed ? 'Imported' : 'Up to date:'} ${result.count} cards, ${result.factions} factions and ${result.sets} ${result.sets===1?'set':'sets'} from assets/.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
