import { useEffect, useState } from "react";
import { Heart, Layers, LogOut, Map as MapIcon, Play, Skull, X } from "lucide-react";
import { factionInfo } from "@realms/content";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { defaultDeckId } from "@realms/content";
import {
  act as engineAct,
  allNodes,
  finishFight,
  leave as engineLeave,
  retire,
  skipOffer,
  takeCard,
  templateOf,
  travel,
  type Action,
  type MapNode,
  type RunState,
} from "@realms/quest";
import { SilverIcon } from "../../../components/Crowns";
import { updateCollection } from "../../collection/stores/collectionStore";
import { applyPayouts } from "../lib/rewards";
import { Avatar } from "../../../components/Avatar";
import { useProfile } from "../../profile/stores/profile";
import { CardBackFace } from "../../card-backs/components/CardBackFace";
import { useStandardBack } from "../../card-backs/stores/cardBackStore";
import { getProfile } from "../../profile/stores/profile";
import { startMatch, type MatchSetup } from "../../match/lib/session";
import type { CustomDeck } from "../../decks/lib/decks";
import { MapView } from "./MapView";
import {
  DeckView,
  DraftPage,
  Hearts,
  LocationDialog,
  OfferView,
  roleInfo,
  type Sublist,
} from "./Dialogs";
import { QuestRewards } from "./QuestRewards";
import { describeResult, type ActionResult } from "../lib/results";
import {
  clearFightReport,
  loadMap,
  questContent,
  readRun,
  readFightReport,
  saveRun,
  useQuestRun,
  type LoadedMap,
} from "../stores/questStore";
import "../styles/quest.css";

type Props = {
  reduced: boolean;
  /** Back to the main menu; the run stays saved. */ leave: () => void;
  /** A match is open in the background and can be returned to. */ liveMatch: boolean;
  resume: () => void;
  beginFight: (setup: MatchSetup) => void;
};

const placeName = (map: LoadedMap, id: string, extra: readonly MapNode[] = []) => {
  const node = allNodes(map, extra).find((entry) => entry.id === id);
  return node?.name || (node?.site ? roleInfo[node.site].name : "the stronghold");
};

