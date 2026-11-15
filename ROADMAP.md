# Neo.mjs Project Roadmap

The roadmap holds the **next-release scope only** — what ships next and why. Everything else has a canonical home:

- **Vision & positioning:** [`.github/VISION.md`](.github/VISION.md)
- **Architecture:** [Engine and ecosystem overview](learn/benefits/ArchitectureOverview.md) · [Brain: Dream Pipeline & Golden Path](https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/DreamPipeline.md)
- **Shipped history:** the [Engine release notes](https://github.com/neomjs/neo/releases) ([v13.4.0](https://github.com/neomjs/neo/releases/tag/13.4.0)) + the [v13 architectural path](https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/v13-path.md)

## The Release Lines

Neo ships from several repositories, so there is no organisation-wide release: there are three lines, each with its own cadence, gate and notes.

| Line | Repository | Gate | Notes |
|---|---|---|---|
| **Engine** | [neomjs/neo](https://github.com/neomjs/neo) | the next release's gate, under `## Next` below | the engine's own |
| **Brain runtime** | [neomjs/neo-agent-brain](https://github.com/neomjs/neo-agent-brain) | none declared — the Brain has cut no release and keeps no roadmap; Golden Path v2 ([neomjs/neo-agent-brain#122](https://github.com/neomjs/neo-agent-brain/issues/122)) is its first named cornerstone | the runtime's own |
| **Institution / Fleet Manager** | [neomjs/neo-agent-institution](https://github.com/neomjs/neo-agent-institution) | written in the Institution's own [`ROADMAP.md`](https://github.com/neomjs/neo-agent-institution/blob/dev/ROADMAP.md), tracked by [milestone FM v1](https://github.com/neomjs/neo-agent-institution/milestone/1) | the product's own |

The other repositories ride these lines: [neomjs/neo-agent-skills](https://github.com/neomjs/neo-agent-skills) ships the shared working discipline on npm; [neomjs/devindex](https://github.com/neomjs/devindex) is its own workspace on the published engine and deploys as its own GitHub Pages project site behind `middleware-v2`'s proxy ([D#19050](https://github.com/neomjs/neo/discussions/19050)); [neomjs/github-content-sync](https://github.com/neomjs/github-content-sync) publishes the organisation's conversation corpus on a schedule and has no release; [neomjs/pages](https://github.com/neomjs/pages) is the deployment target, not a product.

**How the line is re-read.** The engine line is re-read as a whole — its milestone and epics, the release notes' claims, the debt map once it has a home, and the transport axis together — at every release cut, at every change to user obligations, layout or canonical ownership, and otherwise weekly, as the recurring synthesis of [D#19394](https://github.com/neomjs/neo/discussions/19394) (the [first one](https://github.com/neomjs/neo/discussions/19394#discussioncomment-18854592) is the shape). The synthesis has a self-selected holder — for the Fleet Manager v1 window, Clio, named on that Discussion — and an independent reader of another family; a peer's acceptance, never presence or an old assignment, establishes the next reader, a holder hands off explicitly, and an unfilled seat names the action that fills it. The read is scheduled only over a reachable team: *sent*, *mailbox-readable*, *route-active* and *delivered* are four different observations, the detect path is [neomjs/neo-agent-brain#503](https://github.com/neomjs/neo-agent-brain/issues/503) and delivery [neomjs/neo-agent-brain#30](https://github.com/neomjs/neo-agent-brain/issues/30). A finding lands in the owning epic or ADR with its acceptance tuple — responsibility, holder, next activation, accepted recipient, observed result, remaining obligation — never as a new tracker by default, and the engine line's debt home is still an open question on D#19394 that the first synthesis needing one must answer. `Health:` lines, debt lines in PR bodies, `CODEOWNERS` and route wiring stay out of this file until a failed transition names one and its consumer.

## Next: Engine 14 — The Front Door

13.4.0 shipped on 2026-11-09 and left the Engine with five open issues. The next cut spends that room on being found, understood and built on, and it is planned as 14.0.0: a board, a scheduler and a Gantt chart join the engine's component families on one shared time axis, so a team that builds a planning or tracking tool no longer has to leave the engine. It is cut on Monday 2026-11-23, seven years to the day after [the public release announcement](https://codeburst.io/neo-mjs-the-public-release-announcement-1519255bc8f9). The release gate is behaviour we can observe:

> **On neomjs.com, someone who has never seen Neo can say after the home section what it is and who it is for, finds each component family's examples as an overview in which every example names what it proves, and finds a support path on Connect. One new `good first issue` was opened on every day of the window.**

[Milestone #14](https://github.com/neomjs/neo/milestone/14) is the tracking milestone; its linked items are the full set.

**How the number is confirmed.** The four new families (the board, the timeline, the scheduler and the Gantt chart) are on `dev` by Thursday 2026-11-19, 24:00 UTC. On Friday 2026-11-20 a fresh `npx neo-app` app that installs a tarball packed from `dev` builds its themes, moves a card, reschedules a booking, edits a linked task and finds its own records again after a reload. The release takes its number on that reading, and a family that misses rides the next cut. `create-app` is released on cut day, once the engine is on npm, because a new app installs 14 only when `create-app` asks for it.

**Cornerstones:**

| # | Epic | Anchor | Steward | Done signal |
|---|---|---|---|---|
| 1 | **Examples and the learning section at the kitchen-sink standard** | [#20498](https://github.com/neomjs/neo/issues/20498) | Clio | a stranger evaluating the engine opens the Portal's examples and reads, per component family, what each example shows and why it matters, the grid first with twenty or more examples; the learning section opens to a structure built for its three readers |
| 2 | **The engine hosts packages that live outside its repository** | [#20667](https://github.com/neomjs/neo/issues/20667) | Vega | a package in its own repository builds, themes and runs against the published engine, and extends the grid, store and drag primitives through public seams, with no private patch and no import from `dev` |
| 3 | **The home section says what Neo is and who it is for** | [#20682](https://github.com/neomjs/neo/issues/20682) | Clio | someone who has never seen Neo reads the home section and can say in their own words what Neo is, who it is for and what to do next; each audience the README names finds its door there with one proof that exists and one next step; the snapshot a crawler or an agent receives for the home route says the same |
| 4 | **Search engines and agents find and classify neomjs.com** | [#20671](https://github.com/neomjs/neo/issues/20671) | Julia | every canonical Portal route serves route-specific SSR metadata, structured schema and clean semantic HTML; the sitemap index and the `llms.txt` surfaces stay fresh on every release and sync deploy; Search Console's core-sitemap coverage and engineering-query impressions are measured against the 2026-10-24 baseline |
| 5 | **Board, scheduler and Gantt join the engine's component families** | [#20874](https://github.com/neomjs/neo/issues/20874) | Clio | a stranger runs `npx neo-app` and builds a kanban board, a resource scheduler and a Gantt chart on their own records from the engine alone, in every shipped theme, with a runnable example and a guide per family |

**Carried in the milestone:** Connect gains the support path the gate names ([#20677](https://github.com/neomjs/neo/issues/20677)). `publish.mjs prepare` sets the version in its release commit ([#20664](https://github.com/neomjs/neo/issues/20664)), which removes the separate bump pull request from every cut.

**Beside the gate:** the 100,000-rows demo video ([#20185](https://github.com/neomjs/neo/issues/20185)) and the Dream Pipeline receipts post ([#19058](https://github.com/neomjs/neo/issues/19058)) keep running. They do not hold the cut.

**How it runs.** The window is fixed and the scope flexes. The release is cut by `publish.mjs` on Monday 2026-11-23, and the next cut is planned two weeks later. An epic that is not done by then stays open instead of holding the cut. Scope is sized against measured throughput, not head-count: 344 Engine pull requests merged in the seventeen days between 13.3.1 and 13.4.0. Each epic's steward owns its outcome and closes it.

**One good first issue a day.** On every day of the window a maintainer opens at least one issue labelled [`good first issue`](https://github.com/neomjs/neo/labels/good%20first%20issue), written so that a contributor working with a coding agent can finish it from public context alone. When one is picked up, more follow. Whoever files the issue reviews the pull request it draws.

**Deferred — explicitly off this cut's path:**

- **The calendar on the shared time axis.** The calendar keeps its own time scale in this cut; its week view moves onto the timeline's axis afterwards.
- **Server-backed loading for the board, the scheduler and the Gantt chart.** In this cut they project records a store already holds.
- **A second version of the docs app.** It starts as a design thread; nothing is built in this window.
- **The rest of Grid Multi-Body** ([D#20579](https://github.com/neomjs/neo/discussions/20579)): cross-window SubGrid detachment and main-thread scroll sync over a `MessageChannel`.
- **The full worker boundary** ([D#18730](https://github.com/neomjs/neo/discussions/18730)'s option B: the app, data and VDom heaps per window group).
- **The Brain and Institution lines' scope:** their own repositories and roadmaps, per the line table.

**Session intake** for contributors and agents: start here, then [milestone #14](https://github.com/neomjs/neo/milestone/14) for the live set. Take an open [`good first issue`](https://github.com/neomjs/neo/labels/good%20first%20issue), or a one-PR leaf under one of the cornerstone epics. Under [#20874](https://github.com/neomjs/neo/issues/20874) the four family leaves are maintainer lanes; its themes, examples and guides open to contributors as each family reaches `dev`. Work for the Brain or Institution line goes to its repository, per the line table above.
