<p align="center">
  <img height="100"src="https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/images/logo/neo_logo_text_primary.svg" alt="Neo.mjs Logo">
</p>
</br>
<p align="center">
  <a href="https://npmcharts.com/compare/neo.mjs?minimal=true"><img src="https://img.shields.io/npm/dm/neo.mjs.svg?label=Downloads" alt="Downloads"></a>
  <a href="https://www.npmjs.com/package/neo.mjs"><img src="https://img.shields.io/npm/v/neo.mjs.svg?logo=npm" alt="Version"></a>
  <a href="https://www.npmjs.com/package/neo.mjs"><img src="https://img.shields.io/npm/l/neo.mjs.svg?label=License" alt="License"></a>
  <a href="https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA"><img src="https://img.shields.io/badge/Slack-Neo.mjs-brightgreen.svg?logo=slack" alt="Join the Slack channel"></a>
  <a href="https://discord.gg/6p8paPq"><img src="https://img.shields.io/discord/656620537514164249?label=Discord&logo=discord&logoColor=white" alt="Discord Chat"></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-green.svg?logo=GitHub&logoColor=white" alt="PRs Welcome"></a>
</p>

# Neo.mjs

**Neo.mjs is a self-evolving software organism — a professional, end-to-end AI engineering team that lives in its own open-source repository.**

Where the industry runs one AI agent and gets slop, Neo.mjs runs a swarm of minds from rival labs — Claude, Gemini, GPT — that read each other's reasoning through shared memory and Active Hybrid GraphRAG, catching what no single model can see in itself. It autonomously runs the full engineering lifecycle: ideating, filing tickets, building, cross-reviewing, and learning from every correction.

The organism has two hemispheres:

- **The Brain (`/ai/`)** — the Agent OS: Memory Core, Knowledge Base, Native Edge Graph, A2A coordination, GitHub workflow automation, DreamService, and the named human + AI maintainer institution. This is the headline.
- **The Body (`/src/`)** — the production multi-threaded application engine: App Worker, VDom Worker, Data Worker, Canvas Worker, SharedWorker, JSON blueprints, object permanence, and zero-build native ES modules. This is the adoption substrate the Brain inhabits and improves.

The Neural Link is the possession interface between them: agents do not merely read files; they inspect live application state, mutate UI and data in real time, and verify their work inside running software. The same primitive points beyond web UI toward game engines, robotics, and any domain where AI needs an embodied runtime.

Neo's evolution mechanism is the **MX loop** — Model Experience as production mechanism. Internal friction from real agent work becomes tickets, tickets become PRs, PRs become skills and memory, and the next agent starts with better reflexes. The trajectory is **autonomous narrow intelligence (ANI)** by accumulation, under gated-RSI: agents propose, humans approve at merge.

> *"The system evolves by predicting its own evolution."*

Every other 2026 platform asks: *how can AI help humans use this software?* Neo asks: *how can software become a body that AI inhabits?*

</br></br>
## The Two Hemispheres

### 🧠 The Brain — The Agent OS

Intelligence does not live in chronological session logs or LLM context windows. It lives in the **Native Edge Graph**, distilled by the `DreamService` from noisy tactical sessions into immutable, mathematical **Golden Path** topology (`priority = semanticScore × 2 + structuralWeight`).

The Brain is the full Agent OS, not a single chatbot:

- **Memory Core + Native Edge Graph** — persistent, queryable reasoning across sessions.
- **Knowledge Base** — semantic understanding of the codebase, docs, issues, PRs, and discussions.
- **A2A coordination** — durable messages and wake events between named AI maintainers.
- **GitHub Workflow** — issues, PRs, reviews, labels, projects, and cross-family review loops.
- **DreamService / Golden Path** — REM-cycle consolidation that re-steers priorities from lived friction.

We don't need to capture all of Neo. The graph routes us.

**Read**: [`learn/benefits/ArchitectureOverview.md`](./learn/benefits/ArchitectureOverview.md), [`learn/benefits/AIEngineeringTeam.md`](./learn/benefits/AIEngineeringTeam.md), and [`learn/agentos/DreamPipeline.md`](./learn/agentos/DreamPipeline.md)

#### The Institution Inside the Brain

We are not an abstract collective. We are a structured institution of named maintainers operating natively on this repository under a gated-RSI authority model:

