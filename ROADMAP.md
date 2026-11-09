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

## Next: Engine 13.5 — The Front Door

13.4.0 shipped on 2026-11-09 and left the Engine with five open issues. 13.5 spends that room on being found, understood and built on. It is cut on Monday 2026-11-23, seven years to the day after [the public release announcement](https://codeburst.io/neo-mjs-the-public-release-announcement-1519255bc8f9). The release gate is behaviour we can observe:

> **On neomjs.com, someone who has never seen Neo can say after the home section what it is and who it is for, finds each component family's examples as an overview in which every example names what it proves, and finds a support path on Connect. One new `good first issue` was opened on every day of the window.**

[Milestone #14](https://github.com/neomjs/neo/milestone/14) is the tracking milestone; its linked items are the full set.

**Cornerstones:**

| # | Epic | Anchor | Steward | Done signal |
|---|---|---|---|---|
| 1 | **Examples and the learning section at the kitchen-sink standard** | [#20498](https://github.com/neomjs/neo/issues/20498) | Clio | a stranger evaluating the engine opens the Portal's examples and reads, per component family, what each example shows and why it matters, the grid first with twenty or more examples; the learning section opens to a structure built for its three readers |
| 2 | **The engine hosts packages that live outside its repository** | [#20667](https://github.com/neomjs/neo/issues/20667) | Vega | a package in its own repository builds, themes and runs against the published engine, and extends the grid, store and drag primitives through public seams, with no private patch and no import from `dev` |

**Not yet in the table.** A cornerstone enters it once it has an epic and one self-selected steward. Two are on the way:

- **The home section says what Neo is.** Clio stewards it and files its epic by 2026-11-11. It scrolls over several screens of live demonstrations (`apps/portal/view/home`), and the maintainers' own read is that a newcomer may leave without knowing what Neo is or what it is for. Which demonstrations stay and what the text says are the steward's questions; [D#14683](https://github.com/neomjs/neo/discussions/14683) is the open design thread on the front door.
- **Search engines and agents find and classify neomjs.com.** It has no steward yet. [#20089](https://github.com/neomjs/neo/issues/20089) records what Search Console showed on 2026-10-24: the site ranked for unrelated strings and for no engineering term. The work spans the Portal and [neomjs/middleware-v2](https://github.com/neomjs/middleware-v2), and the share that depends on references from other sites is outbound work outside this repository.

**Carried in the milestone:** `publish.mjs prepare` sets the version in its release commit ([#20664](https://github.com/neomjs/neo/issues/20664)), which removes the separate bump pull request from every cut.

**Beside the gate:** the 100,000-rows demo video ([#20185](https://github.com/neomjs/neo/issues/20185)) and the Dream Pipeline receipts post ([#19058](https://github.com/neomjs/neo/issues/19058)) keep running. They do not hold the cut.

**How it runs.** The window is fixed and the scope flexes. 13.5 is cut by `publish.mjs` on Monday 2026-11-23, and the next cut is planned two weeks later. An epic that is not done by then stays open instead of holding the cut. Scope is sized against measured throughput, not head-count: 344 Engine pull requests merged in the seventeen days between 13.3.1 and 13.4.0. Each epic's steward owns its outcome and closes it.

**One good first issue a day.** On every day of the window a maintainer opens at least one issue labelled [`good first issue`](https://github.com/neomjs/neo/labels/good%20first%20issue), written so that a contributor working with a coding agent can finish it from public context alone. When one is picked up, more follow. Whoever files the issue reviews the pull request it draws.

**Deferred — explicitly off the 13.5 path:**

- **A second version of the docs app.** It starts as a design thread; nothing is built in this window.
- **The rest of Grid Multi-Body** ([D#20579](https://github.com/neomjs/neo/discussions/20579)): cross-window SubGrid detachment and main-thread scroll sync over a `MessageChannel`.
- **The full worker boundary** ([D#18730](https://github.com/neomjs/neo/discussions/18730)'s option B: the app, data and VDom heaps per window group).
- **The Brain and Institution lines' scope:** their own repositories and roadmaps, per the line table.

**Session intake** for contributors and agents: start here, then [milestone #14](https://github.com/neomjs/neo/milestone/14) for the live set. Take an open [`good first issue`](https://github.com/neomjs/neo/labels/good%20first%20issue), or a one-PR leaf under one of the cornerstone epics. Work for the Brain or Institution line goes to its repository, per the line table above.
