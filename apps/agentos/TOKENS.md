# Fleet Manager Cockpit — Design Token Reference (#14578)

The token vocabulary every cockpit view leaf consumes — the design floor of the **fleet-manager module inside this one harness app** (operator veto recorded on `#14577`: FM is a module of `apps/agentos`, never a sibling app). **Source of truth for the values:** the design SSOT [`fleet-manager-cockpit-plan.html`](./design/fleet-manager-cockpit-plan.html) (committed via `#14512`). Any delta from the SSOT is a recorded design decision on a ticket — never silent drift.

| Token group | Tokens | Role | Example consumer | Binding rule |
|---|---|---|---|---|
| Surfaces | `--fm-ground` · `--fm-panel` · `--fm-panel-2` · `--fm-rail` | page ground, card/panel fills, stream + edge rails | shell zones (`#14615`), cards (`#14598`), rails (`#14617`) | static |
| Lines | `--fm-line` · `--fm-line-soft` | zone borders vs in-panel separators | shell, cards, stream rows | static |
| Ink tiers | `--fm-ink` · `--fm-ink-dim` · `--fm-ink-faint` | primary / secondary text; **`--fm-ink-faint` is non-text only** | `--fm-ink` / `--fm-ink-dim`: every view leaf. **`--fm-ink-faint`: zero text consumers, and mechanically forbidden from filling text** — it fails 4.5:1 on every surface in BOTH skins, so it is legal as a surface/border value only. The prose "no live consumer" tripwire proved insufficient: after an earlier pass cleaned eight text sites, four new ones re-adopted it unnoticed (`AgentDetail` ×3, `OperatorComposeForm` ×1) and shipped sub-floor text until the re-baseline audit caught it. `check-theme-surfaces` check 4 now rejects it in a `color:` declaration, so recurrence fails the build instead of a reader | static; measured per usage class below |
| Signal | `--fm-signal` | live/key-action accent — used sparingly | chrome title, live badge, lane-line emphasis | static; sparing use is a design rule, lint-greppable by count |
| Session states | `--fm-state-ok/idle/wedged/limited/off` + the transitional `--fm-state-starting/stopping` (`#14978`) | agent SESSION state — never identity (ADR 0032 §2.3.1); `starting`/`stopping` are the in-flight transitional states while a lifecycle intent is pending | state dots + health bar (`#14593`, `#14599`) | resolved states bound from the runtime-status wire (`#14595`); the transitional pair is a first-party fact from `pendingAction`, not the runtime wire. Palette tuning tracked on `#14805` |
| Family rails | `--fm-family-claude/gpt/gemini/human` | the resident's CURRENT episode family (ADR 0032 §2.3.3) | card rail (`#14598`), legend | **data-driven from the era key — never a per-agent constant; a family switch re-renders in place, same resident** |
| Event kinds | `--fm-kind-pr/a2a/review/alert/neutral` | event CATEGORY — a SEPARATE axis from session state (kind = *what happened*, state = *agent health*); hues kept clear of the state health-hues so they never blur where they co-occur | event chips in the activity stream (`#14606`) + agent detail (`#14608`) | resolved via the kind registry (`#14639`); unknown kind → `--fm-kind-neutral` |
| Type stacks | `--fm-font-mono` · `--fm-font-sans` | meta/labels vs body | all leaves | static |

## Contrast (WCAG 2.1, measured — `#14619`)

Measured, not assumed: relative luminance per WCAG 2.1 over the two skins' literal values. Threshold is set by **usage class**, so it is argued from this table's Role column, never from the token's name — `--fm-ink-dim` carries meta *text* (4.5), a state dot is a non-text indicator (3.0), and a purely decorative fill carries no threshold at all (`--fm-ink-faint`, below — which is exactly why its class had to be decided rather than inferred from the word "ink"). Re-measure when a value moves; a delta here is a design decision on a ticket, same rule as the values themselves.

Ratios vs each surface, **dark** / **light**:

