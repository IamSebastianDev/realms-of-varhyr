import { CollectionStats } from "../../../collection/components/CollectionStats";
import { DeckBuilder } from "../../../decks/components/DeckBuilder";
import { Packs } from "../../../boosters/components/Packs";
import { ProfilePage } from "../../../profile/components/ProfilePage";
import { SettingsPage } from "../../../settings/components/SettingsPage";
import { StartPage } from "../StartPage";
import { Store } from "../../../store/components/Store";
import { t as msg } from "@realms/ui/i18n";
import { readRun } from "../../../quest/stores/questStore";

import { CollectionBrowser } from "./CollectionBrowser";
import { useLobbyContext } from "../../LobbyContext.tsx";

export function ScreenBody() {
  const {
    add,
    builderGuard,
    buyBooster,
    buyMissingCards,
    canResume,
    change,
    collection,
    collectionMessage,
    collectionSaved,
    deleteDraft,
    deleteSaved,
    draft,
    inspect,
    isHome,
    load,
    message,
    navigate,
    openBooster,
    openSetup,
    ownedCopies,
    past,
    props,
    remove,
    renameSaved,
    save,
    screen,
    setup,
    undo,
  } = useLobbyContext();
  return (
    <>
      {isHome ? (
        <StartPage
          inert={setup !== null}
          collection={collection}
          canResume={canResume}
          resumeLabel={props.resumeLabel}
          play={() => openSetup("practice")}
          draft={() => openSetup("draft")}
          resume={() => navigate("match")}
          newQuest={() => {
            const run = readRun();
            if (run) navigate("quest");
            else openSetup("quest");
          }}
        />
      ) : screen === "profile" ? (
        <ProfilePage />
      ) : screen === "packs" ? (
        <Packs
          collection={collection}
          reduced={props.reduced}
          open={openBooster}
          goToStore={() => navigate("store")}
        />
      ) : screen === "settings" ? (
        <SettingsPage learn={props.learn} watch={props.startSession} />
      ) : screen === "store" ? (
        <Store
          collection={collection}
          saved={collectionSaved}
          message={msg(collectionMessage)}
          reduced={props.reduced}
          buy={buyBooster}
        />
      ) : screen === "stats" ? (
        <CollectionStats collection={collection} inspect={inspect} back={() => navigate("cards")} />
      ) : screen === "builder" ? (
        <DeckBuilder
          guardRef={builderGuard}
          openCollection={() => navigate("cards")}
          draft={draft}
          decks={props.decks}
          ownedCopies={ownedCopies}
          crowns={collection.crowns}
          message={msg(message)}
          canUndo={!!past.length}
          reduced={props.reduced}
          change={change}
          add={add}
          remove={remove}
          load={load}
          save={save}
          renameDeck={renameSaved}
          deleteSaved={deleteSaved}
          removeDeck={deleteDraft}
          undo={undo}
          buyMissing={buyMissingCards}
          inspect={inspect}
        />
      ) : (
        <CollectionBrowser />
      )}
    </>
  );
}
