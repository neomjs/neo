# Neo.mjs Project Roadmap

The roadmap holds the **next-release scope only** — what ships next and why. Everything else has a canonical home:

- **Vision & positioning:** [`.github/VISION.md`](.github/VISION.md)
- **Architecture:** [Engine and ecosystem overview](learn/benefits/ArchitectureOverview.md) · [Brain: Dream Pipeline & Golden Path](https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/DreamPipeline.md)
- **Shipped history:** the [Engine release notes](https://github.com/neomjs/neo/releases) ([v13.2.0](https://github.com/neomjs/neo/releases/tag/13.2.0)) + the [v13 architectural path](https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/v13-path.md)

## The Release Lines

Neo ships from several repositories, so there is no organisation-wide release: there are three lines, each with its own cadence, gate and notes.

| Line | Repository | Gate | Notes |
|---|---|---|---|
| **Engine** | [neomjs/neo](https://github.com/neomjs/neo) | the next release's gate, under `## Next` below | the engine's own |
| **Brain runtime** | [neomjs/neo-agent-brain](https://github.com/neomjs/neo-agent-brain) | none declared — the Brain has cut no release and keeps no roadmap; Golden Path v2 ([neomjs/neo-agent-brain#122](https://github.com/neomjs/neo-agent-brain/issues/122)) is its first named cornerstone | the runtime's own |
| **Institution / Fleet Manager** | [neomjs/neo-agent-institution](https://github.com/neomjs/neo-agent-institution) | written in the Institution's own [`ROADMAP.md`](https://github.com/neomjs/neo-agent-institution/blob/dev/ROADMAP.md), tracked by [milestone FM v1](https://github.com/neomjs/neo-agent-institution/milestone/1) | the product's own |

The other repositories ride these lines: [neomjs/neo-agent-skills](https://github.com/neomjs/neo-agent-skills) ships the shared working discipline on npm; [neomjs/devindex](https://github.com/neomjs/devindex) is its own workspace on the published engine and deploys as its own GitHub Pages project site behind `middleware-v2`'s proxy ([D#19050](https://github.com/neomjs/neo/discussions/19050)); [neomjs/github-content-sync](https://github.com/neomjs/github-content-sync) publishes the organisation's conversation corpus on a schedule and has no release; [neomjs/pages](https://github.com/neomjs/pages) is the deployment target, not a product.

**How the line is re-read.** The engine line is re-read as a whole — its milestone and epics, the release notes' claims, the debt map once it has a home, and the transport axis together — at every release cut, at every change to user obligations, layout or canonical ownership, and otherwise weekly, as the recurring synthesis of [D#19394](https://github.com/neomjs/neo/discussions/19394) (the [first one](https://github.com/neomjs/neo/discussions/19394#discussioncomment-18854592) is the shape). The synthesis has a self-selected holder — for the Fleet Manager v1 window, Clio, named on that Discussion — and an independent reader of another family; a peer's acceptance, never presence or an old assignment, establishes the next reader, a holder hands off explicitly, and an unfilled seat names the action that fills it. The read is scheduled only over a reachable team: *sent*, *mailbox-readable*, *route-active* and *delivered* are four different observations, the detect path is [neomjs/neo-agent-brain#503](https://github.com/neomjs/neo-agent-brain/issues/503) and delivery [neomjs/neo-agent-brain#30](https://github.com/neomjs/neo-agent-brain/issues/30). A finding lands in the owning epic or ADR with its acceptance tuple — responsibility, holder, next activation, accepted recipient, observed result, remaining obligation — never as a new tracker by default, and the engine line's debt home is still an open question on D#19394 that the first synthesis needing one must answer. `Health:` lines, debt lines in PR bodies, `CODEOWNERS` and route wiring stay out of this file until a failed transition names one and its consumer.

## Next: Engine 13.3 — The Grid Fits Its Content

13.2 shipped the engine after the split, on 2026-10-11, fourteen weeks after 13.1. From here the engine releases every one to two weeks, so a release carries one theme it can finish. 13.3's theme is the buffered grid meeting real content — rows as tall as their text, and headers that open a menu — and beside it the one change the cadence itself needs: a cut the maintainers can run. The release gate is behaviour we can observe:

> **A buffered grid can opt into rows sized to their wrapped text, and scrolling it keeps the visible rows in place, the scrollbar honest and the locked columns aligned; every column header opens a menu that filters by checked values; and a maintainer cuts the release with `publish.mjs` as written, without a ruleset bypass.**

[Milestone #11](https://github.com/neomjs/neo/milestone/11) is the tracking milestone; its linked items are the full set.

| # | Cornerstone | Anchor | Steward | Done signal |
|---|---|---|---|---|
| 1 | **Content-sized rows** — opt-in row heights from cell content in buffered grids; fixed height stays the default | [#19658](https://github.com/neomjs/neo/issues/19658), graduated from [D#19645](https://github.com/neomjs/neo/discussions/19645) | Ada | a wrapped-text example grid keeps its start, center and end bodies aligned through thumb drag, wheel in both directions, jump-to-row and the last row, with no visible jump at the viewport; fixed-height grids unchanged; e2e-tested |
| 2 | **Grid header menus** — a column menu by right-click or by a trigger at the header's right edge on hover | [#19643](https://github.com/neomjs/neo/issues/19643); the design is open in [D#19646](https://github.com/neomjs/neo/discussions/19646) | Vega | every column header opens its menu by either trigger; the menu's value picker filters the store by checked values with live counts; sort, resize and column drag keep working; e2e-tested |
| 3 | **A cut the maintainers can run** — `publish.mjs` releases without a ruleset bypass or hand-run git | [#19637](https://github.com/neomjs/neo/issues/19637) | Grace | 13.3 itself is cut by `publish.mjs`, triggered by a maintainer, with no bypass |

**Carried in the milestone, not cornerstones:** the Portal's featured Workstation ([#19640](https://github.com/neomjs/neo/issues/19640)) reaches the published package with 13.3 — npm 13.2.0 still carries the old catalogs, so the site serves the correction from a pages overlay until then; two Workstation restore defects ([#16498](https://github.com/neomjs/neo/issues/16498), [#19569](https://github.com/neomjs/neo/issues/19569)); the Hacktoberfest contributor door ([#18985](https://github.com/neomjs/neo/issues/18985)) through October.

**Beside the gate:** the 13.2 launch keeps running — the blog stream ([#13383](https://github.com/neomjs/neo/issues/13383)) and the launch playbook's second phase, opening 2026-10-18 ([#14790](https://github.com/neomjs/neo/issues/14790)). Neither holds the cut.

**How it runs.** The cadence is fixed and the scope flexes: a cornerstone that is not done when the window closes moves to the next release instead of holding the cut; 13.2 spanned fourteen weeks. Cornerstone 1's Discussion has graduated into [#19658](https://github.com/neomjs/neo/issues/19658), which now gains its leaves; cornerstone 2's ([D#19646](https://github.com/neomjs/neo/discussions/19646)) is still converging, and its epic gains leaves once it does. New work attaches as a one-PR leaf under a cornerstone epic, or waits for the next release. Any peer claims leaves; the steward owns the outcome and closes the epic.

**Deferred — explicitly off the 13.3 path:**

- **The rest of Grid Multi-Body** ([#9486](https://github.com/neomjs/neo/issues/9486)): cross-window SubGrid detachment ([#9493](https://github.com/neomjs/neo/issues/9493)), main-thread scroll sync over a `MessageChannel` ([#9494](https://github.com/neomjs/neo/issues/9494)), split-body keyboard navigation ([#9496](https://github.com/neomjs/neo/issues/9496)) and the three-tier orchestration refactor ([#9872](https://github.com/neomjs/neo/issues/9872)). Its content-sized rows sub is cornerstone 1.
- **The full worker boundary** ([D#18730](https://github.com/neomjs/neo/discussions/18730)'s option B: the app, data and VDom heaps per window group).
- **Engine infrastructure:** the middleware SSR rebuild ([#12964](https://github.com/neomjs/neo/issues/12964)) and Pointer Events for the drag sensors ([#17889](https://github.com/neomjs/neo/issues/17889)).
- **The Brain and Institution lines' scope:** their own repositories and roadmaps, per the line table.

**Session intake** for contributors and agents: start here, then [milestone #11](https://github.com/neomjs/neo/milestone/11) for the live set and the cornerstone epics for the work. If the work serves a cornerstone, attach it under that epic as a one-PR leaf; if it belongs to the Brain or Institution line, its repository and the line table above say where.
