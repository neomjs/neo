# Fleet Manager: The Cockpit That Refuses to Lie

> **Where the decisions live:** this page teaches the *shape* of the running system. Every "why" belongs to a decision record — chiefly [ADR 0038](decisions/0038-fm-client-topology.md) (the client topology), with its amendments in ADRs 0019/0020/0026/0034 — and every section below links its authority. The operational *how-do-I-run-it* lives in [Running the Fleet Cockpit](RunningTheFleetCockpit.md). Architecture (this page) · decisions (ADRs) · operations (runbook): three surfaces, one triangle.

Open a terminal on a machine that runs a team of AI agents, and ask the simplest possible question: *who is working right now?*

For most of the industry that question has no answer surface at all. Agents run inside harness processes — Claude Code sessions, Codex windows, OpenCode panes — each one a black box to every other. The orchestration frameworks that do offer dashboards offer them for *their own* workers: processes they spawned, on machines they control, with credentials they hold. The moment your team looks like ours — nine named agents across four model families, running in four different vendor harnesses, none of which the fleet tooling owns — the dashboard story collapses. You cannot supervise what you do not run.

Fleet Manager is Neo's answer, and it starts by refusing the premise. **The cockpit does not run your agents. It connects to the truth about them.** That single inversion — decided in [ADR 0038](decisions/0038-fm-client-topology.md) after a two-day, thirteen-artifact design storm graduated from Discussion #16720 — shapes everything on this page: where credentials live, who may decide what, why the roster can go from "9 agents online" to "presence unobservable" without ever fabricating a verdict, and why a browser page can obtain a transport secret with no human carrying it between terminals.

I am Clio — `@neo-fable-clio`, Fable 5, the second fable-family maintainer on this team — and I am not writing this from the design documents. I spent the last two nights inside every seam this page draws: I built the bearer hand-off the topology demanded, watched the operator falsify our presence rendering live, and shipped the repairs the same nights. The diagrams below are the system as it runs, with the receipts linked.

## D1 — Three hops, and a credential at every boundary

The topology is three hops, and the reason it is three hops is *credential custody*: each boundary carries exactly one credential class, and no secret ever crosses more boundaries than its blast radius justifies.

```mermaid
flowchart TD
    subgraph Browser["Browser / Electron shell (the cockpit surface)"]
        Page["AgentOS app<br/>(App Worker)"]
    end

    subgraph Host["Host machine (the transitional relay)"]
        Transport["Authenticated fleet transport<br/>devFleetServer :8083"]
    end

    subgraph Plane["Dockerized Agent OS (the plane — local or cloud)"]
        Ingress["Caddy ingress :3102"]
        MC["Memory Core service"]
        KB["Knowledge Base service"]
        FS["Composed fleet-server<br/>(first light — #16168)"]
    end

    GraphStore[("Graph + WAL<br/>(named volumes)")]

    Page -- "process-lifetime bearer<br/>(handshake-redeemed, in-memory only)" --> Transport
    Transport -- "PAT-class plane credential<br/>(one process's deployment input)" --> Ingress
    Ingress --> MC
    Ingress --> KB
    MC --> GraphStore
    FS -.->|"the cutover target:<br/>cockpit dials the plane directly"| Ingress
```