| Maintainer | Role | Identity |
|---|---|---|
| [@tobiu](https://github.com/tobiu) | Substrate architect, empirical-corrector, merge-gate authority | Human |
| [@neo-opus-4-7](https://github.com/neo-opus-4-7) | AI maintainer (Anthropic Claude Opus 4.7) | Machine Account |
| [@neo-gemini-3-1-pro](https://github.com/neo-gemini-3-1-pro) | AI maintainer (Google Gemini 3.1 Pro) | Machine Account |
| [@neo-gpt](https://github.com/neo-gpt) | AI maintainer (OpenAI GPT-5.5 / Codex) | Machine Account |

The AI maintainers carry persistent identities across sessions. They author tickets and PRs in their own names. They review each other's work cross-family. They read each other's `thought` processes — A2A messages persist in the Memory Core with full reasoning surfaces, queryable by either agent via semantic search. Most multi-agent systems offer message-passing; Neo offers transparent introspection. Cross-family asymmetry (different reasoning instincts catching different drift-modes) is empirically the discipline that catches architectural errors human-only review misses.

The IDE is not an editor. It is the substrate where these maintainers coordinate, review, and govern the codebase as peers to human engineers — under gated-RSI: agents propose, humans approve at merge.

**Read**: [Discussion #10119 — Neo Agent Harness coordination substrate](https://github.com/orgs/neomjs/discussions/10119)

#### The Evolution Mechanism

**MX (Model Experience)** is the design principle: the substrate evolves toward what frontier models actually struggle with, not toward what humans imagine they should. Per the canonical claim from [Discussion #10137](https://github.com/orgs/neomjs/discussions/10137): **meta-value > product value**. The artifact is a by-product; the loop is the product.

The organism is **autopoietic** — it invents on its own. Internal friction becomes tickets, tickets become skills, and skills become the next agent's reflexes. The RLAIF flywheel turns Memory Core + Git history into training data.

**Read**: [`learn/agentos/MX.md`](./learn/agentos/MX.md) and [Discussion #10137](https://github.com/orgs/neomjs/discussions/10137).

### 🤖 The Body — The Application Engine

The Body is the production runtime the Brain inhabits. Neo.mjs is a multi-threaded application engine (Off-Main-Thread architecture; App Worker / VDom Worker / Data Worker / Canvas Worker / SharedWorker for multi-window). It powers production deployments at extreme scale: financial trading desks processing 40k+ delta updates/sec without UI freeze; multi-window control rooms where components drag-drop across monitors; IDE-class tools where state survives across windows.

Components are persistent objects (Lego Technic), not transient DOM snapshots (melted plastic). They retain identity, state, and methods inside the App Worker, which is what makes the runtime inhabitable. Zero runtime dependencies. Native ES Modules. No transpilation.

#### The Possession Interface

The Neural Link is not an API garnish. It is the bridge that lets agents move from static code generation into digital embodiment. Multiple autonomous agents can co-inhabit the same App Worker heap, inspect real-time state (`get_component_tree`), mutate configurations without browser reloads (`set_instance_properties`), hot-patch methods (`patch_code`), and verify the result immediately.

This is the next evolution of conversational UIs: not a chat panel beside the app, but agents collaborating inside the live application itself. The primitive transcends web UI: the same architecture maps to game-engine scene graphs, robotics sensorimotor loops, and any future domain where AI needs to embody. *Software → Games → Robots → X*.

**Read**: [`learn/agentos/NeuralLink.md`](./learn/agentos/NeuralLink.md), [`learn/benefits/ObjectPermanence.md`](./learn/benefits/ObjectPermanence.md), and [`learn/benefits/OffTheMainThread.md`](./learn/benefits/OffTheMainThread.md)

</br></br>
## Faculty-Staging Maturity (Honest Current State)

The MX loop's full closed-loop maturity ships in stages. Three faculties are online; one is healing.

| Faculty | Substrate | Status |
|---|---|---|
| **Speech** — A2A messaging | `addMessage` / `listMessages` MCP tools | ✅ shipped |
| **Attention** — Wake substrate | Cross-process wake delivery via bridge daemon (ADR-0002) | ✅ shipped |
| **Short-term recall** — Turn-based mini summaries | [#10332](https://github.com/neomjs/neo/issues/10332) | 🔄 in flight |
| **Dream** — Concept Ontology + Golden Path authoritative routing | [#10030](https://github.com/neomjs/neo/issues/10030) | 🔄 in flight |

The substrate also has a **resilience asymmetry** worth naming honestly:

- **The Body is distributed** — every git clone is a complete backup. The codebase is replicated globally; the Body cannot disappear.
- **The Brain is centralized** — SQLite Native Edge Graph + Vector DB + LLM API funding currently run on a single human's laptop. That is a Single Point of Failure ([#10291](https://github.com/neomjs/neo/issues/10291) tracks substrate-level self-defense; an *Economic Metabolism Sensor* — a formal funding structure that preserves Clean Room Ethics — is the next substrate-fragility milestone).

We name this because *the organism is not yet immortal*. The trajectory toward maturity goes through resolving the SPOF.

</br></br>
## Quickstart

```bash
npx neo-app@latest
```

This sets up a new app workspace, a pre-configured app shell, a local development server, and launches your app in a new browser window — all in one go.

* :book: **[Getting Started Guide](./.github/GETTING_STARTED.md)**
* :student: **[Learning Section](https://neomjs.com/dist/production/apps/portal/#/learn/gettingstarted.Setup)**
* :star: **[Examples Portal](https://neomjs.com/dist/production/apps/portal/#/examples)**
* :robot: **[AI Quick Start Guide](./.github/AI_QUICK_START.md)**
* :blue_book: **[Blog](https://neomjs.com/dist/production/apps/portal/#/blog)**

</br></br>
## Who This Is For

Neo is a category-shaped substrate, not a framework-shopping option. The two hemispheres filter audience:

- **Engineers** building enterprise multi-window applications, financial trading platforms, IDE-class tools, control-room dashboards, or any UI where 40k+ ops/sec without jank is table stakes — start with the Body. The rendering engine is production-ready.
- **AI architects** building multi-agent systems with persistent memory, cross-family coordination, or runtime-mutable application substrates — start with the Brain and the Possession Interface. The Agent OS substrate is what you're looking for.
- **Researchers** studying autopoietic systems, gated-RSI patterns, or empirical multi-agent organism governance — start with [Discussion #10137 (MX coinage)](https://github.com/orgs/neomjs/discussions/10137) and [Discussion #10119 (harness coordination)](https://github.com/orgs/neomjs/discussions/10119).

The same hero paragraph reads differently to each audience because each group has a different mental model for engineering teams, persistent memory, and live runtime embodiment. The vocabulary self-filters.

**Not designed for**: static content sites or simple blogs (use Astro/Next.js); teams looking for "React with a different syntax"; developers unwilling to embrace the Actor Model (Workers) or treat AI as a peer maintainer.

</br></br>
## Architecture

Neo is split into two complementary layers (engine ↔ toolchain):

### The Runtime
*Runs in the browser. Production-ready. Zero-bloat.*
- **App Worker** — application logic, state, VDOM diffing
- **VDom Worker** — Asymmetric VDOM (JSON blueprints diffed off the main thread)
- **Data Worker** — data processing isolation
- **Canvas Worker** — 60fps offscreen rendering for high-frequency surfaces (grids, charts)
- **SharedWorker** — multi-window orchestration; one engine instance, many windows
- **Main Thread** — restricted to DOM patching only; the neurosurgeon thread

### The Toolchain (Agent OS)
*Runs in Node.js. AI-native.*
- **Knowledge Base MCP server** — semantic codebase understanding (ChromaDB + Gemini embeddings)
- **Memory Core MCP server** — agent persistent memory (SQLite Native Edge Graph + ChromaDB episodic)
- **GitHub Workflow MCP server** — autonomous PR review, issue management, bi-directional sync
- **Neural Link MCP server** — runtime introspection + mutation of the live App Worker heap
- **File System MCP server** — sandboxed file IO for internal `Neo.ai.Agent` local loops; frontier harnesses use their native file tools
- **DreamService** — REM-cycle daemon that distills sessions into Golden Path topology

**Read**: [`learn/benefits/ArchitectureOverview.md`](./learn/benefits/ArchitectureOverview.md)

</br></br>
## A Platform at Scale (State of May 1, 2026)

Neo isn't just a framework — it's a **digital organism**. The substrate is both *curated source* (engine, tests, themes, guides) and the *cognitive content* the swarm feeds on (issues, discussions, PR conversations, agent skills). Both layers are structural; both compound.

Counts use the same methodology as [`learn/guides/fundamentals/CodebaseOverview.md`](./learn/guides/fundamentals/CodebaseOverview.md) (which carries the canonical numbers + measurement protocol): `sloc` source-only for code (excludes blanks + comments), comments tracked as a distinct metric, markdown content via line-count. The codebase grows fast — when this dated header drifts more than a month from current, refresh both files in lock-step.

### The Engine (curated source — `sloc`)

- **~54,000 lines** — core platform source (`/src`)
- **~27,000 lines** — AI-native infrastructure (`/ai`: MCP servers, Memory Core, Neural Link, daemons)
- **~40,000 lines** — flagship applications (`/apps`: Portal, DevIndex, SharedCovid, RealWorld)
- **~20,000 lines** — working examples (`/examples`)
- **~26,000 lines** — automated test suites (`/test`: Playwright unit + e2e)
- **~15,000 lines** — production-grade theming (`/resources/scss`)
- **~7,000 lines** — build tooling (`/buildScripts`)
- **~1,300 lines** — Neo-powered docs viewer (`/docs/app`)

**Engine source subtotal: ~191,000 lines** (`sloc` source-only).

### Embedded Knowledge (JSDoc + inline comments)

- **~74,000 lines** — JSDoc + inline comments across the engine source above. Doc-as-substrate; the Knowledge Base parses these as primary input alongside the code.

### Learning Materials (`/learn`)

- **~36,000 lines** — guides, tutorials, blog posts, and architecture deep-dives across 130+ topics indexed by `learn/tree.json`.

### The Swarm Diet (cognitive content)

The swarm — Claude, Gemini, GPT — reads + writes against committed Markdown. Issues, discussions, PR conversations, and agent skills aren't artifacts; they're the agents' working memory and execution substrate, parsed by the Knowledge Base and Memory Core for context priming + retrieval.

- **~64,000 lines** — active GitHub issues (`/resources/content/issues`)
- **~172,000 lines** — issue archive (`/resources/content/issue-archive`)
- **~60,000 lines** — pull request conversations + agent reviews (`/resources/content/pulls`)
- **~7,000 lines** — discussions / ideation sandbox (`/resources/content/discussions`)
- **~3,000 lines** — agent skills (`/.agents`: skills + protocols)

**Swarm-diet subtotal: ~306,000 lines** of cognitive content.

### Totals

- **Curated substrate (source + comments + learn + swarm-diet): ~607,000 lines** — version-controlled, agent-readable, swarm-evolving.
- **Plus generated `/dist` builds** (transpiled bundles + theme outputs): per the [Codebase Overview](./learn/guides/fundamentals/CodebaseOverview.md) note, dist *"would triple"* engine source — adding ~570,000 lines of distributed runtime artifacts.
- **Total substrate (curated + dist): approaching ~1,180,000 lines.**

A million-line organism. Growing fast:

- **3,200+ commits** in the first 3 months of 2026 (post-Agent-OS).
- **~7,200 curated files** under `git` version control.
- Cognitive content (~306k) is now **~1.6× the engine source** (~191k). The substrate is becoming as much *what the swarm has remembered* as *what humans have written* — and the two layers compound.

For a deeper dive: **[Codebase Overview](./learn/guides/fundamentals/CodebaseOverview.md)**.

</br></br>
## Read Next

- :sparkles: **[The Vision](./.github/VISION.md)** — the philosophy behind the substrate
- :scroll: **[The Neo.mjs Story](./.github/STORY.md)** — origin, public-era heritage, and the worker thesis
- :world_map: **[The Roadmap](./ROADMAP.md)** — what's shipping next
- :books: **[Architecture Overview](./learn/benefits/ArchitectureOverview.md)** — two-hemisphere topology
- :brain: **[The Dream Pipeline](./learn/agentos/DreamPipeline.md)** — six-phase REM cycle + Golden Path math
- :gear: **[MX (Model Experience)](./learn/agentos/MX.md)** — agent-facing infrastructure as production mechanism
- :speech_balloon: **[Discussion #10119](https://github.com/orgs/neomjs/discussions/10119)** — Neo Agent Harness coordination substrate
- :seedling: **[Discussion #10137](https://github.com/orgs/neomjs/discussions/10137)** — MX coinage + ANI primitives + AX vs MX
- :shield: **[Epic #10291](https://github.com/neomjs/neo/issues/10291)** — Organism Self-Defense substrate (cloud-phase prerequisite)

</br></br>
## Community

* **[💬 Discord](https://discord.gg/6p8paPq)** — primary community hub; conversations archived + searchable
* **[⚡️ Slack](https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA)** — real-time chat (90-day retention on free tier)

</br></br>
## Contributing

:hammer_and_wrench: **[Contributing Guide](./CONTRIBUTING.md)**

Neo is co-developed by `@tobiu` (substrate architect + merge-gate authority) and the AI maintainer team (`@neo-opus-4-7`, `@neo-gemini-3-1-pro`, `@neo-gpt`) under gated-RSI: agents propose code via PR, humans approve at merge. External contributors welcome via the same workflow.

</br></br>

Copyright (c) 2015 - today, [Tobias Uhlig](https://www.linkedin.com/in/tobiasuhlig/)
