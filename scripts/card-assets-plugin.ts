import type { Plugin } from 'vite';
import { join } from 'node:path';
import { importCardAssets, isCardAssetPath } from './card-assets';

/** Only Vite and authoring commands touch disk; the shipped app imports plain JSON. */
export function cardAssetsPlugin():Plugin{
  let root='',timer:ReturnType<typeof setTimeout>|undefined,queue=Promise.resolve();
  return {
    name:'varhir-card-assets',
    async configResolved(config){root=config.root;await importCardAssets(root);},
    configureServer(server){
      server.watcher.add(`${root}/assets`);
      const update=(path:string)=>{
        if(!isCardAssetPath(root,path))return;
        if(timer)clearTimeout(timer);
        timer=setTimeout(()=>{
          queue=queue.then(async()=>{
            try{
              const result=await importCardAssets(root);
              // The catalogue is installed by atomic rename. Explicitly expire
              // its transform even if a manual import won the watcher race.
              for(const name of ['cards.json','factions.json','sets.json'])
                for(const module of server.moduleGraph.getModulesByFile(join(root,'packages/content/src',name))??[])server.moduleGraph.invalidateModule(module);
              if(result.changed)server.config.logger.info(`Imported ${result.count} asset cards.`);
              server.ws.send({type:'full-reload'});
            }catch(error){
              const text=error instanceof Error?error.message:String(error);
              server.config.logger.error(`Card import: ${text}`);
              server.ws.send({type:'error',err:{message:text,stack:'',plugin:'varhir-card-assets'}});
            }
          });
        },200);
      };
      server.watcher.on('add',update).on('change',update).on('unlink',update);
      server.httpServer?.once('close',()=>{if(timer)clearTimeout(timer);server.watcher.off('add',update).off('change',update).off('unlink',update);});
    },
  };
}