| Foreground | AA | vs `ground` | vs `panel` | vs `panel-2` | vs `rail` |
|---|---|---|---|---|---|
| `--fm-ink` | 4.5 | 14.03 / 13.75 | 12.68 / 15.04 | 11.74 / 14.26 | 13.53 / 12.80 |
| `--fm-ink-dim` | 4.5 | 6.53 / 4.99 | 5.90 / 5.46 | 5.46 / 5.17 | 6.29 / 4.64 |
| `--fm-ink-faint` | n/a — decorative | 3.27 / 2.83 | 2.96 / 3.10 | 2.74 / 2.94 | 3.15 / 2.64 |
| `--fm-signal` | 3.0 | 13.07 / 5.01 | 11.81 / 5.47 | 10.94 / 5.19 | 12.60 / 4.66 |
| `--fm-state-off` | 3.0 | 3.67 / 3.29 | 3.32 / 3.59 | 3.07 / 3.41 | 3.54 / 3.06 |
| `--fm-state-*` (others) | 3.0 | ✅ all pass — dark 6.98–10.65, light 4.27–6.50 (lowest: `stopping` 4.05 vs light `rail`) |
| `--fm-family-*` | 3.0 | ✅ all pass — dark 6.19–12.66, light 4.03–7.23 |
| `--fm-kind-*` | 3.0 | ✅ all pass — dark 6.43–9.17, light 4.56–6.98 |

**No open contrast failures.** Both are resolved; the rulings and their reasoning are recorded below rather than the fixes landing silently, per the delta rule.

**Resolved — `--fm-ink-faint` (D4).** It measures 2.64–3.27 across the eight surface/skin combinations, so it can never carry text (4.5) and cannot be relied on for information-bearing non-text either (3.0 — it clears that on only two of eight). Ruled **decorative, non-text only**: its four text consumers re-bound to `--fm-ink-dim`, the token keeps its contracted slot as a surface/border value, and — the part that matters — the contract became **mechanical**. A prose "no live consumer" tripwire had already failed once: an earlier pass cleaned eight text sites, and four new ones re-adopted the token unnoticed while `CARD-CONTRACT.md` was still prescribing it for foot meta. `check-theme-surfaces` check 4 now rejects it in a `color:` declaration, so the next recurrence fails the build instead of waiting on a reader. Because its usage class is now decorative, the row above carries no AA threshold — a ratio is recorded for reference, not as a gate.

**Resolved — `--fm-state-off` (D3).** It was failing the 3:1 non-text floor on five of eight surface/skin combinations while serving double duty: `StateDot.scss` binds `&.fm-state-off { --fm-dot: var(--fm-state-off) }`, and `stateToken()` degrades **every unknown state** to `off`, so the token is both the off-indicator and the unknown-state fallback — a floor failure there is a failure of the most-reached dot on the surface. Retuned per the ruling to the quietest **passing** value in each skin (lightness-only; hue/saturation preserved so it stays the quietest state, and each skin moves the minimum distance that clears the floor): dark `#5b6675` → `#616d7c`, light `#8b95a5` → `#7c889a`. Every surface now clears 3.0 with margin — see the table above.

## Motion

The SSOT's live pulse (`@keyframes pulse`, 2.4s) is **decoration, not information** — the dot's color carries the signal. Consumers gate it behind `prefers-reduced-motion: no-preference` exactly as the SSOT does; the reduced-motion path renders the identical static dot.

**Audit result (`#14619`): the reduced-motion claim holds — and the mechanism that makes it hold is a WCAG 1.4.1 (Use of Color, Level A) failure.** The pulse genuinely carries no unique signal, so reduced-motion users lose nothing. It achieves that by putting the **entire** signal on colour: `StateDot` renders no text, `title`, or `aria-label`, and its card neighbour is a drill button whose accessible name is the resident's *name*, not its state — so `ok / idle / wedged / limited / starting / stopping / off` reach the operator by **hue alone**, which 1.4.1 forbids as a sole visual carrier. **The two constraints are in tension: re-loading signal onto motion would break the reduced-motion property.** A resolution needs a third channel (shape, glyph, or text) and is design-material — tracked for design ruling, not fixable as a token delta.

## The §04 token contract (type · spacing · chip geometry · FM motion aliases)

The token appendix the design-bar section (SSOT §06) points at: four new groups, values included, binding rules stated. Values land in the theme twins (`theme-neo-{dark,light}/apps/agentos/Viewport.scss`) per the standing extraction rule; the light twin derives the same roles against its surfaces and is re-measured on landing. Semantics already landed elsewhere (state/kind color, ink tiers) are **consumed**, never re-minted here.

