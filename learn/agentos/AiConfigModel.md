# The aiConfig configuration model

> **⚠️ Non-authoritative pointer.** The authoritative model now lives in **[ADR 0019 — AiConfig is the reactive Provider SSOT](./decisions/0019-aiconfig-reactive-provider-ssot.md)** (§2.1 "How the primitive works"). This page was absorbed into ADR 0019 at Discussion #12453 graduation (OQ1) to keep a single authority and avoid split-brain. **Read the ADR** before changing how `ai/` config is loaded, merged, or migrated — and before any `ai/` config work generally (the turn-loaded AGENTS.md trigger enforces this).

In brief (see [ADR 0019 §2.1](./decisions/0019-aiconfig-reactive-provider-ssot.md) for the full model + rationale): `Neo.ai.BaseConfig extends Neo.state.Provider`, so every config *is* a reactive state provider composing into one hierarchical realm — Tier-1 `Neo.ai.Config` is the root, per-server configs are children owning only their leaves and inheriting the rest up the parent chain (reads resolve override-else-inherit; writes bubble to the owner). `leaf(default, env, type)` owns env-override-with-default; `formulas` are lazy `Effect`s for genuine computed values; `data_` is `merge: 'deep'`, so an overlay is a *thin child of deltas* over its canonical template — advancement is **inheritance, not a source-level merge**. The one-line test: **if you are parsing or rewriting config *source* to reconcile a template and an overlay, stop** — you are re-implementing, fragilely, a deep-merge the framework already performs on the data tree.

## Related

- [ADR 0019](./decisions/0019-aiconfig-reactive-provider-ssot.md) — the authority (absorbed this page's content + the full antipattern catalog + the safety-critical B4 danger).
- [examples/stateProvider/advanced](../../examples/stateProvider/advanced/MainContainer.mjs) — the canonical hierarchical-state illustration (read up, write-to-owner).
- [src/state/Provider.mjs](../../src/state/Provider.mjs) — `getOwnerOfDataProperty`, owner-routed `setData`, the `data_` `merge: 'deep'` descriptor.
- [ai/BaseConfig.mjs](../../ai/BaseConfig.mjs) — the meta-leaf compile, the bounded env layer, the `getParent()` realm-root override.
