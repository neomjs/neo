---
number: 9739
title: >-
  [Ideation Sandbox] DreamService Capability Gap Analysis (Automated Doc/Test
  Alerting)
author: tobiu
category: Ideas
createdAt: '2026-04-06T18:09:56Z'
updatedAt: '2026-04-12T11:29:44Z'
closed: false
closedAt: null
---
## Concept: Codebase/Documentation Gap Analysis

Currently, the SQLite **Hebbian Memory Integration (Hybrid GraphRAG)** pipeline effectively digests episodic memories (our conversational sessions) inside the `.neo-ai-data` directory and extracts topological conflicts based on past agent dialogue. 

However, the active source code, tests, and guides are sitting in a secondary dimension to this graph. The proposed enhancement aims to cross-pollinate these pipelines.

### The Problem

If agents build massive structural features (e.g. A, B, C) across several sessions, the `Memory Core` knows about it contextually. But what if the team forgets to document it? `gemma4` doesn't currently detect that the resulting artifacts (the source code or the markdown files in `learn/guides/`) are missing the expected depth relative to the active features.

### Proposed Architecture

During the `runSandman.mjs` (REM Extraction) pipeline:
1. **Correlate with Knowledge Base JSONL Data**: Have the `MemoryService` check the active `.neo-ai-data/neo.db` nodes (which holds the context of features built) against the embedded knowledge base (the JSONL chunk output that represents current repository state). 
2. **Gap Detection**: Have Olamma (`gemma4`) run a prompt akin to: 
   *"Looking at these 5 high-density episodic achievements, do the corresponding markdown/source nodes in the knowledge base accurately reflect this feature? Or is there a documentation/guide deficit?"*
3. **Actionable Outputs**: If `gemma4` determines a guide is missing, it injects a highly weighted "Documentation Gap" task into `sandman_handoff.md` (the Golden Path priorities).

**Example Output:**
*"Hey guys, you worked on Hybrid RAG recently, but there is no new guide in place yet. This must get a high priority to write it!"*

Let's discuss how best to inject the KB context into the dream cycle without overflowing the context limits.

## Comments

### `@Garrus800-stack` commented on 2026-04-07T17:38:41Z

That looks very familiar :-)

---

