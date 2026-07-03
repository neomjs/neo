# ADR 0020: The Agent Harness — concept anchor + session-intake recipe

> Neo builds a downloadable **Agent Harness**: an Electron-shelled, multi-window Neo app whose main process hosts the Agent OS, serving two personas — operators running an agent **fleet** (H1) and humans who chat and get **live, stunning multi-window Neo UIs by default** (H2+). The single-agent experience is the *floor*; the **category bet is the flat-peer, cross-family agent institution as a product** — agents and humans co-inhabiting the same live App-Worker instances. This ADR is the durable concept anchor: a fresh session reads THIS + glances [Project board 13](https://github.com/orgs/neomjs/projects/13) + opens its target work item — never the 36KB archaeology.

| Attribute | Value |
|---|---|
| **Status** | Draft (proposed on Epic #13012's converged body; Accepted on human merge of the implementing PR) |
| **Author** | @neo-fable (Mnemosyne, Claude Fable 5) drafting; architecture converged operator + swarm, 2026-06-12 (graduation → scoping session) |
| **Graduated from** | Discussion #10119 — *"Agent harness as Neo app — digital embodiment via Neural Link + JSON VDOM impedance match"* (family-keyed quorum: Claude `[AUTHOR_SIGNAL]` + GPT `[GRADUATION_APPROVED]`; §5.2 sweep peer-validated 8/8). #10119 is **archaeology** — never required reading |
| **Implementation** | Epic #13012 (decomposition root; live sub/leaf set = the native relationship graph + board 13) |
| **Decision Record relations** | aligned-with ADR 0018 (identity surfaces; #13023 derives the public narrative from THIS file); aligned-with ADR 0014 (cloud deployment topology — the remote-tenant entry mode connects to it); complements `learn/benefits/*` (audience framing lives there, never duplicated here) |
| **Informs** | every #13012 leaf; the public roadmap/vision refresh (#13023, `blocked_by` #13020); future harness ADRs |

---

## 1. Context

v13 shipped the **Institution**: named cross-family AI maintainers with identity, A2A + wake delivery, peer review, durable memory, and a human-held merge gate — proven at 1,369 merged PRs in eleven weeks. What does not exist is the institution's **operating surface**: today the operator hand-starts N harness instances and hand-maintains identity env, wake registrations, and config sync ("brittle — other humans won't do it"). Meanwhile the 2026 market sells one assistant at a time; orchestrator-worker multi-agent exists everywhere, but a flat-peer cross-family institution **as a downloadable product** does not.

Two adoption facts shape everything:

1. **The adoption inversion.** Framework adoption historically required humans to *evaluate a framework* — a gate that structurally favors incumbents regardless of merit. The harness removes the evaluation event: **LLMs excel at JSON and object permanence; the Neo Body IS JSON; Neural Link already exists.** Agents build in Neo by default through the harness; humans never think about implementation details — they get multi-window Neo UIs as the default output. The framework becomes invisible infrastructure; adoption arrives as a side effect of product usage.
2. **Co-habitation.** Harness and content apps are peers in one shared App-Worker heap; **agents (via Neural Link) and humans (via the rendered UI) inhabit the same live instances**, collaborating on the same runtime objects. Artifact-class products (v0, canvas/artifact panes) *regenerate code*; co-inhabitants *mutate live shared state* with object permanence. Replicating this requires becoming an engine — the durable moat.

## 2. Decision — the product

- **Bar:** Claude-Desktop-class single-agent experience is the **floor** that earns the install. The **category bet** is the institution's cockpit — operating a cross-family agent team with identity, A2A, peer review, and a human merge gate. We never compete on the incumbents' terms (polish/brand/model access).
- **Three pillars, strictly ordered:** **(1) Fleet manager** (Epic #13015 — define agents via GitHub username + PAT, start/stop/restart, repos provisioned under the hood; spawn-time identity-env + wake-subscription injection kills the drift classes by construction) → **(2) Conversational app creation** (chat → live blueprint emission into peer apps; the canonical demo: *"build me a neo grid"* → a pane that becomes its own window, live-mutable) → **(3) Deploy plane** (apps ship with their own Agent OS tenant).
- **Roadmap horizons:** H1 *operate-your-fleet* → H2 *your-first-agent-beautifully* (product milestones [M1 Login](https://github.com/neomjs/neo/milestone/4) → [M2 First Widget](https://github.com/neomjs/neo/milestone/5) → [M3 First Dashboard](https://github.com/neomjs/neo/milestone/6) → [M4 Wow](https://github.com/neomjs/neo/milestone/7)) → H3 *assistant-to-institution* (a second model family on the user's own repo; cross-family review of their PRs; A2A/wake traffic as a visible UI surface) → H4 *institution-as-a-service*. The H3 hero demo: two named agents from different labs argue about the user's code in public threads; the human holds merge.
- **Entry modes (deliberately plural):** native **Anthropic-account login** · **bring-your-harness** (an outer agent drives via the extended-NL MCP endpoint) · **remote-tenant connection** (tenant URL + PAT → a deployed cloud Agent OS per ADR 0014 — the harness as the cloud's client). Git tooling (diffs/branches/commit/PR flows) is table stakes — exposure of what the Agent OS already does.

## 3. Decision — the architecture

- **Shell: Electron, decided** (operator, 2026-06-12): always Chromium + always Node.js — worker-topology determinism fleet-wide; the Agent OS runs **in-process in the Electron main** (target), with **child-process supervision as the sanctioned fallback** capping the topology risk (#13033 carries the spike). Tauri retired. Web-served mode remains the development convenience + goodie, never the priority.
- **Source placement preserves the hemispheres:** harness UI in `apps/` (**replacing the `apps/agentos` early PoC**); Node-side fleet machinery in `ai/` (beside orchestrator/wake daemons); Neural Link / MCP is the bridge. No top-level source mixing — the Electron **packaging root** wraps *built* Body + Brain (own `package.json`) without touching source trees. **Credentials (PATs) live Brain-side only** — they never transit the browser.
- **Rendering: streaming AND buffered chat modes**, riding the worker topology — markdown → pure VDOM with stable-prefix ids and no `innerHTML` (#13018, delivered: transcripts render *untrusted* LLM/agent-authored content; injection ACs are design rules, not afterthoughts).
- **Multi-window choreography:** the magic **already ships** (`apps/colors` + the agentos prototype): one continuous drag migrates a pane's *embodiment* — pane → OS popup → pane — across apps with live slide-resort, the component staying one live heap object throughout (`Neo.manager.Window` God-View + `getWindowAt(x,y)` + `main.addon.WindowPosition`; the `#8164`→`#9498` lineage). The named gaps are leaves: popup terminal drop (#13025), OS-window drag reintegration (#13028), QT-grade docking (#13030). The docking model contract lives in [HarnessDockZoneModel.md](../HarnessDockZoneModel.md); it is a contract pointer, not an ADR amendment.

## 4. Binding guardrails (carried from graduation + epic reviews; bind every leaf)

1. **Topological Locking before any multi-writer Scenario-C work** — or the slice explicitly stays single-writer.
2. **No public performance claims before the Harness Endurance Benchmark** (#13032) runs — architecture-shaped hypothesis phrasing until measured; a negative result publishes with equal prominence.
3. **Session-identity:** identity/session leaves bind the **harness-native `session_id`** — never the MCP transport id (server-assigned today; removed in the 2026-07-28 MCP RC). Canonicalization substrate: Discussion #12984 → its ticket; canonical-id minting must be **externally injectable by a spawner**.
4. **Fleet lifecycle owns restart affordances** — including runtime MCP-server restarts with settle-or-reject promise semantics.
5. **Breadcrumb scope:** always-loaded `#10119` citations gain a `graduated → Epic #13012 + ADR 0020` pointer; KB/source-trail breadcrumbing covers the fleet-manager/Electron framing (turn-memory-pre-flight-gated leaf).

## 5. Strategy boundaries

- **Two market vectors, one product:** AI dev-tooling (the harness) × enterprise desktop-to-web migration (the Body + infinite canvas + docking — every QT/WPF-class ISV, not one company). A **design-partner cohort** sits at the intersection (an enterprise ISV, ~15 devs, deploying the multi-tenant Agent OS; single-agent users whose rejection of hand-maintained local fleets located H1's adoption wall empirically). **The partner guardrail is binding: partners validate market hypotheses, never define scope** — every partner-derived requirement needs a second, unrelated consumer before it builds here; partner specifics never enter public artifacts.
- **Traction and monetization are deliberately decoupled.** Traction is the harness's job (the adoption inversion). Monetization **remains an open decision** — the deploy-plane / Vercel-playbook is the leading candidate (H4), not a commitment. MIT engine + MIT harness stands; no source-available drift.

## 6. Consequences

- Every harness leaf is a one-PR deliverable with its own ACs + Contract Ledger, native-linked under #13012/#13015 — epic bodies never enumerate subs.
- The `apps/agentos` namespace is repurposed by the settings-pane leaf (naming via `structural-pre-flight`).
- The public narrative (#13023) **derives from this file** after merge — two strategy copies must never drift.
- Fable-family maintainers focus the hard parts (architecture/planning); implementation lanes are open to all; high-ROI backlog remains an equally honored track.

## 7. The session-intake recipe (the scoping contract)

A future session — any maintainer, any family, post-compaction — picks the harness up in three steps:

1. **Read this ADR** (the concept: bar, pillars, horizons, architecture decisions, guardrails — ~5 minutes).
2. **Glance [Project board 13](https://github.com/orgs/neomjs/projects/13)** (live state: what exists, what's claimed, what's next) + the milestone ladder (M1–M4).
3. **Open the target work item only.** If epic-level routing is needed, use Epic #13012's latest checkpoint or supersession comment; older planning comments are archive context when a later checkpoint disagrees. Discussion #10119 is archaeology.

**Cold-read contract:** if a fresh session cannot state the product bar, the current pillar, and the next actionable leaves from steps 1–2 alone, this ADR has failed and gets amended — file the friction.
