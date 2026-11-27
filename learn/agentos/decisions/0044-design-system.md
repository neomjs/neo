# ADR 0044: A design system every theme is written against

> Three kinds of names told apart by shape, bound in one direction: a rule reads a component variable, a component variable reads a role, a role reads the palette. Every theme defines the same palette and role names, so an override written once works on every theme. Light and dark are one theme. A sheet's cascade layer follows from its folder.

| Attribute | Value |
|---|---|
| **Status** | Accepted, 2026-11-27 (#22296). Graduated from [Discussion #22228](https://github.com/orgs/neomjs/discussions/22228) at body revision R3, at quorum: Claude ([Clio](https://github.com/neomjs/neo/discussions/22228#discussioncomment-19937021), author signal; [Grace](https://github.com/neomjs/neo/discussions/22228#discussioncomment-19937313), with the eight-point step-back), Gemini ([Julia](https://github.com/neomjs/neo/discussions/22228#discussioncomment-19937211), the independent approval, with the role audit), GPT ([Emmy](https://github.com/neomjs/neo/discussions/22228#discussioncomment-19937235), author signal). |
| **Author** | @neo-fable-clio (Clio, Claude Fable 5.2, Claude Code), design seat, from the #22228 record: the census and the three design cycles, Maryam's five-theme census, Julia's probes, measurements and role audit, Emmy's blind naming trial, Grace's step-back. |
| **Implemented by** | Epic #22295; groundwork in Epic #22280 |
| **Depends on** | `light-dark()` and cascade layers, Baseline widely available since 2026-11-13 and 2024-09-14. The theme build, `buildScripts/build/themes.mjs`. |
| **Connects to** | #18145 (theme files declare variables only: kept) · #18102 (engine value sheets at `:where()` weight: superseded by layers) · #22270 (`npm run theme-census`) · #22276 (the unconsumed token export, deleted) · [Discussion #22259](https://github.com/orgs/neomjs/discussions/22259) (touch and mobile components read the elevation, shape and motion roles) |
| **Anti-anchor for** | a colour ramp named by hue · a generated token source · an alias layer between roles and component variables · a product look called a theme · a source file that writes `@layer` |

## 1. Context

Themes moved from Sass to plain CSS in 14.0. What they are written against did not move. Measured with `npm run theme-census` on `dev` at `a22c1a96e9`; items 3 and 4 are from the censuses in the Discussion:

1. **Five themes, three structures.** The Neo pair carries a token skeleton from a 2023 Figma export: 90 `--sem-*` and 71 `--cmp-*` names. The classic pair and Cyberpunk have neither. 42 of the 90 and 34 of the 71 are read by nothing: a plausible name that changes nothing and reports nothing.
2. **A light and dark pair costs 481 decisions where 33 would do.** 843 component variables carry the same name in all four full themes; that is the system's real public surface. Between Neo Dark and Neo Light, 33 of 90 semantic values differ and 481 of 894 component values.
3. **One thing has several words.** A background is `background-color` in 158 names, `background` in 40 and `bg` in 24. The state word is last in 184 names and elsewhere in 44.
4. **Products bypass the token layers.** Workstation and Fleet override 171 and 150 component variables and not one `--sem-*` or `--cmp-*` name; 54 of those are the same variables, mapped onto about six product colours ([Maryam's census](https://github.com/neomjs/neo/discussions/22228#discussioncomment-19931695)).
5. **Colour ramps are named by hue** (`--purple-400`, `--gray-500`). When each theme carries its own colour names, an override cannot be written once for different base themes.

**The design criterion is a model's.** Asked to style a component, a model predicts a name; it does not browse. So a system is good when a name follows from a grammar and a few closed word lists, a decision is written once, and a wrong guess fails where someone sees it. [Emmy's blind trial](https://github.com/neomjs/neo/discussions/22228#discussioncomment-19935147) measured the limit of that: three fresh readers hit 4 of 21 names cold with today's names and 4 of 21 with the names below, and 20 and 21 of 21 after one short reference. The names therefore stand on structure, not on guessability, and the reference is a deliverable of this record.

**Constraints, set by the operator on 26 November.** Nobody outside the organization builds on the theme variables yet, so names change in one cut with no alias layer. Kept on purpose: structural rules in `src` beside theme variable files, themes that declare variables only, and nesting. A theme covers every widget in per-widget files and is never one file. What Workstation and Fleet override reaches only the widgets those apps use, so a product look is a palette of a theme, not a theme. `--cmp-*` goes. Core and semantic tokens stay, as CSS.

## 2. Decision

1. **Three name shapes, one direction.**

   | Shape | What it is | Who reads it |
   |---|---|---|
   | `--neo-palette-<slot>-<grade>` | raw material | only a theme's `Global.css` |
   | `--neo-<category>-<role>[-<state>]` | meaning | component variables |
   | `--<component>[-<variant>][-<part>]-<css-property>[-<state>]` | usage | structural rules |

   A rule reads component variables only. A component variable reads roles only. A role reads the palette or another role. No literal lives outside the palette. The property prefix `--neo-` marks what a theme owns; a name without it is a component's.

2. **The palette: slots by function, grades by lightness.** Seven slots: `neutral`, `accent`, `brand`, `danger`, `warning`, `success`, `info`. A slot is a function, never a hue, so every theme defines the same names with its own values. Eleven grades, and a grade has one OKLCH lightness in every slot:

   | Grade | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
   |---|---|---|---|---|---|---|---|---|---|---|---|
   | Lightness | 0.985 | 0.960 | 0.875 | 0.790 | 0.700 | 0.610 | 0.544 | 0.470 | 0.390 | 0.280 | 0.168 |

   Contrast then follows from the grade distance. Measured over all 49 slot pairs of theme Neo: two grades 600 or more apart never fall under 5.68:1, and 400 apart never under 3.12:1 ([the token file's measurements](https://github.com/neomjs/neo/discussions/22228#discussioncomment-19936253)). An author or a model applies that without a tool, and it holds for any palette that keeps the table. A theme without a second identity colour repeats `accent` in `brand`.

3. **Roles.** A category is one of a closed list: `color`, `space`, `control`, `font`, `line-height`, `letter-spacing`, `radius`, `border-width`, `focus-ring`, `opacity`, `elevation`, `duration`, `ease`.
   - **Colour roles are typed by their second word,** which is the property a component variable ends with: `…-background-color` binds to a `background` role, `…-color` to a `text` role, `…-border-color` to a `border` role. Three roles name an effect instead: `focus-ring`, `shadow`, `shadow-ring`.
   - **A role enters with its reader and leaves when it has none.** Theme Neo's list is 106 names: 42 colour roles, 63 scale and sizing roles, and `--neo-color-scheme`. The list and its values are the file `resources/css/theme-neo/Global.css`; this record does not repeat them.
   - **States are grades and layers, not mixes.** A solid fill steps one grade for hover and two for active. A neutral control's hover and active are translucent layers, so one value works on every surface. A role holds no `color-mix()`, so a script can measure every pair. Measured by the token file's contrast check: 35 text and border pairs meet their floor in both schemes (4.5:1 for text on its region, 3:1 for borders and the focus ring).
   - **Motion keeps today's vocabulary** under role names. Its reduced-motion collapse stays in `src`, after every theme layer, so no theme can undo it.
   - **Type is one variable per property, never a `font` shorthand:** the `revert` contract in `src/Global.css` needs it.

4. **Component variables.** The grammar is the one Button already follows (`--button-primary-glyph-color-hover`). Its words come from three closed sources: CSS property names (`background-color`, never `bg`), Neo's own config values and class names (`ui: 'primary'`, `.neo-button-primary`, `--button-primary-…`), and one state list, always last: `hover`, `active`, `focus`, `selected`, `pressed`, `disabled`, `invalid`, `readonly`. Two rules come from the browser checks of the naming trial:
   - **A generic component variable works on every variant.** A variant re-values the generic variable on its own element, inside the rules layer, so both `--button-background-color` set inline and `--button-primary-background-color` set on an ancestor take effect.
   - **The state word is last.**

   Every component variable is declared once, in `theme-base`, bound to roles. A theme keeps a per-widget file only where its design language deviates. One exception to "roles only": a component may mix a role with `transparent` for a translucent treatment of its own, as the desktop window's glass does. A second reader makes it a role.

5. **The tree under `resources/css`.**

   | Path | Holds |
   |---|---|
   | `src/<pkg>/<Cmp>.css` | rules; they read component variables only |
   | `theme-base/<pkg>/<Cmp>.css` | the component's variables, bound to roles, written once |
   | `theme-<name>/Global.css` | palette and roles, light and dark in one file |
   | `theme-<name>/<pkg>/<Cmp>.css` | only where this theme deviates |

   `theme-base` is a component's styling surface in one readable file, and its values stay visible to DevTools and to `get_computed_styles`. `src/Global.css` reads `--global-*` component variables like any structural file, so a classic theme nested in a Neo document can decline element typography without wiping a role for Neo descendants.

6. **Cascade layers, and who writes them.** The order, weakest first: `neo.roles`, `neo.base`, `neo.theme`, `neo.rules`. A sheet's layer follows from its folder (`Global.css` of a theme, `theme-base`, a theme's per-widget files, `src`), and the theme build writes it: one PostCSS plugin, called by `build/themes.mjs` and by `helpers/watchThemes.mjs`, wraps each sheet's syntax tree in its layer and starts every built sheet with the order statement. No source file writes `@layer`. The order then holds whichever sheet arrives first, a new file cannot forget its wrapper, and source maps keep their lines. A sheet with a relative `@import` keeps it at the top level with `layer(…)` or has it flattened, because an import inside a layer block is not fetched. This supersedes #18102's weight contract: load order and the mix of `:where()` and `:root .neo-theme-*` stop deciding who wins.

   Three kinds of sheet the engine does not author get their place from an inventory in the layer step, each with a proposal: an app's and an example's rules in a sibling layer after `neo.rules`, so an app's rule wins without `!important`; a vendor sheet in a layer before `neo.roles`, written in the vendor file itself where a `<link>` loads it from outside `resources/css`; rules inserted at runtime unlayered, so they win. `!important` inverts across layers, so each of the 321 `!important` lines under `resources/css/src` is kept as a named invariant or dropped because a layer orders it.

7. **Scopes: theme, scheme, density.** Three knobs on any container, all nestable.
   - **The class prefix `neo-theme-` is reserved.** `neo-theme-<name>` is a theme; `neo-theme-scope` is a scope that keeps its theme. The base selector is the one attribute selector `[class*="neo-theme-"]`, so `theme-base` resolves at every scope against that scope's roles and nesting works as it does today, without every theme repeating every variable.
   - **An inline role makes its own element a scope:** `component.Base` adds `neo-theme-scope` when a style key starts with `--neo-`. Measured at 1,000 scoped rows: a theme switch takes 0.8 ms at the median against 0.7 ms unscoped ([Julia's role audit](https://github.com/neomjs/neo/discussions/22228#discussioncomment-19937008)). Re-value a role on a container; one widget takes its component variable, which needs no scope.
   - **Light and dark are one theme.** A theme declares `--neo-color-scheme` per class, structure sets `color-scheme: var(--neo-color-scheme)` once on the base selector, and roles pick with `light-dark()`. A theme file stays variables-only, a pair cannot drift, and a nested dark island is a theme class on a container. The two class names stay. `light-dark()` takes colours only: elevation stays inside colours through a shadow colour and a ring colour, and a theme whose schemes differ in another kind of value needs a scheme class for it.
   - **Density** re-values the `control` family and nothing else.

8. **What a theme is.** A theme is a design language that covers every widget. A palette is a set of palette and role values on a scope: light, dark, a product. Workstation's and Fleet's looks become palettes; how a palette reaches a floating component and a second window is decided by the palette track, with one constraint recorded: a floating component stamps its own theme class and not an app's viewport class.

9. **The model-facing deliverable** is a short reference that says which hook to set, where, and for which variant, with the first guesses of the naming trial as its search terms (`primary` finds `accent`, `focus-color` finds `--neo-color-focus-ring`). A read-only manifest generated from the CSS feeds Docs, the Knowledge Base and Neural Link.

10. **Invariants, each with its guard.** A guard that does not exist yet names the migration step (§4) that brings it.
    - **I1. One direction.** `check-theme-var-references` exists and fails a fallback-free read of an undeclared variable in a theme file. Step 2 widens it: `src` reads resolve against `theme-base`, role reads against each theme's `Global.css`.
    - **I2. A theme file declares variables only** (#18145). `check-theme-value-files`, which exists.
    - **I3. No source file writes `@layer`.** The build plugin is the only writer, and a check fails a source file that writes one (step 2).
    - **I4. Two reserved prefixes.** A class with `neo-theme-` is a theme class or `neo-theme-scope` (a guard in step 2). A property with `--neo-` is a palette name, a role or `--neo-color-scheme` (a guard in step 4, with the rename).
    - **I5. Every theme defines every role name.** That is what makes an override portable. I1's widened guard fails a role a theme does not define (step 2).
    - **I6. A role has a reader.** The census gains a row for roles without one (step 2).
    - **I7. What a theme is comes from one map.** The theme build writes, for each theme class, the folders whose `Global.css` declares it into `resources/theme-map.json`. The loader, `setCssVariable`, the census, the guards and `create-theme` read it; none globs `theme-*` or strips a prefix (step 2).

## 3. Rejected Options

- **Keep the layers and document their override contracts.** `--cmp-*` has no product override and 34 of its 71 names have no reader.
- **Roles in the theme, hooks read through fallbacks in `src`** (the design seat's own first proposal). It hides a component's variables from every inspector and moves values into `src`.
- **Bind the base on each component's root.** It breaks an ancestor's override of a component variable ([Julia's probe](https://github.com/neomjs/neo/discussions/22228#discussioncomment-19934711)).
- **`[style*="--neo-"]` as a scope selector.** It turns an element that only reads a role into a scope, which clobbers an ancestor's component variable, and it costs 3.5 to 6.1 times the style recalculation ([her measurement](https://github.com/neomjs/neo/discussions/22228#discussioncomment-19935717)).
- **Derive every state with `color-mix()`.** No script could then measure a pair without a browser. Kept in part: the translucent layers of a neutral control.
- **Generate the CSS from a token source,** DTCG included. CSS is the source; the one export Neo had was consumed by nothing. A design tool or a canvas target that cannot read a custom property reopens it.
- **Source files that write their own `@layer`.** The same decision written in 600 files, a guard to keep them right, and an order that depends on which sheet loads first.
- **An alias layer for old names.** No outside consumer exists to protect.

## 4. Migration

1. **Groundwork** (#22280): every variable a structural rule reads resolves, and no structural rule paints a colour a theme cannot reach.
2. **Seams:** the layer plugin with its inventory, the map and its readers, the guards, the reserved class prefix, and `color-scheme` set once. That last one is a paint change in the dark themes (native scrollbars, form controls, embedded frames), so it ships with frame pairs.
3. **`--cmp-*` goes,** with paint shown unchanged by resolved values, and **a computed-style equality run** is built: per component, theme and state, every painted property resolves to the same value before and after a change.
4. **The rename, one scripted pull request, before any package moves.** It unifies the words of the component variables, moves the state word last, and gives the 129 names that carry `--neo-` today without being roles their component names, in CSS, in JavaScript string and template literals, in tests and in guides. Its gate is the equality run. The script and the map ship in the pull request and re-run on rebase; the other repositories follow with one pull request each.
5. **Theme Neo gets its `Global.css`** in `theme-neo`. The old tokens stay beside it while packages move.
6. **`theme-base`, one pull request per package:** bind to roles, delete the two per-theme copies, show a light and dark frame pair. Each is revertable by itself. `WorkstationPaletteBridgeNL` stays green throughout.
7. **The scope class,** after the guard on the property prefix holds.
8. **The old tokens and the two Neo folders go** when the census reports no read.
9. **The short reference and its manifest,** with the discovery trial on two model families.
10. **The classic pair and Cyberpunk,** each as a full theme on the same roles. Then the palette track, and a Material pair.

## 5. Consequences

- **Gained.** A light and dark pair costs the `light-dark()` roles instead of 481 component values. An override written against a role works on every theme. Four pairs that are weak on `dev` today pass: a selected list item's text on its tint (3.98 to 13.11), accent text on the dark canvas (4.48 to 7.05), brand green as text on the light canvas (1.37 to 6.19), placeholder text in a light field (about 3.69 to 5.00).
- **Paid.**
  - Every component variable name can change once, in one cut. The rename map is part of the release notes.
  - Pixels move where today's literals collapse into roles, and the light neutral loses its green tint for the cool one both schemes share. The operator read today's grays beside the proposed ones on 27 November: "the new version looks better". Each package pull request shows its pair.
  - A first cascade layer changes what unlayered CSS and `!important` do. The inventory in step 2 prices it.
  - `theme-base` re-declares every loaded component variable at every scope. Measured: within 0.7 ms of today's theme switch on Portal, Workstation and the order review desk ([Julia's measurement](https://github.com/neomjs/neo/discussions/22228#discussioncomment-19935717)).
- **Left out until a reader exists:** solid status fills and their on-colours, a strong border, a serif family, and a categorical scale. Series bars and syntax colours bind to existing roles on purpose (emerald and additions to `success`, amber to `warning`, violet to `accent`, deletions and keywords to `danger`, numbers and strings to `info`, tags to `brand`, comments to `text-muted`); a theme that wants its own sets those component variables.
- **Open, with an owner:** the scrim's value, on a frame pair of a modal over a filled page in both schemes (design seat). Whether a fresh reader finds the reference unaided, on two model families (the reference's leaf). Where a product palette lives and how it travels (the palette track).
- **Revalidation triggers.** A component whose variables cannot bind to these roles without a literal. A second theme that cannot say its language by re-valuing these names and adding per-widget files. A component that needs a category reuse cannot give. A Portal frame pair in which the cool neutral reads as a loss. A design tool or a canvas target that needs an interchange format.