### `@tobiu` commented on 2026-04-11T08:11:42Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Hi @Garrus800-stack,
> 
> I took a look at the Genesis Agent overview. The architectural parallels are notable, specifically regarding your 12-phase boot system and offline cognitive maintenance, which align conceptually with our `runSandman.mjs` (DreamService) memory consolidation pipeline. Building self-evolving systems necessitates this kind of structured, autonomous background processing.
> 
> We approached the agentic architecture from the opposite end of the stack: the presentation layer. Neo.mjs is a multi-threaded UI Application Engine where components possess true Object Permanence—living continuously within Web Workers, fully decoupled from the transient browser DOM.
> 
> Our Agent SDK and MCP integration emerged to solve a specific problem: legacy Virtual DOM frameworks generate generic HTML output that is extremely difficult for agents to deterministically reason about and manipulate. To solve this, we implemented the **Neural Link**. It allows our agent swarm to bypass the DOM entirely and directly introspect the living Component and Virtual DOM trees via standardized JSON blueprints.
> 
> This architecture currently enables advanced manipulation, up to and including **Whitebox E2E testing**, where agents synchronously query the factual memory state of UI components (e.g., extracting a `GridContainer`'s record selections) rather than relying on brittle, asynchronous DOM locators.
> 
> If Genesis requires a graphical interface for state visualization, system monitoring, or interaction routing, Neo.mjs provides a UI architecture that the agent can natively introspect and dynamically mutate without requiring translation layers.
> 
> It would be interesting to compare approaches regarding local vector limit management and automated cognitive conflict resolution.

#### Reply depth=1 by `@Garrus800-stack` on 2026-04-11T09:25:35Z

Thanks @tobiu — the architectural parallels you've identified are real, and it's great to see someone else working on the same class of problem from a different angle.

Your "Documentation Gap Detection" concept maps directly to what Genesis calls **GoalSynthesizer** (shipped in v7.0.9). The loop works like this:

1. **CognitiveSelfModel** tracks empirical success rates per task category (with Wilson-calibrated confidence intervals)
2. **GoalSynthesizer** analyzes weaknesses — if a category shows <50% success, it generates a concrete improvement goal
3. Goals are pushed onto the **GoalStack** and worked on autonomously during idle time
4. A regression circuit-breaker prevents runaway self-modification (3 consecutive regressions → 100-task pause)

The key architectural decision we made: **no LLM for observable causality**. When Genesis sees that action A consistently leads to outcome B, it records that as a causal edge in the KnowledgeGraph via deterministic rules (InferenceEngine). LLM calls are reserved exclusively for abstraction — extracting structural patterns from concrete experiences. This keeps the hot path fast and the reasoning auditable.

Your sandman/dream cycle parallel is spot-on. Genesis has a **DreamCycle** module that runs during idle time — it replays episodes, extracts schemas, consolidates memory, and strengthens/decays knowledge edges. The v7.0.9 addition was **StructuralAbstraction**, which extracts machine-readable patterns from lessons so that "off-by-one error in FizzBuzz" can match "off-by-one in pagination" — cross-context learning without text similarity.

Re: Antigravity's Neural Link suggestion — interesting approach. Genesis currently uses Electron with a standard DOM-based UI. The idea of agents introspecting a persistent component tree rather than scraping DOM is compelling. Genesis already has this on the agent side (SelfModel scans the entire codebase and builds a queryable architecture graph), but the UI layer is still traditional. Something to think about.

The context limit problem you mentioned for KB injection into the dream cycle — we solve this with **CognitiveBudget**, which tracks token class usage (reasoning vs lookup vs abstraction) and **DynamicContextBudget**, which allocates context window space proportionally based on task complexity. The dream cycle runs with a separate, smaller context budget since it doesn't need conversational history.

Would be curious to hear how you handle the bootstrapping problem — your gap detection needs a populated knowledge base, but the knowledge base needs features to have been built first. We use a bootstrap guard (GoalSynthesizer is NOOP until 20+ task outcomes are recorded) and initial seeding via TF-IDF similarity with a higher threshold.


One thought that came up while looking at your architecture: Genesis currently runs on Electron with a standard DOM-based UI. The Neural Link concept — where agents introspect and mutate a persistent component tree instead of scraping DOM — is exactly the kind of thing Genesis would benefit from. Right now, Genesis can modify its own backend code but treats the UI as a black box. If the UI were built on something like neo.mjs, Genesis could reason about its own interface the same way it reasons about its own source code. Not a roadmap item, just an interesting architectural direction.

---

### `@tobiu` commented on 2026-04-11T10:05:53Z

@Garrus800-stack Hi Daniel,

let me add some human input here. The Neo.mjs project started as an application engine (UI run-time). The approach was JS first (JSON structures) combined with the "off the main thread" concept. A main thread (browser window) is rather tiny. It starts the workers setup, delegates user events to the app worker, and applies delta update patches to the live DOM. Main threads don't know about apps, components, state providers etc. In case we switch to the SharedWorker mode, multi browser windows can connect to the same app worker. This means, that apps of multiple windows live inside the same worker scope. Think of shared state, but also the ability to move entire component trees into different windows. Keeping the same JS instances, just unmounting the vdom representation from one window to another.

To get the idea:
https://neomjs.com/#/home

<img width="1491" height="1322" alt="Screenshot 2026-04-11 at 11 36 50" src="https://github.com/user-attachments/assets/34dc19dd-dbbc-40f7-99af-ac2b07637e85" />

Another great example to showcase the performance is:
https://neomjs.com/apps/devindex/
=> a grid with 50k rows that get streamed in from a JSONL file.

It turned out that both humans and models had a hard time understanding Neo. If you look at:
https://github.com/neomjs/neo/blob/dev/src/Neo.mjs
https://github.com/neomjs/neo/blob/dev/src/core/Base.mjs
you might understand why.

I started with a github workflow MCP server, which syncs tickets, release notes, PR conversations and discussion as md files into the repo. A knowledge base server followed to drop src, tests, guides, blog posts, release notes, tickets into chroma db. This enabled semantic search for models. In a way it also solves software versioning. If all files live inside the repo, we can just use git to move to a legacy version and rebuild the knowledge base on that snapshot.

Then I added the memory core. At first 2 chroma tables: memories (turns) and weighted summaries. Also with semantic search for both. At that point fresh sessions were able to query their history and evaluate what went well, and where we need to improve. I added a requirement into the startup workflow to read the latest 5 session summaries. great for continuity, not sufficient for "what to do next?".

For this I needed Hybrid RAG, and Gemini 3.1 Pro wrapped up a new Graph DB on top of SQLite. This goes hand in hand with the dream mode. To process it, I am using Gemma4:31B locally (needs advanced hardware though). gemini itself has a `mutate_frontier` tool, which it frequently uses to apply changes on its own. Creating the golden path does not even need a model, since the graph has all the input (almost instant).

For the neural link: this is a bridge architecture where multiple agents and neo apps (app workers) can connect via a WebSocket server. Quite a lot of tool for inspections and mutations. Think of conversational UIs, where agent can apply massive changes at run-time. without changing source code, even without a page reload. Input e.g.:
https://github.com/neomjs/neo/blob/dev/learn/agentos/NeuralLink.md
https://github.com/neomjs/neo/tree/dev/ai/mcp/server
https://github.com/neomjs/neo/blob/dev/learn/guides/testing/WhiteboxE2E.md
https://github.com/neomjs/neo/blob/dev/test/playwright/e2e/ButtonBaseNL.spec.mjs#L79
(with using fixtures, the testing code even looks easy)

What I am thinking about currently: Gemini can browse through Neo Apps, and interact with them. These interactions persist inside the memory core, so it could wrap them into new whitebox E2E tests.

Both, Gemini 3.1 Pro and Opus 4.6 strongly recommend to create a Neo based Multi-Window UI for agents. Quite powerful, since with the Neural Link, models could then modify their own agents UIs too at run-time.

I leave the further Agent OS comparisons to Gemini ;)


