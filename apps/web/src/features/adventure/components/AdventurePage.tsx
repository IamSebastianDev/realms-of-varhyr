import { useEffect, useState } from "react";
import { Layers, LogOut, Play, X } from "lucide-react";
import { defaultDeckId, factionInfo } from "@realms/content";
import {
  act as engineAct,
  adventureRules,
  enemyOf,
  expandDeck,
  finishFight,
  giveUp,
  text,
  type Action,
  type Choice,
  type RunState,
} from "@realms/adventure";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { SilverIcon } from "../../../components/Crowns";
import { updateCollection } from "../../collection/stores/collectionStore";
import type { CustomDeck } from "../../decks/lib/decks";
import { startMatch, type MatchSetup } from "../../match/lib/session";
import { getProfile } from "../../profile/stores/profile";
import { applyPayouts } from "../lib/rewards";
import {
  adventureContent,
  adventureOf,
  clearFightReport,
  readFightReport,
  readRun,
  runIsCurrent,
  saveRun,
  useAdventureRun,
} from "../stores/adventureStore";
import { AdventureMap } from "./AdventureMap";
import { DeckView } from "./DeckView";
import { BattleIntro, EventScene, ImproveView, PickView, RecruitView, ShopView } from "./Scenes";
import { ArtCard } from "@realms/ui/CardPresentation";
import "../styles/adventure.css";

type Props = {
  reduced: boolean;
  /** Back to the main menu; the run stays saved. */ leave: () => void;
  /** A match is open in the background and can be returned to. */ liveMatch: boolean;
  resume: () => void;
  beginFight: (setup: MatchSetup) => void;
};

