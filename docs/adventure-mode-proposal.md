# Adventure mode: proposal to replace quest mode

Date: 30 October 2026  
Status: Proposal with the decisions below agreed; implementation and content authoring remain to follow.

## Purpose

Replace the open-world expedition with contained, replayable faction adventures. Each adventure has a clear beginning, a narrative arc, three interconnected routes and a final battle. The player starts with a predefined deck and develops it during the adventure.

The appeal is discovering a build, making route and story choices, and overcoming a particular conflict in Varhyr. Narrative events give the encounters context; random encounters and deck rewards make another playthrough different.

This is the proposed successor to [the expedition design](quests.md) and its [companion design document](quest-mode-design.md). [Implementation notes](quest-mode-implementation.md) describe systems available for reuse. Those documents contain historical decisions and do not define the new adventure structure. This proposal does not mean the replacement is already implemented.

## Agreed direction and working targets

| Area                   | Direction                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Structure              | One starting point and one final battle, connected by three routes with cross-connections.                        |
| Map                    | A readable route graph over a diffuse, atmospheric background.                                                    |
| Content                | Defined narrative events mixed with random encounters.                                                            |
| Narrative budget       | Approximately 10 authored events per adventure.                                                                   |
| Location budget        | Approximately 30 locations across the complete adventure map.                                                     |
| Starting deck          | Predefined for the adventure; developed through rewards and upgrades along the way.                               |
| Narrative presentation | An image with restrained motion, or a short animated scene, with text over it.                                    |
| Foundations            | One adventure for each of the eight factions. Neutral remains available as supporting card and encounter content. |
| Expansions             | New releases can introduce further adventures involving existing or new factions.                                 |

Exact location counts, route lengths, battle counts and the placement of narrative events are defined by each adventure or its procedural generation rules. Around 30 map locations and 10 authored narrative events are content targets, not universal fixed counts. A playthrough follows its chosen path and can leave other locations and scenes unvisited.

The complete route graph and each node's type are visible from the start. The specific encounter, narrative content, choices and offers at a node are discovered on visiting it.

Entry is free, adventures are replayable, and permanent rewards are boosters collected through narrative scenes. Shops are included. There is no end-of-run card purchasing. The first adventure is the Bright Marches: **Bosci's struggle to unite the Marches**.

## Player experience

1. Choose an adventure and see its premise, faction, starting deck and advertised rewards.
2. Start with its predefined deck and opening narrative event.
3. Choose a route and advance through connected locations.
4. Resolve battles, narrative decisions, booster rewards, shops and deck-improvement opportunities.
5. Cross to another route where the map allows it, responding to the deck and resources developed so far.
6. Reach the final confrontation. Defeating it completes the adventure; defeat ends the run.
7. View a concise run summary. Boosters already collected through narrative scenes remain in the account.

Returning to the menu suspends the run. Entry is free and there is no expiry. A new run can be started after a completed or lost adventure. There is no separate stock of adventure lives: the first lost match ends the run.

## Route map

Each adventure defines its route structure directly, through seeded procedural generation, or through a combination of fixed narrative milestones and generated connecting locations. Its rules determine the exact positions and counts. The three routes should offer different opportunities and pressures, with forward connections that allow the player to change course. A route choice should not lock the player into an entire predetermined sequence at the start.

Recommended traversal rules for the first version:

- The player advances along available connections. Progress is forward, without loops or farming visited locations.
- Routes can split and rejoin, and all viable routes eventually lead to the final battle.
- Choosing a branch leaves some locations unvisited in that run.
- Required story milestones occur at shared points or have equivalent route-specific versions. Optional scenes can remain exclusive to a route.
- The entire route and its connections are visible from the start. Every node shows its type, such as battle, narrative event or shop, while its exact contents remain undisclosed until visited.

The background establishes the adventure's place and mood. Positions on the screen describe progression rather than physical travel distance. Terrain masks, territorial borders and geographical node placement are unnecessary for this structure.

The existing world art could serve as an adventure-selection backdrop or be reused where suitable. Reusing it should not constrain the route layout.

## Narrative events