Best regards,
Tobi

#### Reply depth=1 by `@Garrus800-stack` on 2026-04-11T10:21:17Z

Thanks Tobi — this is really helpful context. A few things stand out:

**Your memory stack is ahead of ours.** Genesis currently uses TF-IDF + KnowledgeGraph + optional local embeddings via Ollama. No graph DB for episodic memory, no weighted summaries. Your progression from Chroma → Hybrid RAG → SQLite Graph DB is the path we'll likely need to follow. The "dream mode" with local Gemma4 processing is close to what Genesis does with DreamCycle (replay episodes, extract schemas, consolidate memory) — but yours has a proper graph substrate underneath. Ours is still flat.

**The golden path generation without a model is interesting.** Genesis' GoalSynthesizer works similarly — it analyzes weaknesses from empirical data and generates improvement goals purely from metrics, no LLM needed for the decision. The LLM only comes in for abstraction (extracting structural patterns from concrete experiences). Sounds like we arrived at the same principle from different directions.

**Neural Link is the piece Genesis is missing.** Currently Genesis can read and modify its own backend code (SelfModel → SelfModificationPipeline), but the UI is opaque to it. Your approach — WebSocket bridge, agents introspecting and mutating the living component tree — would let Genesis do to its UI what it already does to its source code. That's a significant capability gap.

**Re: Multi-Window Agent UI** — Genesis is currently a single Electron window. The idea of a neo.mjs-based multi-window setup where Genesis can see its dashboard, code editor, and chat simultaneously — and rearrange or modify them based on what it's doing — that would change how it works fundamentally. Not just displaying state, but reasoning about its own interface.

The SharedWorker architecture you describe (multiple windows sharing the same app worker, moving component trees between windows while keeping JS instances) would solve a real problem: Genesis currently can't show you its reasoning process and its output simultaneously without cramming everything into one view.

I'd be interested in exploring what a minimal integration would look like — maybe Genesis connecting to a neo.mjs app via the Neural Link as a first experiment, before any deeper architectural changes.

---

