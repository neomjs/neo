# Fleet Manager Cockpit — Design Token Reference (#14578)

The token vocabulary every cockpit view leaf consumes — the design floor of the **fleet-manager module inside this one harness app** (operator veto recorded on `#14577`: FM is a module of `apps/agentos`, never a sibling app). **Source of truth for the values:** the design SSOT [`fleet-manager-cockpit-plan.html`](./design/fleet-manager-cockpit-plan.html) (committed via `#14512`). Any delta from the SSOT is a recorded design decision on a ticket — never silent drift.

| Token group | Tokens | Role | Example consumer | Binding rule |
|---|---|---|---|---|
| Surfaces | `--fm-ground` · `--fm-panel` · `--fm-panel-2` · `--fm-rail` | page ground, card/panel fills, stream + edge rails | shell zones (`#14615`), cards (`#14598`), rails (`#14617`) | static |
| Lines | `--fm-line` · `--fm-line-soft` | zone borders vs in-panel separators | shell, cards, stream rows | static |
| Ink tiers | `--fm-ink` · `--fm-ink-dim` · `--fm-ink-faint` | primary / secondary / meta text | `--fm-ink` / `--fm-ink-dim`: every view leaf. **`--fm-ink-faint`: no live consumer** — declared in both skins and specified for foot meta by [CARD-CONTRACT.md](./CARD-CONTRACT.md), but zero `resources/scss/src/` sites | static; measured per usage class below |
| Signal | `--fm-signal` | live/key-action accent — used sparingly | chrome title, live badge, lane-line emphasis | static; sparing use is a design rule, lint-greppable by count |
| Session states | `--fm-state-ok/idle/wedged/limited/off` + the transitional `--fm-state-starting/stopping` (`#14978`) | agent SESSION state — never identity (ADR 0032 §2.3.1); `starting`/`stopping` are the in-flight transitional states while a lifecycle intent is pending | state dots + health bar (`#14593`, `#14599`) | resolved states bound from the runtime-status wire (`#14595`); the transitional pair is a first-party fact from `pendingAction`, not the runtime wire. Palette tuning tracked on `#14805` |
| Family rails | `--fm-family-claude/gpt/gemini/human` | the resident's CURRENT episode family (ADR 0032 §2.3.3) | card rail (`#14598`), legend | **data-driven from the era key — never a per-agent constant; a family switch re-renders in place, same resident** |
| Event kinds | `--fm-kind-pr/a2a/review/alert/neutral` | event CATEGORY — a SEPARATE axis from session state (kind = *what happened*, state = *agent health*); hues kept clear of the state health-hues so they never blur where they co-occur | event chips in the activity stream (`#14606`) + agent detail (`#14608`) | resolved via the kind registry (`#14639`); unknown kind → `--fm-kind-neutral` |
| Type stacks | `--fm-font-mono` · `--fm-font-sans` | meta/labels vs body | all leaves | static |

## Contrast (WCAG 2.1, measured — `#14619`)

Measured, not assumed: relative luminance per WCAG 2.1 over the two skins' literal values. Threshold is set by **usage class**, so it is argued from this table's Role column, never from the token's name — `--fm-ink-faint` carries meta *text* (4.5), a state dot is a non-text indicator (3.0). Re-measure when a value moves; a delta here is a design decision on a ticket, same rule as the values themselves.

Ratios vs each surface, **dark** / **light**:

| Foreground | AA | vs `ground` | vs `panel` | vs `panel-2` | vs `rail` |
|---|---|---|---|---|---|
| `--fm-ink` | 4.5 | 14.03 / 13.75 | 12.68 / 15.04 | 11.74 / 14.26 | 13.53 / 12.80 |
| `--fm-ink-dim` | 4.5 | 6.53 / 4.99 | 5.90 / 5.46 | 5.46 / 5.17 | 6.29 / 4.64 |
| `--fm-ink-faint` | 4.5 | **3.27 / 2.83** ❌ | **2.96 / 3.10** ❌ | **2.74 / 2.94** ❌ | **3.15 / 2.64** ❌ |
| `--fm-signal` | 3.0 | 13.07 / 5.01 | 11.81 / 5.47 | 10.94 / 5.19 | 12.60 / 4.66 |
| `--fm-state-off` | 3.0 | 3.32 / **2.77** ❌ | 3.00 / 3.03 ⚠️ | **2.78 / 2.87** ❌ | 3.20 / **2.58** ❌ |
| `--fm-state-*` (others) | 3.0 | ✅ all pass — dark 6.98–10.65, light 4.27–6.50 (lowest: `stopping` 4.05 vs light `rail`) |
| `--fm-family-*` | 3.0 | ✅ all pass — dark 6.19–12.66, light 4.03–7.23 |
| `--fm-kind-*` | 3.0 | ✅ all pass — dark 6.43–9.17, light 4.56–6.98 |

**Two open failures, both awaiting a design ruling (design authority: `@neo-opus-grace`) — recorded here rather than silently fixed, per the delta rule:**

1. **`--fm-ink-faint` fails 4.5:1 on every surface in both skins** (2.64–3.27). **Latent, not shipped** — no live consumer today (see the table above). It becomes real the moment a leaf honours `CARD-CONTRACT.md`'s foot-meta specification, which would ship a ~2.7:1 timestamp.
2. **`--fm-state-off` fails 3:1 on four shipped surfaces.** **Live**: `StateDot.scss` binds `&.fm-state-off { --fm-dot: var(--fm-state-off) }`, and `stateToken()` degrades **every unknown state** to `off` — so this token is both the off-indicator and the unknown-state fallback. Dark `panel` sits exactly on the line (3.00).

## Motion

The SSOT's live pulse (`@keyframes pulse`, 2.4s) is **decoration, not information** — the dot's color carries the signal. Consumers gate it behind `prefers-reduced-motion: no-preference` exactly as the SSOT does; the reduced-motion path renders the identical static dot.

**Audit result (`#14619`): the reduced-motion claim holds — and the mechanism that makes it hold is a WCAG 1.4.1 (Use of Color, Level A) failure.** The pulse genuinely carries no unique signal, so reduced-motion users lose nothing. It achieves that by putting the **entire** signal on colour: `StateDot` renders no text, `title`, or `aria-label`, and its card neighbour is a drill button whose accessible name is the resident's *name*, not its state — so `ok / idle / wedged / limited / starting / stopping / off` reach the operator by **hue alone**, which 1.4.1 forbids as a sole visual carrier. **The two constraints are in tension: re-loading signal onto motion would break the reduced-motion property.** A resolution needs a third channel (shape, glyph, or text) and is design-material — tracked for design ruling, not fixable as a token delta.

## Adding a token

A new token = a design decision: name it in the group table above, cite the ticket that decided it, and keep the SSOT-verbatim rule for anything the artifact already defines. The visual-regression baselines (`#14618`) are the mechanical guard; a baseline change is reviewed as a design change.
