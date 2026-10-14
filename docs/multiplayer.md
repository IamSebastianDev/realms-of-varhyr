# WebRTC multiplayer POC

Open **Online**, choose an owned, legal deck and a name. **Host game** creates an eight-character room code; the other player enters it and chooses **Join game**. The host is player one and goes first. Both browsers must run the same rules and card content. Serve the same frontend build to both players; for separate devices, use a shared site URL rather than each device's own localhost.

PeerJS 1.5.5 uses its free PeerServer Cloud for room-code signaling. The game uses a reliable WebRTC data channel, with PeerJS's default STUN/TURN configuration. No game server is required. The PeerJS library loads only when hosting or joining, and no connection is opened while browsing the other menus.

## Authority and privacy

`packages/multiplayer/src/authority.ts` runs the existing deterministic engine in the host browser. It validates both deck compositions and all moves. The sender's seat comes from its authenticated connection, never from a client-supplied actor field. The guest joins once with an opaque token; reconnecting requires the same token, so knowing a used room code does not give a different guest access to the saved seat.

The host sends `PlayerView` projections to each browser. The guest receives its own hand, choices and legal actions, plus the public battlefield, discard piles, library/hand counts and filtered events. It never receives the host's hidden hand, actual library IDs, shuffle seed, RNG state, command log or full authoritative state. Combat forecasts are computed at the host after attack declaration. Both players see the same lane arrows and confirmed combat preview.

The host necessarily holds both players' authoritative private data. This is a trusted-friends POC, not a cheat-proof service. Collections and ownership are checked locally at deck selection; the host verifies composition legality. There is no account backend verifying ownership or rewards.

## Commands and recovery

Each action has a UUID and expected wire revision. Repeated action IDs are deduplicated, including retries after a dropped connection. Reusing an ID for a different move is rejected. Stale revisions receive the current player projection with an error, without applying the move. The guest waits for acknowledgement before sending another action. PeerJS's binary serializer chunks growing views/event logs; its JSON serializer's approximately 16 KB frame limit is unsuitable for longer matches.

Channel undo uses the same shared implementation as local play. Wire revisions increase even when undo rewinds the engine's replay log. This avoids accepting an old packet just because the internal engine revision happened to return to the same number.

WebRTC connection-state changes pause input on a lost link. Silence alone does not disconnect a match, because background tabs throttle timers. Reconnect preserves the board, hand, turn, choices and match ID. A guest can reload their tab, reopen Online, and join the same code: the seat token is retained in that tab's session storage. A new tab has a new identity and cannot take the existing seat.

**Keep the host tab open.** Host refresh/closure loses its in-memory authority; host recovery and match persistence are future work. Leaving does not award a forfeit win. Each player uses their own local collection; a win grants the existing 25 Crowns and one Realm's Bounty booster once per match.

## Configuration

The defaults need no environment variables. These optional Vite variables configure a different signaling service or ICE servers:

| Variable | Purpose |
| --- | --- |
| `VITE_PEER_HOST` | Your PeerServer hostname |
| `VITE_PEER_PORT` | Signaling port, default 443 |
| `VITE_PEER_PATH` | Signaling path, default `/` |
| `VITE_PEER_SECURE` | `false` only for a local non-TLS server |
| `VITE_RTC_ICE_SERVERS` | JSON array of `RTCIceServer` objects, replacing PeerJS's defaults |

Vite client variables are public. A future authenticated TURN service should issue short-lived client credentials rather than embed private server keys in the frontend. Changing this configuration requires restarting the development server or rebuilding the static site.

## Code boundaries

The authority and wire protocol contain no browser APIs or React and are included in `npm run check:engine`. `RtcRoom.ts` adapts PeerJS connections; `MultiplayerLobby.tsx` handles Host/Join; the existing battlefield consumes the network projection. The presentation adapter creates count placeholders for hidden libraries only for public board helpers. It is never used to execute guest-side engine commands or replay simulations.

Automated checks exercise privacy, command validation, connection-bound actors, incompatible versions/decks, stale revisions, duplicate retries, monotonic undo and three complete serialized matches. Browser checks exercise actual PeerJS signaling/WebRTC, both mulligans, deployment, channel/undo, lane combat and the defensive death window, plus reconnect and guest reload recovery.
