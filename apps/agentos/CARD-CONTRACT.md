# Fleet Manager Cockpit — AgentCard Contract (#14605)

The single citable contract for what an agent card renders, from which wire fields, under which render rules. Consumers: the AgentCard implementation (`#14598` — its spec suite maps 1:1 to the conformance checklist below), the detail header (`#14608`), and every surface that renders a resident at card grain. The card belongs to the **fleet-manager module of this one harness app** (operator veto on `#14577`: FM is a module of `apps/agentos`, never a sibling app). Sources of authority: the design SSOT ([`fleet-manager-cockpit-plan.html`](./design/fleet-manager-cockpit-plan.html), `#14512`) · the cockpit DTO ([`src/ai/fleet/fleetCockpitStatus.mjs`](../../src/ai/fleet/fleetCockpitStatus.mjs), merged) · ADR 0032 ([`learn/agentos/decisions/0032-institution-cockpit-render-model.md`](../../learn/agentos/decisions/0032-institution-cockpit-render-model.md), Accepted) · ADR 0029 §2.6 (cards are **layout-blind**: ordinary component lifecycle + config updates only; no layout-event consumption).

## Field table

| Card element (SSOT anatomy) | DTO source (`rows[n]`) | Render rule (authority) | Degrade rule |
|---|---|---|---|
| **Family rail** (left border) | `family` — the identity-roots join at the Brain-side assembler (`resolveIdentityDisplay`, #14802; migration-safe: the `#11318` era swap re-points the resolver, zero Body diff) | **episode attribute, data-driven** — a family switch re-renders the rail in place, SAME resident (ADR 0032 §2.3.3); token `--fm-family-*` | no identity root → `family: null` → neutral rail + `unclassified` badge, never blank, never guessed |
| **State dot (+ pulse)** | `lifecycle.state` + `sources.runtime.state/confidence` | encodes SESSION state only, never identity (§2.3.1); pulse only when live AND motion allowed; token `--fm-state-*` | `not-wired`/`confidence: none` → `--fm-state-off` + the not-wired marker — **placeholder never renders as fact** (the DTO's own discipline) |
| **Display name** | `displayName` (fallback chain `displayName → name → githubUsername → id`, the DTO's order) | **mutable display state over the durable id** (§2.3.2) — a rename re-renders in place, no re-key; provenance/assent slot reserved for the naming-layer data | null → `id` rendered in mono (never empty) |
| **Engine tag** (mock: "opus-4.8" / "fable-5") | `engineTag` — via the #14802 assembler join, **currently `null` for all rows**: engine is session/era metadata (§2.3.7) and no truthful flat source exists (a durable identity literal publishes baseline as current and goes stale on any unmanaged engine boost — the July-2026 Fable-week rotations are the reflexive falsifier). Truth arrives with the `#11318` era layer / a managed `modelAssignment` projection; the resolver is the one re-point site | **session/era metadata, never identity** (§2.3.7) — a tag change never re-keys the card; the June→July swap is the reflexive fixture | `engineTag: null` → tag hidden (metadata is optional; identity is not) |
| **State line** (mock: "▲ WORKING") | `lifecycle.state` (+ `confidence`) | mono, state-colored; renders the DTO's literal state vocabulary | `not-wired` renders as `NOT WIRED` — honest, not invented |
| **Current-lane line** | activity capability (`capabilities.activity`) once `#14572/#14573` wire it | freshness-labeled per the ledger discipline (`observedAt`-class fields when the adapters emit them; stale renders AS stale) | capability `not-wired` → the lane line renders the not-wired reason, dimmed |
| **Open-lane count badge** (beside the lane line) | `openLaneCount` — **roster-DTO-owned end-to-end** (assembler passthrough → `mapRosterRow` → record → badge), tri-state like `launchable`: the Brain-side `resolveOpenLaneCounts` enricher stamps the count — each resident's OPEN assigned-issue count from the local synced issues corpus — and a resident the corpus cannot resolve carries `null` | renders ONLY on a reported positive integer (`N lanes` / `1 lane` pill, mono, token-only); a count change re-renders in place, no re-key; the density evidence (7–17 open lanes per active agent) is the badge's reason to exist | `null` (not stamped) OR `0` (nothing open — the state axis already reads free) → **NO badge**: unknown never poses as zero, zero is not badge value; the first authoritative load REPLACES any sample-seed count with this live truth |
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
