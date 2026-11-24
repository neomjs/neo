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

## Next: the Engine 14 follow-up cut — no known defect ships

14.0.0 shipped on 2026-11-23. Board, scheduler and Gantt chart joined the component families on one shared time axis, packages outside the repository build on the published engine, and neomjs.com became findable for search engines and agents. Testing it on neomjs.com and in CI since then has found defects in surfaces it shipped. The next cut ships once they are fixed, so it is planned against those defects rather than a date. Whether it becomes 14.0.1 or 14.1.0 depends on what lands, and the operator decides the number at the cut. The release gate:

> **Every issue open with the `bug` label on a shipped Engine or Portal surface is fixed on `dev`, or deferred in this section with its reason. A defect found before the cut joins the set through that label.**

The live set is the [open issues labelled `bug`](https://github.com/neomjs/neo/issues?q=is%3Aissue%20is%3Aopen%20label%3Abug). The table below is a snapshot of that set.

**Known defects on 2026-11-24:**

| Surface | Issues | Owner |
|---|---|---|
| Examples gallery: keyboard and focus | [#22121](https://github.com/neomjs/neo/issues/22121) arrow keys stop between demonstration cards and component tiles · [#22120](https://github.com/neomjs/neo/issues/22120) after Back, the side nav keeps focus on the walked link | Ada · Grace |
| Example tiles | [#22006](https://github.com/neomjs/neo/issues/22006) the Trees tiles take their capture size from their examples | Grace |
| Workstation and multi-window | [#21974](https://github.com/neomjs/neo/issues/21974) a held dock reconcile flight blocks every later projection, and turns unrelated PRs' CI red · [#22125](https://github.com/neomjs/neo/issues/22125) closing a popup leaves stale canvas bindings · [#22114](https://github.com/neomjs/neo/issues/22114) tear-outs intermittently miss the boundary exit in hosted E2E | Emmy · Julia · Grace |
| VDom pipeline | [#20747](https://github.com/neomjs/neo/issues/20747) updates under a yielded ancestor wait on a flight they never touch · [#20780](https://github.com/neomjs/neo/issues/20780) without the VDom worker, meta, auto-mounts and the paint hook break · [#20871](https://github.com/neomjs/neo/issues/20871) a live proxy's drag end paints at the layout start for one frame (needs #20780 first) | open · open · Sophie |
| Lists | [#21965](https://github.com/neomjs/neo/issues/21965) `List#getItemRecordId` breaks when the list id contains `__` | an outside contributor |

**Beside the gate:** the v14 epics that are still open keep their steward and do not hold the cut. These are the examples section ([#21140](https://github.com/neomjs/neo/issues/21140)), the learning section ([#20498](https://github.com/neomjs/neo/issues/20498)) and the home section ([#20682](https://github.com/neomjs/neo/issues/20682)). Official opt-in pathname routing ([D#22145](https://github.com/neomjs/neo/discussions/22145)) is graduating into an epic, and each of its leaves ships in whichever cut it lands in.

**How it runs.** The cut waits for the gate, not for a date. On 2026-11-24 the operator planned it within days. Each fix is one pull request that resolves its issue, with a test that fails on `dev`. A defect that cannot land in time goes into the deferred list below with its reason, and the operator decides at the cut. Ada holds the gate: she re-reads the open `bug` set daily until the cut and finds an owner for any defect that has none. Each issue's owner fixes it.

**Deferred — explicitly off this cut's path:**

- **Every open epic.** Each one ships in whichever cut it lands in. Among those in flight: the web desktop shell ([#21198](https://github.com/neomjs/neo/issues/21198)), `npx neo-app` without webpack ([#21213](https://github.com/neomjs/neo/issues/21213)), the platform groups' proofs ([#21358](https://github.com/neomjs/neo/issues/21358)) and an outside contributor's standing ([#20892](https://github.com/neomjs/neo/issues/20892)).
- **Still deferred from Engine 14:** the calendar on the shared time axis, server-backed loading for the board, scheduler and Gantt chart, a second docs app, the rest of Grid Multi-Body ([D#20579](https://github.com/neomjs/neo/discussions/20579)), the full worker boundary ([D#18730](https://github.com/neomjs/neo/discussions/18730)'s option B), and the examples workbench beyond its code view and URL state ([#21144](https://github.com/neomjs/neo/issues/21144)).
- **The Brain and Institution lines' scope:** their own repositories and roadmaps, per the line table.

**Session intake** for contributors and agents: start here, then go to the open `bug` set. Take a defect marked "open" in the table by commenting on it first, or take an open [`good first issue`](https://github.com/neomjs/neo/labels/good%20first%20issue). Work for the Brain or Institution line goes to its repository, per the line table above.
