# The aiConfig configuration model

> The Brain's configuration (`aiConfig`) is **hierarchical nested data**: a tree of `Neo.state.Provider`s where each layer owns only its slice and inherits the rest up a parent chain. This page is the *intent* behind that shape. Read it before changing how config is loaded, merged, or migrated — the model quietly makes several "obvious" approaches (source-level drift detection, overlay cloning, hand-written merge) the **wrong layer**.

## The shape

`Neo.ai.ConfigProvider extends Neo.state.Provider`, so every config *is* a reactive state provider, and they compose into one tree:

- **Tier-1 — `Neo.ai.Config`** (singleton): the *realm root*. It owns the deployment-wide leaves — model providers, `auth`, `ollama` / `openAiCompatible`, storage, the orchestrator intervals.
- **Per-server configs — `Neo.ai.mcp.server.<name>.Config`**: children of the realm root. Each owns only the leaves that are genuinely server-local — the Knowledge Base's `collectionName`, the Memory Core's `memorySharing`, and so on.

A child resolves a leaf it does not own by walking **up** to the owner: `getOwnerOfDataProperty` checks the local data first, then delegates to `getParent()`. The Brain has no component tree, so `ai/ConfigProvider.mjs` overrides `getParent()` to return the Tier-1 singleton — that override is what roots the realm chain.

This is the same hierarchy the Body uses for component state providers. The canonical illustration lives in [examples/stateProvider/advanced](../../examples/stateProvider/advanced/MainContainer.mjs): a `Panel` reads `button1Text` that only the top-level `Viewport` owns (the lookup walks up), and a write to `button1Text` *initiated on the Panel* bubbles up and lands on the `Viewport`'s provider, which owns it.

Two properties fall out of "each layer owns only its slice":

1. **Reads resolve override-else-inherit, lazily, per key.** No layer holds a copy of another layer's data.
2. **Writes bubble to the owner.** `setData('auth.realm', …)` on a server config lands on Tier-1, because Tier-1 owns `auth`.

## Leaves and the env layer

A config's `data` is a *meta-leaf tree* — each leaf is `leaf(default, env?, type?)`. `ConfigProvider.compileMetaLeaves` walks it into (a) plain reactive data and (b) a metadata registry keyed by dotted path. A bounded **env layer** then overlays environment variables onto env-bound leaves — re-resolved at construction and on explicit refresh, never live-per-read (a port that silently moves without a coordinated restart is a footgun, not a feature). See `ai/ConfigProvider.mjs`.

## Templates, overlays, and why advancement is *inheritance*

Each config exists as a pair: a tracked `config.template.mjs` (the canonical defaults) and a gitignored `config.mjs` (the operator overlay). The overlay's job is to carry the operator's **deltas** — nothing more.

The trap — and the reason this page exists — is to treat the overlay as a **clone** of the template that must be kept in sync as the template evolves. Down that road lie source-level drift detectors (regex-parsing `.mjs` text for leaf paths) and source-level merges (splicing new leaves into the operator's file, normalizing commas and indentation). **That is the wrong layer.** A config is not text to diff and splice; it is a mergeable data tree the Provider already resolves hierarchically and merges deeply:

- `data_` is a `merge: 'deep'` descriptor — *"when new data is assigned, it will be deeply merged with existing data."*
- `setData(obj)` recursively merges an object into the reactive tree, creating missing leaves and keeping existing ones.
- `load()` merges a JSON overlay into reactive data the same way.

So the model that follows from the hierarchy:

- An overlay **owns only the operator's overrides** and inherits everything else from its canonical parent. It cannot go "stale": a template that grows a leaf is inherited automatically, because the new leaf lives in the parent, not in a frozen copy.
- "Advancing" an overlay to a newer template is therefore **not an operation at all** — there is nothing to reconcile. Operator overrides persist as the child's own data; new defaults arrive by inheritance.
- The override channels are the **env layer** (bounded env vars) and the **overlay's own data** (operator deltas, including a JSON delta via `load()`).

The one-line test: **if you are parsing or rewriting config *source* to reconcile a template and an overlay, stop.** You are re-implementing — by hand, and fragilely — a deep-merge the framework already performs on the data tree, against a clone that should never have existed.

## Related

- [examples/stateProvider/advanced](../../examples/stateProvider/advanced/MainContainer.mjs) — the canonical hierarchical-state illustration (read up, write-to-owner).
- [src/state/Provider.mjs](../../src/state/Provider.mjs) — `getOwnerOfDataProperty`, owner-routed `setData` / `internalSetData`, and the `data_` `merge: 'deep'` descriptor.
- [ai/ConfigProvider.mjs](../../ai/ConfigProvider.mjs) — the meta-leaf compile, the bounded env layer, and the `getParent()` override that roots the realm chain.
- [Cloud-Native KB Ingestion — Configuration](./cloud-deployment/Configuration.md) — the operator-facing config keys this model carries.