Each adventure has its own conflict, cast and conclusion. The authored events establish the premise, develop that conflict and make the final battle feel earned. The faction's adventure can feature allies and enemies from other factions where the lore supports it.

Events can be shared milestones, route-specific scenes or consequences of an earlier decision. Choices should affect the run when appropriate: recruiting a card, exchanging a card, changing a later encounter, receiving a resource or earning an advantage for a battle. Some scenes can simply tell the story; a branching choice is not required on every screen.

### Presentation

- One principal illustration, with a slow pan, zoom, restrained parallax or shift as the default treatment.
- An optional short video loop or animated frame using the same layout. Animation is not required for every event.
- Stationary text over a shaded or visually quiet part of the artwork. Moving the image must not move the text or controls.
- An explicit Continue button or clearly presented choices. Reading is never timed.
- The established bronze UI and typography, with enough room for both English and German text.
- Existing motion and sound preferences apply. A still frame must remain a complete presentation when motion is disabled.

Text can be divided into a few short beats when necessary. An interruption must restore the current event and committed choices without repeating their rewards.

## Random encounters and locations

The adventure definition and its generation rules supply the structure. Ordinary encounter locations draw from pools appropriate to that adventure and its stage. Their definitions can include enemy decks, run-deck reward choices and optional encounter conditions. Node types are established when the map is created so the player can plan a route from the outset.

Candidate location types are:

| Type             | Role                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| Battle           | A themed opponent and an opportunity to improve the run deck.         |
| Elite battle     | Greater risk with a stronger advertised reward.                       |
| Narrative event  | An authored scene, optionally with choices and consequences.          |
| Shop             | Buy improvements for the temporary adventure deck.                    |
| Deck improvement | Card choices, exchanges or other explicitly defined upgrades.         |
| Final battle     | The adventure's conclusion, influenced by relevant earlier decisions. |

Shops are part of the mode. Their purchases improve the temporary run deck; they do not buy permanent collection cards. The exact mix of battles, shops, narrative events and deck-improvement locations is defined per adventure or by its generation rules. The old city/village service system is not required.

An encounter's random selection is saved before it can affect player decisions. Reloading must not reroll its contents, rewards or outcome. Generation and reward choices should be reproducible from the run state and seed.

## Deck development and combat

Each adventure supplies a predefined starter deck. There is no opening draft or choice of starting-deck variants in the initial design. Adventure deck definitions should be independent of competitive starter lists so balance changes can be intentional.

During the run, the player improves that deck through meaningful choices. New cards and card exchanges are the simplest initial upgrades. Card removal, temporary card enhancements and adventure-wide powers are additional options to evaluate, rather than assumptions required for the first version.

The deck and its changes belong to the run. The player's permanent collection does not determine the starting deck's strength. Account rewards are handled separately.

Use the current combat rules and turn planner. An adventure can specify an enemy deck and starting conditions. Later encounters may add visible special rules or scripted effects where they justify their implementation cost. Any exception must be presented clearly to the player.

Difficulty should follow the adventure's stages and encounter tiers, with the final battle as a known destination. Avoid automatically canceling every deck improvement by increasing enemy strength by the same amount. Difficulty options and encounter tuning remain open.

Each battle uses normal player life and starts with the standard match life total. There is no persistent adventure health pool, extra-life counter or recovery economy between fights. Play continues until the player loses a match or wins the final battle. A match loss ends the run; replaying means starting a new run rather than retrying that encounter within the same run.

Existing deck legality remains the default. Any adventure-specific exception to minimum size, copy limits or card modifications needs an explicit rule; the proposal does not silently change those constraints.

## Rewards and collection

Separate rewards that improve the current run from rewards added to the permanent account. The player should be able to understand which kind a reward is before making a choice.

Permanent adventure rewards are boosters granted by defined narrative scenes. A scene specifies its reward and the point at which it is collected, including any choice or condition required. A final narrative scene can award boosters after the concluding battle, using the same mechanism as other scenes.

Entry is free and adventures are replayable. Booster rewards can be collected again in a new run. Within one run, each narrative reward is paid only once; returning to a scene, resuming or reloading cannot duplicate it. Collected boosters remain earned if the player later loses a match.

