import { join } from 'node:path';
import { readFactionAssets, readSetAssets } from './card-assets';
import { writeCardJsonSchema } from './card-schema';

try{
  const root=process.cwd(),directory=join(root,'assets');
  const factions=await readFactionAssets(directory),sets=await readSetAssets(directory,factions);
  const changed=await writeCardJsonSchema(root,factions,sets);
  console.log(`${changed?'Generated':'Up to date:'} assets/schemas/card.schema.json`);
}catch(error){console.error(error instanceof Error?error.message:error);process.exitCode=1;}
