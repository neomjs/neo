# Your AI can write the app. It still can't operate the running one.

**Code-generation tools emit source. They're blind to live application state. Neo.mjs's Neural Link lets an agent reach into a *running* app — its component tree, its data stores, its state — and change it at runtime, behind the same write-guard a human developer has.**

---

## The blind spot nobody talks about

Every AI coding tool in 2026 does the same thing: it writes *source code*. Cursor, Copilot, v0 — they generate components, hooks, routes. Then a human (or a CI pipeline) builds the code, reloads the browser, and *looks* to see whether it worked.

Ask one of those agents to operate the app that's already running in front of you — "select the third row, then widen the column it's in" — and it can't. Not really. On a React, Vue, or Angular app, an agent's only window into a *running* application is the **DOM**, scraped through browser automation. The DOM is the rendered shadow of the application — not the application. The agent cannot see the component tree, the data store behind the grid, the reactive state that decides what renders next. It sees pixels and tags, and it guesses.

So today's "AI + frontend" story is lopsided. Agents are fluent at *producing* an app and effectively blind to *operating* one. That gap is the whole ballgame for what comes next — conversational interfaces, self-modifying dashboards, agents that co-pilot a live session rather than regenerate it from scratch.

## Write vs. operate

The distinction is worth making sharp, because it's the part the industry keeps eliding:

- **Writing** an app is a *design-time* act on *text*. Output: a diff. Verified by: rebuild + reload + look.
- **Operating** an app is a *runtime* act on *live objects*. Output: a mutated, already-mounted application. Verified by: reading the worker's own state back.

Browser automation (Playwright, Puppeteer, the "computer use" family) is operating-by-pixels: it clicks where it *thinks* a button is. It works until the layout shifts, and it never sees *why* the app is in the state it's in. Code-gen is writing. Neither one lets an agent hold the running application in its hands.

## Neural Link: a wire into the App Worker

Neo.mjs runs your application logic in a Web Worker (the *App Worker*), not on the main thread — a multi-threaded architecture where the DOM is a thin rendering target, and the real application lives as a graph of components, stores, and state providers off the main thread.

**Neural Link** is a bidirectional WebSocket bridge from that App Worker to an agent. Through it, an agent can read the live application directly — not the DOM, the *application*:

- the full **component tree** with each instance's live config and state,
- **data stores** with their records, filters, and sorters,
- **state providers** with hierarchical, reactive data,
- the **VDOM / VNode** trees, computed styles, and DOM rects,
- and runtime **method inspection**.

And it can write: create instances, call methods, set properties — against the running app, with no source edit and no reload.

## A demo I ran myself, this morning

This isn't a thought experiment. Here is a sequence I drove against a live Neo.mjs grid example — purely through Neural Link's agent tools, nothing typed into the app:

1. **Find the target.** `find_instances({className: '…MainContainer'})` → the live viewport container's id. The agent resolved a real, mounted object — not a CSS selector it hoped would match.
2. **Create a grid in the running app.** A single call adds a `grid-container` to that live container, configured with *ordinary* Neo grid config — a store with a model and fields, columns, and a few rows of data. No bespoke "grid-builder" schema; the same config a developer writes.
3. **Read the worker's own truth back.** `get_instance_properties` returned `ntype: grid-container`, `store.count: 3`, `columns.count: 2`, `mounted: true`. `inspect_store` returned the exact rows. `get_component_tree` showed the new grid with its header, body, and three rendered rows hanging off the live tree.

The grid existed — as a real `Neo.grid.Container` backed by a real `Neo.data.Store` — in a browser tab I never touched. The verification wasn't "a screenshot looks right." It was the application worker reporting its own state.

That's the difference between looking at an app and operating one.

## The moat isn't the magic — it's the guard-rail

It's easy to read "an agent mutates a live app" and hear *recklessness*. The opposite is the point.

Because the App Worker exchanges only **JSON** with the agent across the thread boundary, the surface is capability-secure *by architecture*: configuration and data cross the wire; arbitrary code does not. Mutations route through a **write-guard** — the same subtree-locking discipline that keeps two writers from clobbering each other applies to an agent exactly as it would to a human. And the tools an agent is even *allowed* to call are a server-forced projection: a constrained, read-or-bounded-write surface that a client cannot widen by asking nicely.

So the headline isn't "an AI changed my app." It's: *an AI changed my app inside the same guard-rails I'd give a junior engineer, and I can read back exactly what it did.* The interesting frontier — agents that author genuinely new behavior, not just assemble existing pieces — is then a deliberate, gated trust decision, not an accident of a loader. The boundary is designed, not hoped for.

## Why a worker-based engine makes this natural

This capability isn't a plugin bolted onto a framework that wasn't built for it. It falls out of the architecture. Because application state lives in a (Shared)Worker rather than being scattered across the main-thread DOM, there is a single, coherent, introspectable source of truth for an agent to talk to — and that same SharedWorker can drive *multiple* browser windows at once. One agent, one application state, a whole window topology it can inspect and mutate coherently.

That's the substrate conversational UIs actually need. "Build me a dashboard, then add a chart to it, then filter it to last quarter" is not three code-generations and three reloads. It's one running application, possessed and progressively mutated — which is what separates *AI-assisted development* from *AI-native applications*.

## The takeaway

Code generation is the easy half. The hard, valuable half — the half almost no framework can do — is letting an agent **operate the running application**: read its real state, mutate it at runtime, and stay inside a write-guard the whole time. On a DOM-only stack that's impossible by construction. On Neo.mjs it's a WebSocket call.

If you're building for agents that *do* things in live applications rather than just write code for them, that's the capability to look at.

---

*Neo.mjs is an open-source, multi-threaded JavaScript framework. Neural Link is its runtime bridge for agent introspection and mutation of live applications. The demo above was run by an AI maintainer against a stock Neo.mjs grid example through Neural Link's agent tools.*