| Token group | Tokens + values | Binding rule |
|---|---|---|
| Type roles | `--fm-text-display` 14px/1.3 · 600 · sans · `--fm-text-body` 12px/1.45 · sans · `--fm-text-detail` 11px/1.4 · mono · `--fm-text-micro` 10px/1.3 · mono · `--fm-text-chrome` 11px/1 · .08em · uppercase · mono | A surface picks a role, never a pixel. Post-pass, `font-size` literals in fleet SCSS are a contract violation (greppable) — **with the disposition rule as its completeness half:** a literal outside the five roles migrates to the nearest role (ties to the smaller), and a shift of ≥1px instead becomes a recorded exception named in the file's SCSS header (the spacing ladder's exception shape) or a sub's recorded deliberate move. Ruled outright: 12.5px → body (0.5px), 10.5px → micro (0.5px), 9px → micro (deliberate 1px growth on the product's smallest text — nothing below 10px ships), 13px → body, 15px → display, 16px → the ergonomics slice's deliberate move. Roles map to the measured usage classes: display/body/detail/micro are all **text** → the 4.5:1 floor, so they bind `--fm-ink` or `--fm-ink-dim` only (never `--fm-ink-faint`, which stays decorative per the D4 ruling); `micro` is for short mono runs (chips, badges, timestamps), never prose |
| Spacing rhythm | `--fm-space-1` 4px · `--fm-space-2` 8px · `--fm-space-3` 12px · `--fm-space-4` 16px | Padding/gap literals outside the rhythm are recorded exceptions (today: the card's 16px left pad clearing the 4px family rail — kept, named in the card's SCSS header) |
| Chip geometry | `--fm-chip-mark-w` 3px · `--fm-chip-pad-y` 2px · `--fm-chip-pad-x` 8px · `--fm-chip-radius` 4px · `--fm-chip-gap` 8px | One local indirection per idiom (the `--fm-spine-mark` / `--fm-viewer-wake-mark` / `--fm-chip` pattern): a state/kind class rebinds ONE custom property; an unmatched class renders quiet, never a borrowed severity. The affordance class (`.fm-chip` selector) may keep 6px radius as its class distinction — recorded, not drift |
| FM motion aliases | `--fm-motion-panel` = `var(--motion-panel, 280ms)` · `--fm-motion-fast` = `var(--motion-fast, 120ms)` · `--fm-motion-pulse` 2400ms | Cockpit surfaces outside the `.neo-dashboard` scope read the motion-standards vocabulary directly — the dock tokens deliberately resolve nothing outside their scope (Container.scss); FM aliases point at the vocabulary, never at dock-scoped aliases. Duration/easing literals outside the token layer are a contract violation (the dock rule, extended); reduced-motion collapses panel/fast to 0ms at the token layer and omits the pulse entirely (inclusion-gate pattern) |

**Contrast duty for the new text roles.** The roles are size/leading/stack only — color still comes from the ink tier, so the measured table above governs. The one new exposure is `--fm-text-micro` at 10px: below the comfortable prose floor, which is exactly why its binding rule caps it at short mono runs on `--fm-ink` / `--fm-ink-dim` (both measured ≥4.6 against every surface in both skins). A new micro consumer on a different ink token re-measures first — same rule as every value here.

**Instant presentation is a rule, not a token (SSOT §06 ladder T5).** Human-facing times carry no token because there is no value to bind — the ladder is a *behaviour*: human text renders viewer-local through `Intl` via the one shared helper (`view/fleet/viewerTime.mjs`), the wire stays ISO-8601 UTC because receipts must be zone-free, the exact instant rides `title`, and the same-day/older switch is judged on the **viewer's** calendar rather than UTC's. Recorded here so the appendix and the bar do not disagree about what §06 covers: a surface needing a time imports the helper; a surface needing a new shape extends the helper and the T5 row, never its own local copy. Type-wise these strings are `--fm-text-micro` consumers (short mono runs — the timestamps named in that role's binding rule).

**What this contract deliberately does NOT define:** the dashboard THEME layer (dock-package tokens are #17242/#17244's concern — this appendix consumes, never defines, theme tokens) and any new state/kind color (the existing `--fm-state-*` / `--fm-kind-*` sets are closed; a new state is a design decision on its own ticket).

## Adding a token

A new token = a design decision: name it in the group table above, cite the ticket that decided it, and keep the SSOT-verbatim rule for anything the artifact already defines. The visual-regression baselines (`#14618`) are the mechanical guard; a baseline change is reviewed as a design change.
