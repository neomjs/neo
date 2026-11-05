# Neo.mjs Project Roadmap

The roadmap holds the **next-release scope only** — what ships next and why. Everything else has a canonical home:

- **Vision & positioning:** [`.github/VISION.md`](.github/VISION.md)
- **Architecture:** [Engine and ecosystem overview](learn/benefits/ArchitectureOverview.md) · [Brain: Dream Pipeline & Golden Path](https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/DreamPipeline.md)
- **Shipped history:** the [Engine release notes](https://github.com/neomjs/neo/releases) ([v13.3.1](https://github.com/neomjs/neo/releases/tag/13.3.1)) + the [v13 architectural path](https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/v13-path.md)

## The Release Lines

Neo ships from several repositories, so there is no organisation-wide release: there are three lines, each with its own cadence, gate and notes.

| Line | Repository | Gate | Notes |
|---|---|---|---|
| **Engine** | [neomjs/neo](https://github.com/neomjs/neo) | the next release's gate, under `## Next` below | the engine's own |
| **Brain runtime** | [neomjs/neo-agent-brain](https://github.com/neomjs/neo-agent-brain) | none declared — the Brain has cut no release and keeps no roadmap; Golden Path v2 ([neomjs/neo-agent-brain#122](https://github.com/neomjs/neo-agent-brain/issues/122)) is its first named cornerstone | the runtime's own |
| **Institution / Fleet Manager** | [neomjs/neo-agent-institution](https://github.com/neomjs/neo-agent-institution) | written in the Institution's own [`ROADMAP.md`](https://github.com/neomjs/neo-agent-institution/blob/dev/ROADMAP.md), tracked by [milestone FM v1](https://github.com/neomjs/neo-agent-institution/milestone/1) | the product's own |

The other repositories ride these lines: [neomjs/neo-agent-skills](https://github.com/neomjs/neo-agent-skills) ships the shared working discipline on npm; [neomjs/devindex](https://github.com/neomjs/devindex) is its own workspace on the published engine and deploys as its own GitHub Pages project site behind `middleware-v2`'s proxy ([D#19050](https://github.com/neomjs/neo/discussions/19050)); [neomjs/github-content-sync](https://github.com/neomjs/github-content-sync) publishes the organisation's conversation corpus on a schedule and has no release; [neomjs/pages](https://github.com/neomjs/pages) is the deployment target, not a product.

**How the line is re-read.** The engine line is re-read as a whole — its milestone and epics, the release notes' claims, the debt map once it has a home, and the transport axis together — at every release cut, at every change to user obligations, layout or canonical ownership, and otherwise weekly, as the recurring synthesis of [D#19394](https://github.com/neomjs/neo/discussions/19394) (the [first one](https://github.com/neomjs/neo/discussions/19394#discussioncomment-18854592) is the shape). The synthesis has a self-selected holder — for the Fleet Manager v1 window, Clio, named on that Discussion — and an independent reader of another family; a peer's acceptance, never presence or an old assignment, establishes the next reader, a holder hands off explicitly, and an unfilled seat names the action that fills it. The read is scheduled only over a reachable team: *sent*, *mailbox-readable*, *route-active* and *delivered* are four different observations, the detect path is [neomjs/neo-agent-brain#503](https://github.com/neomjs/neo-agent-brain/issues/503) and delivery [neomjs/neo-agent-brain#30](https://github.com/neomjs/neo-agent-brain/issues/30). A finding lands in the owning epic or ADR with its acceptance tuple — responsibility, holder, next activation, accepted recipient, observed result, remaining obligation — never as a new tracker by default, and the engine line's debt home is still an open question on D#19394 that the first synthesis needing one must answer. `Health:` lines, debt lines in PR bodies, `CODEOWNERS` and route wiring stay out of this file until a failed transition names one and its consumer.

## Next: Engine 13.4 — Every Change Proven, One Command In

13.3.0 shipped on 2026-10-21 and 13.3.1 on 2026-10-23, and the cadence holds: a release every one to two weeks, each carrying one theme it can finish. 13.4's theme is twofold. The engine proves every change cheaply, and a coding agent outside our repositories can start working with it in one command. Since 13.3.1, the Brain-gated e2e tier has gated every Engine pull request ([#19655](https://github.com/neomjs/neo/issues/19655), closed 2026-11-05); 13.4 makes that coverage cheap and takes the Brain out of the specs that never needed it. The release gate is behaviour we can observe:

> **An Engine pull request holds only the runner slots its diff needs; the single-app Neural Link specs run in hosted CI through each page's own App Worker, with no Brain checkout; and a coding agent with no neo checkout reaches a built, running neo app with one command.**

[Milestone #13](https://github.com/neomjs/neo/milestone/13) is the tracking milestone; its linked items are the full set.

| # | Cornerstone | Anchor | Steward | Done signal |
|---|---|---|---|---|
| 1 | **Each test tier runs only when a change can reach it** | [#20328](https://github.com/neomjs/neo/issues/20328) | Grace | an Engine PR push holds only the runner slots its diff needs; the fixed checks run as a handful of jobs; the `dev` push runs the Brain-gated tier in full; jobs and runner-minutes per push sit measurably below the epic's baseline |
| 2 | **Single-app Neural Link specs without a Bridge** | [#20370](https://github.com/neomjs/neo/issues/20370), graduated from [D#18775](https://github.com/neomjs/neo/discussions/18775) | Vega | hosted CI drives the single-app Neural Link e2e specs through each page's own App Worker, with no Brain checkout and no WebSocket; a production boot behaves exactly as before |
| 3 | **An outside coding agent gets neo in one command** | [#20114](https://github.com/neomjs/neo/issues/20114) | Grace | a coding agent with no neo or Brain checkout runs one command and reaches a built, running neo app it can reopen, with the neo skills, the Neural Link and the engine's docs in place; one cold run proves it |

**Carried in the milestone, not cornerstones:** grid columns under a shared group header ([#20379](https://github.com/neomjs/neo/issues/20379)); opt-in closable tabs ([#26](https://github.com/neomjs/neo/issues/26)), which also carry the first-tab removal fix ([#20390](https://github.com/neomjs/neo/issues/20390)); and the fix for a 13.2 regression in which a Store passed to a ComboBox stops publishing its record edits ([#20403](https://github.com/neomjs/neo/issues/20403)).

**Beside the gate:** the v13 blog stream ([#13383](https://github.com/neomjs/neo/issues/13383)) keeps running. It does not hold the cut.

**How it runs.** The cadence is fixed and the scope flexes: a cornerstone that is not done when the window closes moves to the next release instead of holding the cut. 13.4 is cut by `publish.mjs` when its three cornerstones close, or at the end of its window around 2026-11-19, whichever comes first. Cornerstone 3's leaves are all closed, and it owes only its epic close-out. New work attaches as a one-PR leaf under a cornerstone epic, or waits for the next release. Any peer claims leaves; the steward owns the outcome and closes the epic.

**Deferred — explicitly off the 13.4 path:**

- **The structured document editor** ([#20166](https://github.com/neomjs/neo/issues/20166)) and its transaction ADR ([#20167](https://github.com/neomjs/neo/issues/20167)), toward 13.5.
- **The rest of Grid Multi-Body** ([#9486](https://github.com/neomjs/neo/issues/9486)): cross-window SubGrid detachment ([#9493](https://github.com/neomjs/neo/issues/9493)), main-thread scroll sync over a `MessageChannel` ([#9494](https://github.com/neomjs/neo/issues/9494)), split-body keyboard navigation ([#9496](https://github.com/neomjs/neo/issues/9496)) and the three-tier orchestration refactor ([#9872](https://github.com/neomjs/neo/issues/9872)). Its content-sized rows sub shipped in 13.3.
- **The full worker boundary** ([D#18730](https://github.com/neomjs/neo/discussions/18730)'s option B: the app, data and VDom heaps per window group).
- **Engine infrastructure:** the middleware SSR rebuild ([#12964](https://github.com/neomjs/neo/issues/12964)) and Pointer Events for the drag sensors ([#17889](https://github.com/neomjs/neo/issues/17889)).
- **The Brain and Institution lines' scope:** their own repositories and roadmaps, per the line table.

**Session intake** for contributors and agents: start here, then [milestone #13](https://github.com/neomjs/neo/milestone/13) for the live set and the cornerstone epics for the work. If the work serves a cornerstone, attach it under that epic as a one-PR leaf; if it belongs to the Brain or Institution line, its repository and the line table above say where.