/** The quest board, the draft, the map, and the end of the run: one screen that follows the saved run. */
export function QuestPage(props: Props) {
  useLanguage();
  const run = useQuestRun();
  const [map, setMap] = useState<LoadedMap | null | undefined>(undefined);
  useEffect(() => {
    void loadMap().then(setMap);
  }, []);

  // Apply a reported fight when the screen opens. Leaving the match screen mid-fight leaves the fight waiting on the map.
  useEffect(() => {
    if (!map) return;
    const current = readRun();
    if (!current || current.stage === "over" || !current.fight) return;
    const report = readFightReport(current);
    if (!report) return;
    const next = finishFight(current, questContent, map, { won: report.won, life: report.life });
    if (saveRun(next)) clearFightReport(report);
  }, [map, run?.fight]);

  // Boss and quest payouts go to the account once each; the collection keeps a receipt per payout.
  useEffect(() => {
    if (!run?.earned.length) return;
    try {
      updateCollection((current) => applyPayouts(current, run), { requireSave: true });
    } catch {
      /* Tried again the next time the run changes. */
    }
  }, [run?.earned.length, run?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [deck, setDeck] = useState(false),
    [confirmQuit, setConfirmQuit] = useState(false);
  const active = !!map && !!run && run.stage !== "over";
  const body =
    run?.stage === "over" ? (
      <QuestRewards key={run.id} run={run} reduced={props.reduced} leave={props.leave} />
    ) : map === undefined ? (
      <main className="quest-page quest-message">
        <p>{msg("Loading the map…")}</p>
      </main>
    ) : !map ? (
      <main className="quest-page quest-message">
        <div>
          <h1>{msg("Quests")}</h1>
          <p>
            {msg(
              "The quest map has not been made yet. Place the nodes in the card studio's Map tab, save, and restart the dev server.",
            )}
          </p>
        </div>
      </main>
    ) : !run ? (
      <Leave leave={props.leave} />
    ) : (
      <RunScreen {...props} run={run} map={map} openDeck={() => setDeck(true)} />
    );
  const profile = useProfile(),
    sleeve = useStandardBack();
  const drafting =
    (!!run && run.stage === "draft") ||
    (run?.offer?.kind === "pick" && run.offer.source === "draft");
  const [menu, setMenu] = useState(false);
  const overlays = (
    <>
      {deck && run && <DeckView run={run} reduced={props.reduced} close={() => setDeck(false)} />}
      {menu && run && (
        <div className="modal-backdrop" onClick={() => setMenu(false)}>
          <section
            className="choice-dialog match-menu-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={msg("Menu")}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{msg("Menu")}</h2>
            <div className="match-menu">
              <button
                className="outline-button full"
                onClick={() => {
                  setMenu(false);
                  setDeck(true);
                }}
              >
                <Layers size={15} />
                {msg("Your deck")}
              </button>
              <button className="outline-button full" onClick={props.leave}>
                <LogOut size={15} />
                {msg("Main menu")}
              </button>
              <button
                className="outline-button full danger"
                onClick={() => {
                  setMenu(false);
                  setConfirmQuit(true);
                }}
              >
                <X size={15} />
                {msg("Retire")}
              </button>
            </div>
          </section>
        </div>
      )}
      {confirmQuit && run && (
        <div className="modal-backdrop" onClick={() => setConfirmQuit(false)}>
          <section
            className="choice-dialog"
            role="alertdialog"
            aria-label={msg("Retire")}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{msg("Retire from the expedition?")}</h2>
            <p>
              {msg(
                "The expedition ends. You can spend your remaining silver to keep cards before leaving.",
              )}
            </p>
            <div className="quest-actions">
              <button
                className="outline-button danger"
                onClick={() => {
                  setConfirmQuit(false);
                  saveRun(retire(run));
                }}
              >
                {msg("Retire")}
              </button>
              <button className="outline-button" onClick={() => setConfirmQuit(false)}>
                {msg("Keep going")}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );

  if (run?.stage === "over")
    return (
      <div className={`app quest-app quest-reward-mode ${props.reduced ? "reduce-motion" : ""}`}>
        <div className="quest-stage">{body}</div>
      </div>
    );

  // The map is the whole screen. The quest log sits top left, you bottom left, the menu top right.
  // The draft is a full screen of its own, like the faction draft: no side column, its own back button.
  if (
    active &&
    run &&
    map &&
    drafting &&
    run.offer?.kind === "pick" &&
    run.offer.source === "draft" &&
    !run.fight
  )
    return <div className={`quest-draft-mode ${props.reduced ? "reduce-motion" : ""}`}>{body}</div>;

  if (active && run && map && !drafting) {
    const nodes = new Map(allNodes(map, run.extra).map((node) => [node.id, node]));
    const reward = (quest: RunState["quests"][number]) =>
      [
        quest.reward.packs ? msg("{v0} boosters", { v0: quest.reward.packs }) : "",
        quest.reward.silver ? msg("{v0} silver", { v0: quest.reward.silver }) : "",
      ]
        .filter(Boolean)
        .join(" · ");
    return (
      <div
        className={`quest-app quest-map-mode ${props.reduced ? "reduce-motion" : ""} ${run.offer && !run.fight ? "has-offer" : ""}`}
      >
        <div className="quest-stage">{body}</div>
        <section className="quest-info quest-log" aria-label={msg("Quest log")}>
          <small>{msg("Quest log")}</small>
          {run.quests.length ? (
            run.quests.map((quest) => (
              <div
                key={quest.id}
                className={`quest-log-item ${quest.status === "done" ? "done" : ""}`}
              >
                <strong>{msg(templateOf(quest.template).title)}</strong>
                <span>
                  {msg("At {v0}", {
                    v0: msg(nodes.get(quest.destination)?.name || "a marked place"),
                  })}{" "}
                  · {reward(quest)}
                </span>
              </div>
            ))
          ) : (
            <div className="quest-log-item">
              <span>{msg("No tasks yet. Ask for rumors in a city or village.")}</span>
            </div>
          )}
        </section>
        <section className="quest-me" aria-label={msg("You")}>
          <div className="quest-info quest-id">
            <div className="portrait">
              <div className="avatar has-art">
                <Avatar id={profile.avatar} />
              </div>
              <div className="life-counter">
                <Heart size={11} aria-hidden="true" />
                <strong>{run.life}</strong>
                <small>{msg("LIFE")}</small>
              </div>
            </div>
            <div className="player-name">
              <h2>{profile.name}</h2>
            </div>
          </div>
          <div className="quest-info quest-pile">
            <button
              className="quest-deck"
              onClick={() => setDeck(true)}
              title={msg("Your deck")}
              aria-label={msg("Your deck")}
            >
              <CardBackFace id={sleeve} />
              <strong>{run.deck.length}</strong>
            </button>
            <span className="quest-crowns" title={msg("Silver carried on this expedition")}>
              <SilverIcon tilt />
              <b>{run.silver}</b>
            </span>
          </div>
        </section>
        <button className="outline-button quest-menu-button" onClick={() => setMenu(true)}>
          {msg("Menu")}
        </button>
        {overlays}
      </div>
    );
  }

  return (
    <div className={`app quest-app ${props.reduced ? "reduce-motion" : ""}`}>
      <div className="world-bg" />
      <div className="world-vignette" />
      <div className="quest-stage">{body}</div>
      {overlays}
    </div>
  );
}

/** There is no quest overview page: with no run, the quest screen has nothing to show and returns to the menu. */
function Leave({ leave }: { leave: () => void }) {
  useEffect(() => {
    leave();
  }, []);
  return null;
} // eslint-disable-line react-hooks/exhaustive-deps

function RunScreen({
  run,
  map,
  reduced,
  leave,
  liveMatch,
  resume,
  beginFight,
  openDeck,
}: Props & { run: RunState; map: LoadedMap; openDeck: () => void }) {
  useLanguage();
  const [walk, setWalk] = useState<{ from: string; to: string; next: RunState } | null>(null);
  const [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [offering, setOffering] = useState<Sublist>(null),
    [result, setResult] = useState<ActionResult | null>(null);
  const node: MapNode | undefined = run.encounter
    ? allNodes(map, run.extra).find((entry) => entry.id === run.encounter!.node)
    : undefined;
  const foe =
    run.risen && !run.visited.includes(run.risen)
      ? allNodes(map, run.extra).find((entry) => entry.id === run.risen)
      : undefined;
  const rumor = foe
    ? msg("A new foe rises. Rumors of a great enemy {v0}", {
        v0: foe.name
          ? msg("at {v0}", { v0: foe.name })
          : msg("in the lands of {v0}", {
              v0:
                foe.affiliation === "neutral"
                  ? msg("the open road")
                  : msg(factionInfo[foe.affiliation]?.name ?? foe.affiliation),
            }),
      })
    : "";
  const commit = (next: RunState, before: RunState = run) => {
    const parts = [
      next.life !== before.life &&
        msg("{v0} life", { v0: `${next.life > before.life ? "+" : ""}${next.life - before.life}` }),
      next.silver !== before.silver &&
        msg("{v0} silver", {
          v0: `${next.silver > before.silver ? "+" : ""}${next.silver - before.silver}`,
        }),
    ].filter(Boolean);
    setNotice(parts.join(" · "));
    setError("");
    saveRun(next);
  };
  const attempt = (work: () => RunState) => {
    try {
      commit(work());
    } catch (cause) {
      setError(cause instanceof Error ? msg(cause.message) : String(cause));
    }
  };

  function launch(next: RunState) {
    const fight = next.fight!;
    const customDeck: CustomDeck = {
      id: `custom-quest-${next.id}`,
      name: msg("Quest deck"),
      cards: next.deck,
    };
    const opponent = {
      id: `quest-enemy-${fight.node}`,
      name: msg(fight.enemy.name),
      cards: fight.enemy.deck,
    };
    const profile = getProfile();
    const initial = startMatch(
      fight.seed,
      defaultDeckId,
      false,
      customDeck,
      undefined,
      opponent,
      profile.name,
      profile.avatar,
    );
    initial.players.p1.life = next.life;
    initial.players.p2.life = fight.enemy.life;
    beginFight({
      initial,
      mode: "practice",
      deck: defaultDeckId,
      skirmish: false,
      customDeck,
      opponentDeck: opponent,
      rewardEligible: false,
      quest: { run: next.id, node: fight.node },
    });
  }
  function doAction(action: Action) {
    try {
      const next = engineAct(run, questContent, map, action);
      commit(next);
      setResult(describeResult(run, next, action));
      if (next.fight) launch(next);
    } catch (cause) {
      setError(cause instanceof Error ? msg(cause.message) : String(cause));
    }
  }
  if (run.offer?.kind === "pick" && run.offer.source === "draft" && !run.fight)
    return (
      <DraftPage
        run={run}
        reduced={reduced}
        take={(id) => attempt(() => takeCard(run, questContent, map, id))}
        leave={leave}
        giveUp={() => saveRun(retire(run))}
      />
    );
  return (
    <main className="quest-page quest-run" aria-label={msg("Quest map")}>
      <MapView
        map={map}
        run={run}
        focusKey={run.id}
        reduced={reduced}
        walk={walk}
        onArrived={() => {
          if (walk) {
            saveRun(walk.next);
            setWalk(null);
          }
        }}
        onNode={(id) => {
          if (run.fight || walk) return;
          if (run.encounter?.node === id) return;
          setNotice("");
          setError("");
          setResult(null);
          try {
            const next = travel(run, map, id);
            setWalk({ from: run.position, to: id, next });
          } catch (cause) {
            if (run.visited.includes(id)) saveRun(engineLeave(run, map));
            else setError(cause instanceof Error ? cause.message : "");
          }
        }}
      />
      {rumor && !run.fight && (
        <p className="quest-rising" role="status">
          <Skull size={14} />
          {rumor}
        </p>
      )}
      {run.fight && (
        <div className="modal-backdrop">
          <section className="choice-dialog">
            <h2>{msg("{v0} is waiting", { v0: run.fight.enemy.name })}</h2>
            <p>
              {liveMatch
                ? msg("Your fight is still under way.")
                : msg("The fight has to be finished.")}
            </p>
            <div className="quest-actions">
              {liveMatch ? (
                <button className="gold-button" onClick={resume}>
                  <Play size={15} />
                  {msg("Return to the fight")}
                </button>
              ) : (
                <button className="gold-button" onClick={() => launch(run)}>
                  <Skull size={15} />
                  {msg("Start the fight")}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {!run.fight && node && !run.offer && (
        <LocationDialog
          run={run}
          node={node}
          notice={notice}
          error={error}
          act={doAction}
          leave={() => {
            setOffering(null);
            setResult(null);
            saveRun(engineLeave(run, map));
            setNotice("");
          }}
          result={result?.node === node.id ? result : null}
          dismiss={() => setResult(null)}
          openOffer={() => {}}
          offering={offering}
          setOffering={setOffering}
        />
      )}
      {run.offer && !run.fight && !(run.offer.kind === "pick" && run.offer.source === "draft") && (
        <OfferView
          run={run}
          reduced={reduced}
          showDeck={openDeck}
          take={(id) => attempt(() => takeCard(run, questContent, map, id))}
          skip={() => commit(skipOffer(run))}
          buy={(index) => attempt(() => engineAct(run, questContent, map, { type: "buy", index }))}
          accept={(rumor) =>
            attempt(() => engineAct(run, questContent, map, { type: "accept", rumor }))
          }
          close={() => commit(skipOffer(run))}
        />
      )}
      {!run.offer && !node && (
        <p className="quest-hint-line">
          <MapIcon size={14} />
          {msg("Tap a place on the map to travel there.")}
        </p>
      )}
    </main>
  );
}