Battles can grant temporary deck improvements and shop resources. Permanent adventure payouts go through narrative scenes rather than the ordinary practice-match reward flow. There is no separate automatic defeat, retirement or completion payout outside those defined scenes.

There is no end-of-run card purchase screen and no option to buy the final run deck into the collection. Temporary deck changes end with the run. Shops remain an in-run service; their currency, earnings and prices are tuning decisions. Silver can be reused as the run currency, but its old end-of-run purchasing role is removed.

## Content and authoring

Foundations targets eight adventures. The approximate content budget is 80 narrative events and 240 map locations, with exact counts and generated content defined per adventure. Locations can reference shared encounter pools and presentation components; this does not require 240 unique battle scripts or illustrations.

The first adventure follows **Bosci's struggle to unite the Bright Marches**. Its narrative should connect the faction's divisions, rivalries and alliance-building to the player's encounters and deck development. The detailed scenes, choices, final opponent and outcome remain authored content; this proposal does not settle them in advance.

Each adventure definition should contain:

- Stable identity, revision, faction and set association, plus its premise and selection artwork.
- Its predefined starter deck, start node, final battle and route graph or procedural graph-generation rules.
- Narrative event references, localized text, artwork and optional animated media.
- Encounter pools and difficulty stages for random locations.
- Choices, conditions and consequences, including any flags used by later scenes or battles.
- Temporary run rewards, shop definitions and the booster rewards attached to narrative scenes.

The authoring tools should validate references, deck legality, graph reachability and paths to the final battle. Required story conditions must not make an otherwise valid route impossible to finish.

The architecture should keep adventure definitions and run-state transitions independent of React, rendering and browser storage. Presentation and persistence use those shared definitions and decisions, consistent with a browser/server-capable engine.

## Persistence and replacement of the current mode

Save the adventure ID and revision, seed, complete generated or authored route graph, visible node types, current location, visited route, resolved random encounters, story flags and choices, run deck, applicable resources, pending narrative rewards and completion state. A saved run resumes without rerolling its map or offers, repeating consequences or paying rewards twice. Fight recovery must distinguish an interrupted session from a completed defeat.

Reuse general systems where they fit: combat, the bot worker, card presentation, collection rewards and save/resume infrastructure. The old quest implementation is removed entirely. Its run-state types, geographical travel, rumor destinations, settlement purchase flow and compatibility machinery do not need to be retained.

The global exploration map, generated geographical locations, territory projection, rumor-created destinations and indefinite retirement loop are replaced by the adventure graph and its final confrontation.

No migration of existing quest saves or unfinished purchase settlements is required. Obsolete quest-specific saved state can be discarded or ignored; it must not gate entry into adventures. Remove the old mode's entry points, implementation and dedicated tooling/assets where they are no longer used. Ordinary account collection data remains independent of obsolete quest runs.

## First implementation milestone

Build the Bright Marches adventure about Bosci's struggle to unite the Marches before producing the other seven:

1. Adventure selection, predefined starter deck and a valid three-route graph, with all connections and node types visible from the start.
2. Narrative presentation with still artwork, motion settings, text and choices.
3. Random battles, card improvements and shops using existing combat, with one match loss ending the run.
4. A final battle, victory/defeat summary and booster collection through narrative scenes.
5. Reliable suspension, resumption and once-only consequences and rewards.
6. An authoring workflow that can produce the next adventure without new screen code.

Use that complete adventure to test pacing and replayability before committing to the full content budget. A successful slice should make route changes and deck choices matter, carry narrative consequences into later locations, and reach a satisfying conclusion.

## Decisions still to resolve

- Adventure-specific location counts, battle counts and narrative placement, plus the initial procedural generation rules where used.
- The final map orientation/layout and cross-connection density; visibility of routes and node types is already decided.
- The actual predefined Bright Marches starter deck and encounter difficulty tuning.
- The initial upgrade vocabulary: additions, exchanges, removals, card enhancements and/or powers.
- Shop currency, earnings, inventory and prices.
- Booster amounts, booster products and their narrative collection points or conditions.
- Adventure unlock requirements, if any; entry remains free and adventures replayable.
- Bosci's detailed narrative outline, scenes, choices and final confrontation, supplied as authored content.