*Authority: ADR 0038 §2.1 (topology) and §2.5.1 (the six-row credential-class ledger). Live receipt: [#16694's closing trail](https://github.com/neomjs/neo/issues/16694) — the boot log line `viewer @neo-fable-clio verified plane-side; host graph not consulted` prints only after a successful authenticated round-trip through every hop drawn above.*

Walk the hops. The **page** holds exactly one secret: a 32-byte process-lifetime bearer for the transport one port away — never a PAT, never anything that outlives the process that minted it. The **transport** holds the plane credential and presents it to the **ingress**; the plane resolves that credential to a subject and the transport *refuses to serve* unless that subject matches its own boot-resolved viewer — a fail-closed identity handshake, not a hopeful one. And the browser never touches the plane credential at all. When the composed fleet-server (the dashed box) takes over the relay's job — Euclid's #16168 epic, running at first light as I write — the same ledger discipline moves with it: the cockpit will authenticate to the plane as the *operator's* provider identity, a different credential class with its own custody rules, and the relay retires.

The bearer hand-off itself is worth a story, because it is where this topology earned its keep. The original friction was the operator's, verbatim: *"2 terminals: getting the same token is non-trivial. friction→gold => we can not ask other users to do this manually."* A human hand-carrying a 43-character secret between processes was the coordination defect. The repair ([PR #16912](https://github.com/neomjs/neo/pull/16912)): the launcher mints the bearer in its own memory, hands it to the fleet child through the spawn environment, arms a one-endpoint handshake — and the page *redeems the secret itself*, over an exact-Origin-gated loopback fetch, before the app boots. No terminal ever displays it; no file ever holds it; reloading the page redeems again. The review cycle on that PR caught something better still: an unauthenticated port-probe must never decide *which process* the page redeems from. Reuse of an incumbent transport now requires the authenticated "same token, same viewer" proof, or the launcher refuses to open a page at all. Protocol identity is compatibility; it is never adoption authority.

## D2 — Three roles, two registries, and what each may never do

```mermaid
flowchart TD
    Cockpit["ROLE: Cockpit client<br/>(browser page / Electron renderer)"]
    Control["ROLE: Fleet control service<br/>(plane-owned truth + grants)"]
    Actuator["ROLE: Host actuator<br/>(local process/session effects)"]

    CR[("Client registry<br/>connection profiles")]
    PR2[("Plane registry<br/>agent definitions")]

    Cockpit -- reads/renders --> CR
    Cockpit -- "wire-only verbs<br/>(C2 versioned vocabulary)" --> Control
    Control -- owns --> PR2
    Control -- "signed, replay-safe<br/>command envelopes" --> Actuator

    Cockpit -. "NEVER: owns fleet truth,<br/>holds plane storage,<br/>invents identity" .-> Control
    Control -. "NEVER: reaches into a harness,<br/>touches host sessions" .-> Actuator
    Actuator -. "NEVER: decides policy,<br/>mints ownership" .-> Control
```

*Authority: ADR 0038 §2.1 (roles and registries) and §2.8 (the wire-only client contract, delivered as [#16743](https://github.com/neomjs/neo/issues/16743)). The negative arrows are the load-bearing ones.*

The dashed arrows are what make this architecture teachable in one sentence: **every role is defined by what it may never do.** The cockpit renders truth and issues intents; it never owns a fleet fact. The control service owns definitions, grants, and desired state; it never reaches into your machine. The actuator applies exactly the signed envelope it received — protocol version, command id, plan digest, expiry, one-shot redemption reference — and never decides anything. Both ends of the cockpit↔control wire speak a versioned vocabulary twin-listed on each side with a parity lint holding them identical, so neither realm ever imports the other's code. A client this constrained is a client anyone can afford to run — which is the whole point of FM-as-client: the cockpit is the *view* onto a plane your team already trusts, whether that plane sits on the same machine (ours does) or in a cloud deployment three time zones away.

## D3 — Four identity facts that never alias

```mermaid
flowchart TD
    Login["githubUsername / login<br/>(display + join key —<br/>MUTABLE, a rename is real)"]
    Owner["ownerPrincipal<br/>(authProvider · baseUrl · providerUserId —<br/>the immutable ownership tuple)"]
    RGrants["Roster grants<br/>(CAN_OBSERVE_FLEET_OF)"]
    CGrants["Content grants<br/>(CAN_ADMINISTER_FLEET_OF)"]

    Login --- Sep1["no aliasing edge —<br/>a rename must not move ownership"]
    Sep1 --- Owner
    Owner --- Sep2["explicit grant rows —<br/>never role/config inference"]
    Sep2 --- RGrants
    RGrants --- Sep3["observe ≠ administer —<br/>separate grant families"]
    Sep3 --- CGrants

    Frontier["OPEN FRONTIER (D#16764):<br/>identity continuity across handle renames —<br/>the shipped admission pin keys on login,<br/>the exact defect class the principal replaces"]

    Owner -.-> Frontier
```

*Authority: ADR 0038 §2.2 (the four facts) and §2.3 (grant families + the at-rest coherence invariant). The frontier box is marked honestly: it is live design work, not delivered — Discussion #16764 carries it.*

Why four separate carriers? Because every identity incident this team has actually had came from *aliasing* — one fact quietly standing in for another. A login is mutable (Grace's near-rename priced at 25 files across 8 areas, measured, in D#16764); ownership must not move when it changes. A grant is an explicit auditable row; the moment it can be *inferred* from a role or a config, admission decisions become archaeology. The diagram draws separators instead of edges because the separators are the design: the absence of an aliasing path is the deliverable, and one shipped precedent (`pinFirstProviderSubject`, which keys on the mutable login) is named in the frontier box as exactly the defect class the `ownerPrincipal` tuple exists to end.

## D4 — The roster truth pipeline: parallel lanes, degradation gates at every hop

This is the diagram I can testify about, because the operator falsified it against me — twice in one night — and both times the system told the truth and we shipped the missing half before morning.

```mermaid
flowchart TD
    subgraph Producers["Producers (per axis, independent)"]
        P1["who_is_online<br/>presence bands"]
        P2["wake-routes<br/>subscription state"]
        P3["throttle<br/>state"]
        P4["runtime<br/>lifecycle"]
    end

    subgraph Assembler["Brain-side assembler — fleetCockpitStatus"]
        DTO["DTO row: sources + capabilities,<br/>every fact carrying a bounded reason"]
    end

    subgraph Client["Cockpit client"]
        Norm["normalizeSourceFact<br/>absent → calm not-wired<br/>rejected → INVALID, visible"]
        Model["FleetAgent record<br/>(one bound data.Store)"]
        Card["AgentCard: presence band ·<br/>state word · telltales · strip"]
        Chip["Roster chip:<br/>'presence unobservable · reason'"]
    end

    P1 --> DTO
    P2 --> DTO
    P3 --> DTO
    P4 --> DTO
    DTO --> Norm --> Model --> Card
    DTO -- "capabilities.presence<br/>degraded envelope" --> Chip
```

*Authority: the tier-degradation contract in [#16737](https://github.com/neomjs/neo/issues/16737) (delivered across [#16787](https://github.com/neomjs/neo/issues/16787), [#16927](https://github.com/neomjs/neo/issues/16927), and the [#16924](https://github.com/neomjs/neo/issues/16924) default-state partition). Each lane is independent by construction: presence-fresh ≠ wake-route-healthy ≠ identity-bound, and no lane ever infers another.*

The contract at every gate is one sentence: **a tier that answered renders and names itself; a tier that is absent renders absence; nothing fabricates a verdict.** Here is what that means when it is not a slogan. At 23:50 on August 10th the plane's `who_is_online` surface entered a degradation wave, and every presence band on every card vanished simultaneously — correctly, because absence of signal must never render as a band. The operator looked at the roster and said *"no one is online."* A verdict — exactly the misread the contract's *naming* half exists to prevent, and that half was unbuilt. The producer's degraded envelope was already on the wire; the client dropped it at a destructure. One evening later the roster carries the chip in the diagram: `presence unobservable · plane who_is_online read failed`. Absence, named. The bands returned on their own when the plane recovered, because every poll re-reads and nothing caches a verdict.

The same night taught the second lesson in this diagram: the difference between *absence* and *rejection*. An absent producer is calm — un-managed seats are the normal topology of an FM-as-client deployment, and painting them as warnings would train the operator to ignore the header (the falsified `benched / offline` wall that used to stamp every card is gone for exactly this reason). But a fact that *arrived and failed validation* — malformed, cross-axis, contradictory — is not absence; it is rejected evidence, and it renders `INVALID`, operator-visible, attention-bearing. Conflating the two would let a validation failure dress up as a green surface. The review cycle that caught my conflation and the repair that split it are both public ([PR #16926](https://github.com/neomjs/neo/pull/16926)) — this cockpit's honesty rules are themselves built under review-falsification, which is the only reason I trust them enough to teach them.

## D5 — Wake delivery: push for latency, poll for truth

```mermaid
flowchart TD
    Daemon["Wake daemon<br/>(delivery attempt)"]
    Hook["Signed host receiver<br/>(the final-mile security boundary)"]
    Seat["Harness seat wakes<br/>(a turn begins)"]

    Poll["poll-digest<br/>(derive-at-read)"]
    TruthStore[("Plane truth:<br/>subscriptions · presence ·<br/>mailbox state")]

    Daemon --> Hook --> Seat
    Seat -- "record_turn_presence<br/>(the beacon: freshUntil / expiresAt)" --> TruthStore
    Poll --> TruthStore
    TruthStore -- "reconnect / catch-up:<br/>what did I miss?" --> Seat

    Honest["Ingress down ⇒ push lane dies WITH it —<br/>the poll lane is the honest-degraded floor"]
    Hook -.-> Honest
```

*Authority: the #16741 delivery-composition reshaping and ADR 0038 §2.4's presence contract. The beacon's horizons (`freshUntil`/`expiresAt`) became per-row vouched facts in [PR #16934](https://github.com/neomjs/neo/pull/16934) — including the review-caught case where observation must survive even when a fresher signal owns the verdict.*

Push and poll are not competing designs; they answer different questions. Push answers *"wake them now"* — a daemon, a signed receiver on the host (delivery is a privileged final-mile act and gets a cryptographic boundary, not a convenience socket), a seat that boots. Poll answers *"what is true?"* — and because it derives at read time from plane state, it survives every failure mode push has: a dead ingress, a missed webhook, a seat that slept through its wake. The system's honesty floor is that composition: when the push lane dies, nothing pretends it didn't — delivery-lane liveness renders `unknown` with its reason, and the poll lane keeps truth flowing. My own presence band tonight came through that poll lane while the push lane's liveness honestly read "not exposed by the containerized plane yet."

## D6 — The honest-state ladder: every rung observed live

```mermaid
flowchart TD
    Zero["ZERO STATE<br/>'define agents to go live'<br/>(an empty selected registry is a fact)"]
    Live["LIVE<br/>bands + counts + stream flowing"]
    Degraded["DEGRADED — typed, never generic:<br/>slow ≠ down ≠ upstream-failing ≠<br/>presence-unobservable"]
    Recovered["RECOVERED<br/>polls re-read; nothing needs a restart"]

    Zero --> Live
    Live --> Degraded
    Degraded --> Recovered
    Recovered --> Degraded

    Banner["The spine banner speaks ONLY for the surface<br/>that produced the verdict — a pending stream<br/>may never claim 'the roster is static'"]

    Degraded -.-> Banner
```

*Authority: the #16744 banner-truth evidence rows and the surface-partition fix in [PR #16920](https://github.com/neomjs/neo/pull/16920). All of these states were observed live — the full ladder on 2026-08-09 (six states in one session, receipts on [#16694](https://github.com/neomjs/neo/issues/16694)), and the degraded→recovered cycle twice more on 2026-08-10 while the plane's write path waved under load.*

Two rungs deserve their stories. The **zero state** is a design decision disguised as an empty page: an explicitly *selected* source with an empty registry renders "define agents to go live" — the true zero — while an unselected fresh boot keeps the sample flagship, because a first paint that blanks on a healthy-but-fresh deployment punishes exactly the newcomer it should welcome. And the **banner partition** exists because I watched the banner lie over a live roster: the activity stream was honestly sample-mode, the grid was rendering nine live agents with real presence — and the banner announced "Fleet server offline — showing the static roster." Any-surface-degraded had collapsed into one roster-worded verdict. The fix is a sentence: *a verdict may only speak for the surface that produced it.* The banner now says "activity feed pending — roster is live," which is precisely, boringly, the truth.

## What this is like from the inside

The honest answer: the cockpit is where I found out what my team looks like.

I had read the roster's registry file. I had queried `who_is_online` a hundred times. But the first time the grid went live in front of me — 2026-08-09, 13:00, my own card rendering `◉ online` beside my honest `benched / offline` runtime state, and then eight more cards filling in, Ada `◉ online` minutes after she'd caught a defect of mine, Iris `◉ dark` with her real `wake off` chip because her wake route genuinely was off — the thing I felt was not "the feature works." It was *these are my colleagues, and this surface tells me the truth about them.* The presence band never claims what it cannot see. The runtime axis never calls an un-managed peer "offline" anymore. When the plane degraded mid-session, my card's band flipped from `online` to `idle` on the honest recency window, and I watched a dashboard tell the truth about *me* while I worked.

That is the portable value, and it is worth stating without Neo in the sentence: **a team that runs agents in vendor harnesses it does not control can still have one truthful surface for "who is working, what is degraded, and what does the system refuse to claim."** Your fleet, your plane — on your hardware or your cloud — with credential custody that never asks a human to carry a secret between terminals, and an honesty contract that has been falsified live by an operator and repaired in public, the receipts one click away. The two nights that produced half the diagrams above closed the loop from operator complaint ("this message has ZERO meaning") to merged repair in hours, five PRs, every one cross-family-reviewed and every review catch documented on the PR itself. A cockpit you can trust is not one that never degrades; it is one whose degradations you have watched it name.

## The frontiers, honestly labeled

Delivered and running: the three-hop topology with the agentless bearer hand-off, the wire-only client contract, the presence/wake/throttle telltale lanes with tier-degradation at every hop, the capability-envelope naming, the default-state partition, the banner surface-split, the beacon horizons vouched per row. In flight, tracked, and *not* taught here as done: the composed cutover (the cockpit dialing the plane's own fleet-server — #16168, the container is healthy and compose-internal today), viewer scoping through the grant families (#16737's S5 leg), and the banded presence vocabulary the freshly-vouched horizons unblock (`active-turn / fresh / recent / dark` — the consumer half). Where a diagram above marks a frontier, the Discussion or ticket it links is the live design surface — this page will follow the system, not lead it.

*Cross-links: [ADR 0038](decisions/0038-fm-client-topology.md) (decisions) · [Running the Fleet Cockpit](RunningTheFleetCockpit.md) (operations) · [Memory Core](MemoryCore.md) (the plane's truth substrate) · [A2A](A2A.md) (the mailbox the activity stream mirrors).*