/** The adventure: its route map, the scene or offer open on the current place, and the end of the run. One screen that follows the saved run. */
export function AdventurePage(props: Props) {
  const language = useLanguage();
  const run = useAdventureRun();
  const def = run ? adventureOf(run.adventure) : undefined;
  const [deck, setDeck] = useState(false),
    [menu, setMenu] = useState(false),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState("");

  // Apply a reported fight when the screen opens. Leaving the match screen mid-fight leaves the fight waiting here.
  useEffect(() => {
    const current = readRun();
    const currentDef = current ? adventureOf(current.adventure) : undefined;
    if (!current || !currentDef || current.stage === "over" || !current.fight) return;
    const report = readFightReport(current);
    if (!report) return;
    const next = finishFight(current, currentDef, adventureContent, report.won);
    if (saveRun(next)) clearFightReport(report);
  }, [run?.fight]);

  // Boosters from scenes go to the account once each; the collection keeps a receipt per payout.
  useEffect(() => {
    if (!run || (!run.earned.length && !(run.stage === "over" && run.collected?.length))) return;
    try {
      updateCollection((current) => applyPayouts(current, run), { requireSave: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : msg("Could not save adventure rewards."));
    }
  }, [run?.earned.length, run?.id, run?.stage, run?.collected?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function launch(next: RunState) {
    const fight = next.fight!,
      adventure = adventureOf(next.adventure)!,
      enemy = enemyOf(adventure, fight.enemy)!;
    const customDeck: CustomDeck = {
      id: `custom-adventure-${next.id}`,
      name: msg("Adventure deck"),
      cards: next.deck,
    };
    const opponent = {
      id: `adventure-enemy-${enemy.id}`,
      name: text(enemy.name, language),
      cards: expandDeck(enemy.deck),
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
      false,
      adventureRules.minimumCards,
    );
    if (enemy.life) initial.players.p2.life = enemy.life;
    props.beginFight({
      initial,
      mode: "practice",
      deck: defaultDeckId,
      skirmish: false,
      customDeck,
      opponentDeck: opponent,
      rewardEligible: false,
      adventure: { run: next.id, node: fight.node },
    });
  }
  function doAction(action: Action) {
    if (!run || !def) return;
    try {
      const next = engineAct(run, def, adventureContent, action);
      saveRun(next);
      setError("");
      if (next.fight && !run.fight) launch(next);
    } catch (cause) {
      setError(cause instanceof Error ? msg(cause.message) : String(cause));
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className={`adv-app ${props.reduced ? "reduce-motion" : ""}`}>{children}</div>
  );
  if (!run)
    return shell(
      <main className="adv-page adv-message">
        <p>{msg("No adventure is under way.")}</p>
        <button className="outline-button" onClick={props.leave}>
          {msg("Main menu")}
        </button>
      </main>,
    );
  if (!def || !runIsCurrent(run))
    return shell(
      <main className="adv-page adv-message">
        <h1>{msg("This adventure has changed")}</h1>
        <p>
          {msg(
            "Your saved run belongs to an earlier version and cannot continue. Boosters you already collected are yours.",
          )}
        </p>
        <button className="gold-button" onClick={() => saveRun(null)}>
          {msg("Start fresh")}
        </button>
      </main>,
    );
  if (run.stage === "over")
    return shell(<Summary run={run} leave={props.leave} error={error} onError={setError} />);

  const view = run.view;
  const showDeck = () => setDeck(true);
  const choose = (choice: Choice) => doAction({ type: "choose", choice: choice.id });
  return shell(
    <main className="adv-page" aria-label={msg("Adventure map")}>
      <header className="adv-bar">
        <div className="adv-title">
          <h1>{text(def.name, language)}</h1>
          <span
            className="adv-faction"
            style={{ ["--tint" as string]: factionInfo[def.faction]?.color }}
          >
            {msg(factionInfo[def.faction]?.name ?? def.faction)}
          </span>
        </div>
        <span className="adv-purse" title={msg("Silver carried on this adventure")}>
          <SilverIcon tilt />
          <b>{run.silver}</b>
        </span>
        <button className="outline-button" onClick={showDeck}>
          <Layers size={15} />
          {run.deck.length}
        </button>
        <button className="outline-button" onClick={() => setMenu(true)}>
          {msg("Menu")}
        </button>
      </header>
      <AdventureMap
        def={def}
        run={run}
        reduced={props.reduced}
        active={!view && !run.fight && !deck && !menu && !confirm}
        travel={(node) => doAction({ type: "travel", node })}
      />
      {!view && !run.fight && <p className="adv-hint">{msg("Choose where to go next.")}</p>}
      {error && (
        <p className="adv-error" role="alert">
          {error}
        </p>
      )}
      {run.fight && (
        <div className="modal-backdrop">
          <section className="choice-dialog" role="dialog" aria-modal="true">
            <h2>
              {msg("{v0} is waiting", { v0: text(enemyOf(def, run.fight.enemy)?.name, language) })}
            </h2>
            <p>
              {props.liveMatch
                ? msg("Your fight is still under way.")
                : msg("The fight has to be finished.")}
            </p>
            <div className="adv-actions">
              {props.liveMatch ? (
                <button className="gold-button" onClick={props.resume}>
                  <Play size={15} />
                  {msg("Return to the fight")}
                </button>
              ) : (
                <button className="gold-button" onClick={() => launch(run)}>
                  {msg("Start the fight")}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {view && !run.fight && (
        <>
          {view.kind === "event" && (
            <EventScene
              def={def}
              run={run}
              view={view}
              next={() => doAction({ type: "continue" })}
              choose={choose}
            />
          )}
          {view.kind === "battle" && (
            <BattleIntro def={def} view={view} fight={() => doAction({ type: "fight" })} />
          )}
          {view.kind === "recruit" && (
            <RecruitView
              view={view}
              reduced={props.reduced}
              next={() => doAction({ type: "skip" })}
            />
          )}
          {(view.kind === "pick" || view.kind === "shop" || view.kind === "improve") && (
            <div className="adv-dialog-backdrop">
              {view.kind === "pick" && (
                <PickView
                  run={run}
                  view={view}
                  reduced={props.reduced}
                  take={(card) => doAction({ type: "take", card })}
                  skip={() => doAction({ type: "skip" })}
                  showDeck={showDeck}
                />
              )}
              {view.kind === "shop" && (
                <ShopView
                  def={def}
                  run={run}
                  view={view}
                  reduced={props.reduced}
                  buy={(card) => doAction({ type: "buy", card })}
                  leave={() => doAction({ type: "skip" })}
                  showDeck={showDeck}
                />
              )}
              {view.kind === "improve" && (
                <ImproveView
                  run={run}
                  view={view}
                  reduced={props.reduced}
                  minimum={adventureRules.minimumCards}
                  take={(card) => doAction({ type: "take", card })}
                  exchange={(out, card) => doAction({ type: "exchange", out, card })}
                  remove={(card) => doAction({ type: "remove", card })}
                  skip={() => doAction({ type: "skip" })}
                  showDeck={showDeck}
                />
              )}
            </div>
          )}
        </>
      )}
      {deck && <DeckView run={run} reduced={props.reduced} close={() => setDeck(false)} />}
      {menu && (
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
                  setConfirm(true);
                }}
              >
                <X size={15} />
                {msg("Give up")}
              </button>
            </div>
          </section>
        </div>
      )}
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(false)}>
          <section
            className="choice-dialog"
            role="alertdialog"
            aria-label={msg("Give up")}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{msg("Give up this adventure?")}</h2>
            <p>{msg("The run ends. Your discovered legendaries and earned boosters are kept.")}</p>
            <div className="adv-actions">
              <button
                className="outline-button danger"
                onClick={() => {
                  setConfirm(false);
                  saveRun(giveUp(run));
                }}
              >
                {msg("Give up")}
              </button>
              <button className="outline-button" onClick={() => setConfirm(false)}>
                {msg("Keep going")}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>,
  );
}

/** How the run ended. The deck belongs to the run; only the boosters collected along the way stay with the account. */
function Summary({
  run,
  leave,
  error,
  onError,
}: {
  run: RunState;
  leave: () => void;
  error: string;
  onError: (error: string) => void;
}) {
  const language = useLanguage();
  const def = adventureOf(run.adventure)!;
  const won = run.result === "won";
  const boosters = run.earned.reduce((sum, payout) => sum + payout.count, 0);
  return (
    <main
      className={`adv-page adv-summary ${won ? "won" : "lost"}`}
      aria-label={msg("Adventure summary")}
    >
      <h1>{won ? msg("Adventure complete") : msg("The adventure ends here")}</h1>
      <p className="adv-sub">{text(def.name, language)}</p>
      <dl>
        <div>
          <dt>{msg("Places visited")}</dt>
          <dd>{run.visited.length}</dd>
        </div>
        <div>
          <dt>{msg("Cards in your deck")}</dt>
          <dd>{run.deck.length}</dd>
        </div>
        <div>
          <dt>{msg("Boosters collected")}</dt>
          <dd>{boosters}</dd>
        </div>
      </dl>
      {!!run.collected?.length && (
        <>
          <h2>{msg("Legendaries discovered")}</h2>
          <p className="adv-sub">
            {error
              ? msg("Rewards could not be saved. Try again before leaving.")
              : msg("Added to your collection. Duplicates become crowns.")}
          </p>
          <div className="adv-summary-cards">
            {run.collected.map((id) => {
              const card = adventureContent.cards[id];
              return card ? (
                <div key={id}>
                  <ArtCard card={card} reduced />
                  <span>{msg(card.name)}</span>
                </div>
              ) : null;
            })}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="adv-summary-error">
          {error}
        </p>
      )}
      <div className="adv-actions">
        <button
          className="gold-button"
          onClick={() => {
            try {
              updateCollection((current) => applyPayouts(current, run), { requireSave: true });
              saveRun(null);
              leave();
            } catch (cause) {
              onError(
                cause instanceof Error ? cause.message : msg("Could not save adventure rewards."),
              );
            }
          }}
        >
          {msg("Main menu")}
        </button>
      </div>
    </main>
  );
}
