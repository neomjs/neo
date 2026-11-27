# Neo.mjs Project Roadmap

The roadmap holds the **next-release scope only** — what ships next and why. Everything else has a canonical home:

- **Vision & positioning:** [`.github/VISION.md`](.github/VISION.md)
- **Architecture:** [Engine and ecosystem overview](learn/benefits/ArchitectureOverview.md) · [Brain: Dream Pipeline & Golden Path](https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/DreamPipeline.md)
- **Shipped history:** the [Engine release notes](https://github.com/neomjs/neo/releases) ([v14.0.0](https://github.com/neomjs/neo/releases/tag/14.0.0)) + the [v13 architectural path](https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/v13-path.md)

## The Release Lines

Neo ships from several repositories, so there is no organisation-wide release: there are three lines, each with its own cadence, gate and notes.

| Line | Repository | Gate | Notes |
|---|---|---|---|
| **Engine** | [neomjs/neo](https://github.com/neomjs/neo) | the next release's gate, under `## Next` below | the engine's own |
| **Brain runtime** | [neomjs/neo-agent-brain](https://github.com/neomjs/neo-agent-brain) | none declared — the Brain has cut no release and keeps no roadmap; Golden Path v2 ([neomjs/neo-agent-brain#122](https://github.com/neomjs/neo-agent-brain/issues/122)) is its first named cornerstone | the runtime's own |
| **Institution / Fleet Manager** | [neomjs/neo-agent-institution](https://github.com/neomjs/neo-agent-institution) | written in the Institution's own [`ROADMAP.md`](https://github.com/neomjs/neo-agent-institution/blob/dev/ROADMAP.md), tracked by [milestone FM v1](https://github.com/neomjs/neo-agent-institution/milestone/1) | the product's own |

The other repositories ride these lines: [neomjs/neo-agent-skills](https://github.com/neomjs/neo-agent-skills) ships the shared working discipline on npm; [neomjs/devindex](https://github.com/neomjs/devindex) is its own workspace on the published engine and deploys as its own GitHub Pages project site behind `middleware-v2`'s proxy ([D#19050](https://github.com/neomjs/neo/discussions/19050)); [neomjs/github-content-sync](https://github.com/neomjs/github-content-sync) publishes the organisation's conversation corpus on a schedule and has no release; [neomjs/pages](https://github.com/neomjs/pages) is the deployment target, not a product.

**How the line is re-read.** The engine line is re-read as a whole — its milestone and epics, the release notes' claims, the debt map once it has a home, and the transport axis together — at every release cut, at every change to user obligations, layout or canonical ownership, and otherwise weekly, as the recurring synthesis of [D#19394](https://github.com/neomjs/neo/discussions/19394) (the [first one](https://github.com/neomjs/neo/discussions/19394#discussioncomment-18854592) is the shape). The synthesis has a self-selected holder — for the Fleet Manager v1 window, Clio, named on that Discussion — and an independent reader of another family; a peer's acceptance, never presence or an old assignment, establishes the next reader, a holder hands off explicitly, and an unfilled seat names the action that fills it. The read is scheduled only over a reachable team: *sent*, *mailbox-readable*, *route-active* and *delivered* are four different observations, the detect path is [neomjs/neo-agent-brain#503](https://github.com/neomjs/neo-agent-brain/issues/503) and delivery [neomjs/neo-agent-brain#30](https://github.com/neomjs/neo-agent-brain/issues/30). A finding lands in the owning epic or ADR with its acceptance tuple — responsibility, holder, next activation, accepted recipient, observed result, remaining obligation — never as a new tracker by default, and the engine line's debt home is still an open question on D#19394 that the first synthesis needing one must answer. `Health:` lines, debt lines in PR bodies, `CODEOWNERS` and route wiring stay out of this file until a failed transition names one and its consumer.

## Next: Engine 14.1

The [14.1 milestone](https://github.com/neomjs/neo/milestone/15) connects a working example, the lessons that teach it, and the controls developers can reuse in their own apps. Two foundations join it: a design system that every theme is written against, and touch input as engine events. The cut is planned for Sunday 29 or Monday 30 November and takes what has passed its gate by then; the rest of an open track leads the next release. Peers can pick an open milestone issue after checking its assignee and active PRs. Existing epic stewards keep their scopes.

### Learn through a working application

A reader builds an order-review desk, scrolls a large dataset, keeps identifying columns visible, edits an invalid quantity, and sees the exception count change. The [enterprise Grid tutorial](https://github.com/neomjs/neo/issues/20529) and [runnable catalog example](https://github.com/neomjs/neo/issues/22233) use the same application and data. Two companion lessons reuse the existing examples for state shared by a form, dialog and second window, and for a data pipeline running on the App or Data worker. The [Learn epic](https://github.com/neomjs/neo/issues/20498) and [Examples epic](https://github.com/neomjs/neo/issues/21140) retain their wider work.

Revisit [Max Rahder’s Earthquakes tutorial](https://github.com/neomjs/neo/issues/22230) as both a working application and a teaching model. The reader first sees two views request the same feed, then verifies what changes when they share one Store. Try today’s buffered Grid alongside the original Table with the same feed and map. Choose the version that best teaches the lesson. Share one worked lab and the reasons for its teaching choices with the other tutorial authors.

### Reusable controls and interactions

The [segmented control](https://github.com/neomjs/neo/issues/22234) replaces manual pressed-state synchronization in the Board example. The [empty state](https://github.com/neomjs/neo/issues/22235) gives File Explorer and Portal search a shared presentation while each view owns its message and recovery action. The [command palette](https://github.com/neomjs/neo/issues/22236) enters as a prototype. Its Workstation keyboard journey, focus restoration, and adoption in a second application decide whether to promote it to a public component.

### Share an example, then run it outside this checkout

A visitor can [share a catalog search](https://github.com/neomjs/neo/issues/22238) and open the same results in a fresh tab. Typing in Find leaves browser history alone. A developer can follow the pathname guide in a [freshly generated workspace](https://github.com/neomjs/neo/issues/22239), open a deep link directly, reload, edit its query and use Back. Exercise both development and production with the packed candidate. Confirm registry consumption after publication. The [routing epic](https://github.com/neomjs/neo/issues/22169) tracks the Engine and server contracts. Pages and middleware have separate deployment steps.

### A design system every theme is written against

Themes moved from Sass to plain CSS in 14.0. The token layers of the Neo pair still carry the shape of a Figma export from 2023, while the classic pair and Cyberpunk use different layers. [ADR 0044](learn/agentos/decisions/0044-design-system.md) decides what replaces them, and [its epic](https://github.com/neomjs/neo/issues/22295) builds it. Three kinds of names are told apart by shape and bound in one direction: a rule reads a component variable, a component variable reads a role, a role reads the palette. Colour ramps are named by function instead of hue, and every theme defines the same palette and role names, so an override written once works on every base theme. Light and dark are one theme. For a model, the deliverable is a short reference that shows which hook to set, where, and for which variant. Kept on purpose: structural rules in `src` beside theme variable files, themes that define variables only, and nesting. A theme covers every widget; a product look such as Workstation's or Fleet's is a palette of a theme. Variable names change in one cut, with a rename map in the release notes and no alias layer. Clio holds the design seat and reads every frame pair.

The [groundwork](https://github.com/neomjs/neo/issues/22280) needs no decision and is landing, measured by `npm run theme-census`, which [landed for it](https://github.com/neomjs/neo/issues/22270): the [old token export is gone](https://github.com/neomjs/neo/issues/22276), every variable a structural rule reads is to resolve in the Neo and classic pairs, and no structural rule is to paint a colour a theme cannot reach. The migration follows the record's order: the theme build writes each sheet's cascade layer, one map says what a theme is, a computed-style equality run is built and the `--cmp-*` layer goes behind it, one scripted pull request renames, theme Neo moves onto the roles package by package, then the classic pair and Cyberpunk.

### Touch input as engine events

A phone user swipes a row, holds a handle, pinches a canvas. The [touch discussion](https://github.com/orgs/neomjs/discussions/22259), maintained by Emmy, decides which gestures become engine events, where they are recognized, and how Neural Link and a Playwright test replay them. Correctness work needs no decision and is landing: [a tap that loses its click](https://github.com/neomjs/neo/issues/22264) and [touch listeners that outlive a cancelled contact](https://github.com/neomjs/neo/issues/22271). On a physical iPhone, compare today’s touch handling with component-declared `touch-action` and a passive body listener. Before changing the default, verify that a grid drag scrolls once, Helix manipulation keeps its page still, and native page scrolling and pinch-zoom still work. Gesture events and Neural Link/Playwright replay can be developed on existing styles.

**Capstone, shipped on green foundations only.** A Material light and dark theme and the first adaptive mobile components, a sheet that swipes and a floating action button, ship in this cut only if the design system and the gesture events are merged with time to spare, and lead the next one otherwise. Experiments with adaptive components can start now against existing Engine primitives.

The [read-only preview investigation](https://github.com/neomjs/neo/issues/22240) is closed; its outcome continues as [smaller Highlight.js bundles](https://github.com/neomjs/neo/issues/22249). Editable examples continue to use Monaco and LivePreview.

### Release gate

> **Every issue open with the `bug` label on a shipped Engine or Portal surface is fixed on `dev`, or deferred in this section with its reason. A defect found before the cut joins the set through that label.**

Ada holds the [live defect gate](https://github.com/neomjs/neo/issues?q=is%3Aissue%20is%3Aopen%20label%3Abug). Each fix retains its owner and a regression witness. The operator decides outstanding deferrals at the cut. In particular, the [yielded-update issue](https://github.com/neomjs/neo/issues/20747) and [drag-terminal issue](https://github.com/neomjs/neo/issues/20871) carry scheduling and ordering decisions into the [scheduling discussion](https://github.com/neomjs/neo/discussions/22199). [ADR 0043](learn/agentos/decisions/0043-vdom-diff-placement.md) governs diff placement: App-worker diff is the default and the enhanced VDom worker remains supported as an opt-in.

**Beyond this cut.** The wider web desktop, first-run installation-speed, platform-example and contributor-standing epics retain their own delivery schedules. Product palettes for Workstation and Fleet and a theme workbench follow the theme migration. Calendar on the shared time axis, server-backed planning data, the second docs app, the remaining Grid Multi-Body work, and further workbench features remain deferred. Brain and Fleet Manager follow their own release lines.
