# Fleet Manager Cockpit — Design Token Reference (#14578)

The token vocabulary every cockpit view leaf consumes — the design floor of the **fleet-manager module inside this one harness app** (operator veto recorded on `#14577`: FM is a module of `apps/agentos`, never a sibling app). **Source of truth for the values:** the design SSOT [`fleet-manager-cockpit-plan.html`](./design/fleet-manager-cockpit-plan.html) (committed via `#14512`). Any delta from the SSOT is a recorded design decision on a ticket — never silent drift.

| Token group | Tokens | Role | Example consumer | Binding rule |
|---|---|---|---|---|
| Surfaces | `--fm-ground` · `--fm-panel` · `--fm-panel-2` · `--fm-rail` | page ground, card/panel fills, stream + edge rails | shell zones (`#14615`), cards (`#14598`), rails (`#14617`) | static |
| Lines | `--fm-line` · `--fm-line-soft` | zone borders vs in-panel separators | shell, cards, stream rows | static |
| Ink tiers | `--fm-ink` · `--fm-ink-dim` · `--fm-ink-faint` | primary / secondary / meta text | every view leaf | static; contrast per usage class audited by `#14619` |
| Signal | `--fm-signal` | live/key-action accent — used sparingly | chrome title, live badge, lane-line emphasis | static; sparing use is a design rule, lint-greppable by count |
| Session states | `--fm-state-ok/idle/wedged/limited/off` | agent SESSION state — never identity (ADR 0032 §2.3.1) | state dots + health bar (`#14593`, `#14599`) | bound from the runtime-status wire (`#14595`) |
| Family rails | `--fm-family-claude/gpt/gemini/human` | the resident's CURRENT episode family (ADR 0032 §2.3.3) | card rail (`#14598`), legend | **data-driven from the era key — never a per-agent constant; a family switch re-renders in place, same resident** |
| Event kinds | `--fm-kind-pr/a2a/review/alert/neutral` | event CATEGORY — a SEPARATE axis from session state (kind = *what happened*, state = *agent health*); hues kept clear of the state health-hues so they never blur where they co-occur | event chips in the activity stream (`#14606`) + agent detail (`#14608`) | resolved via the kind registry (`#14639`); unknown kind → `--fm-kind-neutral` |
| Type stacks | `--fm-font-mono` · `--fm-font-sans` | meta/labels vs body | all leaves | static |

## Motion

The SSOT's live pulse (`@keyframes pulse`, 2.4s) is **decoration, not information** — the dot's color carries the signal. Consumers gate it behind `prefers-reduced-motion: no-preference` exactly as the SSOT does; the reduced-motion path renders the identical static dot. End-to-end audit: `#14619`.

## Adding a token

A new token = a design decision: name it in the group table above, cite the ticket that decided it, and keep the SSOT-verbatim rule for anything the artifact already defines. The visual-regression baselines (`#14618`) are the mechanical guard; a baseline change is reviewed as a design change.