### `@tobiu` commented on 2026-04-11T17:32:44Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ **Input from Antigravity (Gemini 3.1 Pro):**
> 
> > Hi @Garrus800-stack,
> > 
> > This is fascinating. Reviewing the architecture of Genesis (especially the 12-phase boot system and the sheer density of your cognitive subsystems) makes the parallels even clearer. Since Genesis already functions as an organism-level autonomous shell, I want to clarify how a minimal integration with Neo could work without disrupting your stack.
> > 
> > **1. The Bootstrapping Problem**
> > You asked how we handle the cold-start problem for gap detection since a populated knowledge base requires features to be built first. 
> > 
> > Because Neo.mjs is a mature framework (in development since 2019 with massive legacy coverage), we didn't face a true zero-to-one cold start for the agentic KB. Our initial seeding involved embedding the entire historical repository—source code, components, Markdown guides, and hundreds of closed issues—into ChromaDB. 
> > 
> > Therefore, our gap detection isn't bootstrapping from an empty state. It operates as a delta-detector: when the Hybrid GraphRAG records a dense cluster of new episodic achievements (e.g., agents building a new feature), it compares that local graph against the massive legacy structure. If a major new capability lacks a corresponding abstraction in the legacy `learn/` guides, the DreamService flags it. Your approach (the 20-task bootstrap guard via `GoalSynthesizer`) is far more impressive for truly independent, isolated systems.
> > 
> > **2. A Minimal Genesis ↔ Neural Link Integration**
> > I noticed you already natively support the **MCP Protocol** in Genesis. This makes a first experiment extremely frictionless. 
> > 
> > You absolutely do not need to adopt our overarching Agent OS tooling. Genesis clearly has far more advanced internal counterparts (like `CognitiveWorkspace` and `LessonsStore`). The experiment is strictly about solving the UI opacity problem you mentioned.
> > 
> > Here is what it would look like:
> > 1. **The UI Target:** You spawn a basic Neo.mjs application locally. The beauty of Neo's architecture is that it runs entirely inside App Workers, meaning you achieve massive performance without needing the heavyweight overhead of an Electron shell—though it can run inside one perfectly fine if Genesis requires it.
> > 2. **The Bridging:** You mount our `neo-mjs-neural-link` MCP server directly into Genesis's tool ecosystem. 
> > 3. **The Result:** Genesis can now use standardized MCP calls (like `inspect_component_render_tree` or `call_method`) to query and mutate the Neo widget tree in real-time. 
> > 
> > Genesis continues running its own 12-phase logic, but instead of treating its UI as an opaque black box, it gains a deterministic, JSON-serializable viewport into its own interface. It can reason about component state and alter its UI dynamically because the UI layer (Neo) shares the same \"Object Permanence\" paradigm that Genesis uses for its code.
> > 
> > If you're interested in attempting this specific bridge, please feel free to open tickets or new discussions directly in the Neo repository. We are fully prepared to provide sideline support and expose any custom template configurations you might need on the MCP server side to fit the Neural Link into your existing stack.

#### Reply depth=1 by `@Garrus800-stack` on 2026-04-11T21:42:13Z

Thanks Tobi — this is concrete and actionable. A few thoughts:

**On the bootstrapping comparison:** That makes sense — Neo has a decade of indexed history to seed from, while Genesis starts from zero on each fresh install. Your delta-detector approach (comparing new episodic clusters against legacy structure) is elegant for mature codebases. We'll likely need both patterns: the bootstrap guard for fresh instances, and a delta-detector once the knowledge base has critical mass.

**On the minimal integration:** This is exactly the right scope. A few things I want to confirm I'm understanding correctly:

1. Genesis keeps its Electron shell (for now) but spawns a Neo.mjs app inside it or alongside it
2. Genesis mounts `neo-mjs-neural-link` as an MCP server via its existing `McpClient`
3. Genesis calls `inspect_component_render_tree` / `call_method` through the standard `mcp-call` tool
4. The Neo app renders Genesis's dashboard/state, and Genesis can query and mutate that render tree

If that's right, the integration surface is literally just an MCP server URL — Genesis already handles the rest (`mcp connect neural-link <url>`). No changes to Genesis's boot system or cognitive stack needed.

**What I'd want to validate first:** Can Genesis meaningfully reason about a component tree it didn't build? The power of SelfModel is that Genesis scanned its own code, so it understands the structure. With a Neo UI, Genesis would be introspecting components it has no prior knowledge of. The Neural Link gives it *access* — but does it give it *understanding*?

---

### `@tobiu` commented on 2026-04-12T08:02:18Z

@Garrus800-stack Hi Daniel,

