# Architecture

The browser renders server truth. It never shuffles, validates betting, ranks hands,
constructs pots, awards Squids, or calculates settlement.

```text
Browser UI
  ├─ HTTPS → Next.js route handlers → PokerEngine → SquidEngine
  │                                  ↓
  │                            Supabase Postgres
  └─ Supabase Realtime Broadcast/Presence (public state hints only)
```

Critical updates use an idempotent `actionId` and compare-and-swap on
`room_runtime_state.state_version`. Private hole cards live in
`hand_private_cards`, which has RLS enabled and no browser-readable policy.

Infrastructure boundaries are represented by `GameStateRepository`,
`RealtimeTransport`, and `PresenceProvider`, so hosting can move without changing
the domain engines.
