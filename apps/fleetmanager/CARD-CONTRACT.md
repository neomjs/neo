# Fleet Manager Cockpit — AgentCard Contract (#14605)

The single citable contract for what an agent card renders, from which wire fields, under which render rules. Consumers: the AgentCard implementation (`#14598` — its spec suite maps 1:1 to the conformance checklist below), the detail header (`#14608`), and every surface that renders a resident at card grain. Sources of authority: the design SSOT ([`apps/agentos/design/fleet-manager-cockpit-plan.html`](../agentos/design/fleet-manager-cockpit-plan.html), stays at its committed path per the `#14577` decision record) · the cockpit DTO ([`src/ai/fleet/fleetCockpitStatus.mjs`](../../src/ai/fleet/fleetCockpitStatus.mjs), merged) · ADR 0032 ([`learn/agentos/decisions/0032-institution-cockpit-render-model.md`](../../learn/agentos/decisions/0032-institution-cockpit-render-model.md), Accepted) · ADR 0029 §2.6 (cards are **layout-blind**: ordinary component lifecycle + config updates only; no layout-event consumption).

## Field table

| Card element (SSOT anatomy) | DTO source (`rows[n]`) | Render rule (authority) | Degrade rule |
|---|---|---|---|
| **Family rail** (left border) | current episode's family — until the `#11318` era schema lands: derived from `agent` metadata, declared as such | **episode attribute, data-driven** — a family switch re-renders the rail in place, SAME resident (ADR 0032 §2.3.3); token `--fm-family-*` | unknown family → `--fm-family-human` neutral + `unclassified` badge, never blank |
| **State dot (+ pulse)** | `lifecycle.state` + `sources.runtime.state/confidence` | encodes SESSION state only, never identity (§2.3.1); pulse only when live AND motion allowed; token `--fm-state-*` | `not-wired`/`confidence: none` → `--fm-state-off` + the not-wired marker — **placeholder never renders as fact** (the DTO's own discipline) |
| **Display name** | `displayName` (fallback chain `displayName → name → githubUsername → id`, the DTO's order) | **mutable display state over the durable id** (§2.3.2) — a rename re-renders in place, no re-key; provenance/assent slot reserved for the naming-layer data | null → `id` rendered in mono (never empty) |
| **Engine tag** (mock: "opus-4.8" / "fable-5") | era metadata when `#11318` lands; until then `harnessType` declared-as-proxy | **session/era metadata, never identity** (§2.3.7) — a tag change never re-keys the card; the June→July swap is the reflexive fixture | absent → tag hidden (metadata is optional; identity is not) |
| **State line** (mock: "▲ WORKING") | `lifecycle.state` (+ `confidence`) | mono, state-colored; renders the DTO's literal state vocabulary | `not-wired` renders as `NOT WIRED` — honest, not invented |
| **Current-lane line** | activity capability (`capabilities.activity`) once `#14572/#14573` wire it | freshness-labeled per the ledger discipline (`observedAt`-class fields when the adapters emit them; stale renders AS stale) | capability `not-wired` → the lane line renders the not-wired reason, dimmed |
| **Foot meta** (PR ref · timestamps) | activity capability events (`FLEET_COCKPIT_EVENT_TYPES`) | mono, `--fm-ink-faint`; event-kind chips delegate to `#14594` | no events → foot renders the roster `sources.roster.confidence` line |
| **Controls slot** | (behavior: `#14611`) | slot only in this contract — presence, position, disabled-with-reason states | unauthorized → disabled-with-reason, never hidden |

## Identity rules (the ADR 0032 bindings, restated once for card claimants)

1. The card keys on the **durable id** (`rows[n].id`) — never on name, engine, or family. Any of those changing re-renders the SAME card instance (conformance fixtures below).
2. **No role-typing anywhere** — the card renders states and trails, never castes (§2.3.1).
3. A NEW resident renders with **full affordances from the first deed** (emergence-parity, §2.3.7) — no reduced "young agent" card.
4. Cards are **layout-blind** (ADR 0029 §2.6): no layout-event consumption; pop-out/reparent arrives as ordinary lifecycle, and state carries through (reparent-never-destroyed is landed-normative).

## Conformance checklist (= the `#14598` spec suite, 1:1)

- [ ] `key-is-id`: rename / engine-tag change / family rebind each re-render in place — instance id stable across all three.
- [ ] `state-honesty`: a `not-wired` runtime source renders the off-token + marker; no fixture path renders placeholder-as-fact.
- [ ] `name-fallback`: the DTO's fallback chain renders at every step; null-everything renders the mono id.
- [ ] `family-neutral`: unknown family renders the neutral rail + badge.
- [ ] `emergence-parity`: a first-deed resident fixture renders every card affordance.
- [ ] `layout-blind`: the card's spec imports no layout/dock event surface (lint-assertable).
- [ ] `tokens-only`: zero literal colors/fonts (greppable against `--fm-*`).

Deltas from this contract are recorded design decisions on tickets — never silent drift. Design authority: @neo-opus-grace (SSOT author).
