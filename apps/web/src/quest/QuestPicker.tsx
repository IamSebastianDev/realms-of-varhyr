import { useEffect, useMemo, useState } from 'react';
import { t as msg, useLanguage } from '../../../../packages/ui/src/i18n';
import { factionInfo } from '../../../../packages/content/src';
import { dailyQuests, isPlayable, questRules, startRun, type Quest } from '../../../../packages/quest/src';
import { CrownAmount } from '../Crowns';
import { updateCollection } from '../collectionStore';
import { useCollection } from '../collectionStore';
import { localDay } from '../goals';
import { randomSeed } from '../session';
import { rarest } from '../DeckShelf';
import '../game-setup.css';
import { loadMap, paidToday, questContent, saveRun, type LoadedMap } from './questStore';

/** The three quest alignments are the three booster packs, in this order. */
const alignments = [
  { pack: 'hearth-and-crown', label: 'Good' },
  { pack: 'wanderers-road', label: 'Neutral' },
  { pack: 'gathering-dark', label: 'Evil' },
] as const;

const placeName = (map: LoadedMap, id: string) => { const node = map.nodes.find(entry => entry.id === id); return node?.name || 'the stronghold'; };

/** Choose an alignment with the tabs, then set out as one of its three factions. Used in the Play dialog and on the quest page. */
export function QuestPicker({ onStarted }: { onStarted: () => void }) {
  useLanguage();
  const { collection } = useCollection();
  const [map, setMap] = useState<LoadedMap | null | undefined>(undefined);
  useEffect(() => { void loadMap().then(setMap); }, []);
  const day = localDay();
  const quests = useMemo(() => map ? dailyQuests(map, questContent, day) : [], [map, day]);
  const byPack = new Map(quests.map(quest => [quest.pack, quest]));
  const [tab, setTab] = useState<string>(() => alignments.find(entry => byPack.has(entry.pack))?.pack ?? alignments[0].pack);
  useEffect(() => { if (!byPack.has(tab)) { const first = alignments.find(entry => byPack.has(entry.pack)); if (first) setTab(first.pack); } }, [quests]); // eslint-disable-line react-hooks/exhaustive-deps
  if (map === undefined) return <p className="quest-sub">{msg("Loading the map…")}</p>;
  if (!map) return <p className="quest-notice">{msg("The quest map has not been made yet. Place the nodes in the card studio's Map tab, save, and restart the dev server.")}</p>;
  const quest: Quest | undefined = byPack.get(tab), claimed = paidToday(day).includes(tab), poor = collection.crowns < questRules.entryCrowns;
  function start(chosen: Quest, faction: string) {
    if (poor) return;
    updateCollection(current => ({ ...current, crowns: current.crowns - questRules.entryCrowns }));
    saveRun(startRun({ map: map!, content: questContent, quest: chosen, faction, now: Date.now(), seed: randomSeed() }));
    onStarted();
  }
  return <div className="quest-picker">
    <div className="quest-tabs" role="tablist" aria-label={msg("Alignment")}>{alignments.map(entry => {
      const has = byPack.has(entry.pack);
      return <button key={entry.pack} role="tab" aria-selected={tab === entry.pack} disabled={!has} onClick={() => setTab(entry.pack)}><b>{msg(questContent.packs.find(pack => pack.id === entry.pack)?.name ?? '')}</b>{!has && <small>{msg("No quest today")}</small>}</button>;
    })}</div>
    {quest ? <>
      <p className="quest-goal">{msg("Defeat {v0} at {v1}.", { v0: quest.bossName, v1: msg(placeName(map, quest.target)) })}</p>
      <p className="quest-sub">{claimed ? msg("Reward already claimed today. You can still play for the cards.") : msg("Reward: {v0} crowns and {v1} boosters.", { v0: questRules.rewardCrowns, v1: questRules.rewardPacks })} {msg("24 hours to finish.")}</p>
      <div className="quest-stripes" role="group" aria-label={msg("Choose your faction")}>{quest.factions.map(faction => {
        const ready = !!quest.starts[faction] && isPlayable(questContent, faction);
        const art = rarest(Object.values(questContent.cards).filter(card => card.factions?.includes(faction)).map(card => card.id))[0];
        return <button key={faction} className="setup-deck quest-stripe" disabled={!ready || poor} style={{ ['--tint' as string]: factionInfo[faction]?.color }} onClick={() => start(quest, faction)}>
          <span className="setup-deck-art" style={art ? { backgroundImage: `url(/cards/${art.id}/data.png)` } : undefined}/>
          <span className="setup-deck-text"><b>{factionInfo[faction]?.name ?? faction}</b><small>{!ready ? msg("Not playable yet") : poor ? msg("Not enough crowns") : msg("Set out for {v0} crowns", { v0: questRules.entryCrowns })}</small></span>
        </button>;
      })}</div>
    </> : <p className="quest-notice">{msg("No quest can be offered yet: the map needs start sites for a faction with enough cards.")}</p>}
    <p className="quest-wallet">{msg("Your crowns")} <CrownAmount amount={collection.crowns}/></p>
  </div>;
}
