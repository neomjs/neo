# Core-Idiom Audit (instance & reactive-state work)

Load-on-demand payload behind the guide's "7.5.1 Core-Idiom Audit" pointer. Applies to diffs that create, mutate,
resolve, or destroy Neo instances — or manage reactive state — in ANY directory: the class
system spans hemispheres (`ai/` services and daemons are `Neo.setupClass` classes too).

## The checks

1. **Batched mutation:** multi-config changes to a live instance go through ONE `component.set({...})`
   (EffectManager pause, coherent beforeSet/afterSet, single cascade) — never chained direct
   property writes.
2. **Manager resolution:** components resolve via the core instance manager (`Neo.get` /
   `Neo.getComponent`) — instance shape is a core-contract guarantee there (`afterSetId`
   auto-registration). A bespoke resolution seam re-implementing this, or hardening against
   wrong-shape cases the class system precludes, is a **Required Action**, not a style note.
3. **Reactive state:** view/shared state lives as reactive configs — on a `state.Provider` when
   multiple consumers bind it (topology note: the component tree lives in the shared app worker;
   windows are render targets, so ALL worker-side state is window-agnostic — a provider's value
   is the declarative multi-consumer binding surface, never "survival").
4. **Service lifecycle (Brain-side weight):** long-running services honor `initAsync`/`ready()`
   (settle-or-reject on restart) and `registerAsync`/`trap` (destroy cancels pending async).

## The exemption

Pure data-plane logic (parsers, validators, transition tables) as plain util modules passes —
childapp-precedented. The audit covers instance mutation + reactive state only.

## Context-window substitution

A reviewer whose window cannot afford the `src/core/Base.mjs` read MAY satisfy this audit via
`ask_knowledge_base` on the specific idiom (verified live: the KB surfaces the `set()` batching,
`setSilent`, and resolution contracts unprompted).

Empirical anchor: the 2026-07-04 create-module correction arc — two idiom violations shipped
past a full review cycle; the author-side gate is ticket-intake's "Core-Idiom Pre-Flight" item (9.6).