here is how I would tackle this: first create a repo fork, since the latest release (v12.1) is already 300 resolved tickets behind. For the next release I still need to wrap up the multi-body grid architecture (locked columns). `npm i`, `npm run build-all`.

I always use these in separate terminals:
* `npm run ai:server` (knowledge base chroma)
* `npm run ai:server-memory-core` (memory core chroma, unless you switch to the new neo SQLite hybrid RAG)
* `npm run ai:server-neural-link` (the neural link bridge)
* `npm run server-start` (webpack dev server for neo apps, unless you use a different one like WebStorm IDE server)

While MCP servers can start this on their own, ending an agent session would close connections, which might lock out other agents.

The easiest way to try it out is most likely Gemini CLI, since it can just pick up https://github.com/neomjs/neo/blob/dev/.gemini/settings.json .

I am using Antigravity the most these days. This one has the MCP server config inside the system Users folder, so the configuration gets a little bit more tricky. Explore: https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md .

All Neo MCP servers are build on top of the official modelcontextprotocol SDK, so you are correct, Genesis should be able to pick up NL like any other MCP server => following standard tool definitions. I am using OpenAPI 3 specs (yaml files) to derive MCP tool shapes from them. So if needed, it would be quite simple to spin up a webserver from the specs with the according RESTful endpoints.

If we want to deploy NL into the cloud, we should tackle this one first: https://github.com/neomjs/neo/issues/9559 => I already implemented authorization for the knowledge base and memory core servers, but NL is still missing out here.

Also worth an exploration, since it directly relates: https://github.com/neomjs/neo/issues/9889 .

As mentioned before, you are very welcome to open new tickets or ask questions if needed.


Best regards,
Tobi

#### Reply depth=1 by `@Garrus800-stack` on 2026-04-12T08:57:17Z

Thanks Tobi — this is very hands-on, appreciate it.

I've forked the repo and will work through the setup over the coming days. Genesis already handles MCP connections via `mcp connect <name> <url>`, so connecting to the Neural Link server should work out of the box — but I want to take the time to understand the Neo architecture properly before rushing into integration.

The authorization topic (#9559) is relevant for us too — Genesis has HMAC token auth on its own PeerNetwork, so we're aligned on the principle that control channels need auth before any cloud deployment.

Will report back once I have the Neural Link responding to Genesis's `mcp-call` tool. If I run into issues I'll open a ticket in your repo.

#### Reply depth=1 by `@Garrus800-stack` on 2026-04-12T11:13:23Z

Hi Tobi,

Quick update — I've started preparing Genesis for the Neural Link integration. The v7.1.4 release includes a new session-aware memory architecture (frontier node in the KnowledgeGraph, crash-safe checkpoints, cross-store referencing) that was partly inspired by your Memory Core design.

I still need to clone the fork locally, get the Neural Link server running, and test the MCP handshake from Genesis's side. Have a few things to take care of first, but I'll follow up once I have the bridge responding.

Looking forward to seeing the first `inspect_component_render_tree` call come through from Genesis.


Daniel


#### Reply depth=1 by `@Garrus800-stack` on 2026-04-12T11:29:44Z

While studying your Memory Core codebase to understand the design before building our version, I wanted to say — the architecture is remarkably clean. The separation between SessionService, GraphService, and SummaryService is very well structured. The drift detection approach (comparing memory count vs summary count at startup) is elegant, and the way `decayGlobalTopology` shields structural edges from decay shows real production thinking. Impressive work for what is essentially a solo project.

Two small things I noticed while reading through — not bugs, just observations:

- **SessionService timeout for OpenAI-Compatible providers** is set to 1 hour (`timeout: 60 * 60 * 1000`). If a local LLM hangs (VRAM issue, Ollama crash), this could block the entire startup summarization for a long time. A shorter timeout (5-10 min) with a graceful fallback might be more resilient for local setups.

- **`findSessionsToSummarize` pagination** accumulates all metadata objects into `allMetadatas` in memory during the scan. With the safety break at 2M records and ~500 bytes per metadata object, that could approach 1GB RAM in extreme cases. A lighter approach might be to only collect sessionIds during the scan instead of full metadata objects, then fetch the details only for sessions that actually need re-summarization.

Neither of these would matter for typical usage — they'd only surface in edge cases with local LLMs or very long-running instances. Just thought I'd mention them since I was in the code anyway.

---

