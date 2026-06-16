# ADR 0019: AiConfig is the reactive Provider SSOT for Agent OS config

> The Brain's configuration (`AiConfig` + its child providers) is a reactive hierarchical `Neo.state.Provider` tree and the **single source of truth**. Read resolved leaves at the use site; never re-implement, alias, export, pass-along, mutate, or defend against it. This ADR is the **read-gate**: the sharp distillation you consult *instead of* the three primitive files, and the sanctioned-pattern reference a reviewer + the lint check against.

| Attribute | Value |
|---|---|
| **Status** | Draft (proposed at Discussion #12453 graduation; Accepted on human merge of the implementing PR) |
| **Author** | @neo-opus-grace (Claude Opus 4.8) drafting; architecture via Discussion #12453 swarm |
| **Graduated from** | Discussion #12453 — *"AiConfig is a reactive Provider SSOT — eliminate the `ai/`-wide read-then-re-implement antipattern cluster"* (cross-family quorum: Claude `[AUTHOR_SIGNAL]` + GPT `[GRADUATION_APPROVED]` + GPT §5.2 STEP_BACK) |
| **Implementation** | Epic #12456, sub #1 (#12457 — this ADR + the turn-loaded AGENTS.md trigger); sub #2 = the fail-build lint |
| **Supersedes** | the implicit assumption that `ai/` config values may be re-derived / aliased / threaded / mutated (the #12420 antipattern cluster) |
| **Informs** | every PR touching `ai/` config; the SSOT lint (sub #2); future config-leaf authoring + review |
| **Decision Record relations** | depends-on ADR 0005 (ADR-at-graduation); aligned-with ADR 0007 (compaction taxonomy: trigger in the turn-loaded layer, depth here); complements (does NOT replace) the public `learn/agentos/AiConfigModel.md` configuration-model guide |
| **Anti-anchor for** | the #12420 failure mode — pattern-matching broken config code without grasping the `Neo.state.Provider` primitive |

---

## 1. Context

We made `AiConfig` a `Neo.state.Provider` (`ai/ConfigProvider.mjs`) to **simplify** Agent OS config — one reactive hierarchical SSOT instead of scattered env-reads and hand-rolled cascades. Then PR #12420 re-implemented, aliased, threaded, and **mutated** it across `ai/`, and a careful reviewer (@neo-opus-grace) approved it **twice, catching 0 of the 4 real defects** @tobiu then found (cycle-3 over-engineering · cycle-4 wrong-layer · the −90 formulas · a test→live-DB bleed).

The empirical lesson is not "be more careful" — that is **falsified** (4/4 missed across 2 doc-prepared reviews). It is the **broken-window root**: a pattern-matcher with no grasp of the sanctioned mechanism has only the broken code to match. This ADR is that mechanism, made readable; the turn-loaded trigger makes reading it un-skippable; the lint (sub #2) makes the mechanical subset un-bypassable.

## 2. Decision

**`AiConfig` and its child providers are the single source of truth for Agent OS config. READ resolved leaves at the use site. Never re-implement, alias, export, pass-along, mutate, or defend against the SSOT.**

### 2.1 How the primitive works (read this instead of the 3 code files)

`ai/ConfigProvider.mjs extends Neo.state.Provider` — every config **is** a reactive state provider; they compose into one tree. (Primitive line-anchors below are for someone changing the *primitive itself*; consumers do not need them.)

- **`leaf(default, env, type)`** declares one value (`ai/ConfigProvider.mjs:52`). `ConfigProvider.#applyEnvLayer` (`:201`) already reads `process.env[env]`, decodes it by `type` (via `Neo.util.Env` parsers), and applies it when set — **the leaf owns env-override-with-default.** A manual `hasEnvValue('NEO_X')` check re-implements the leaf's *internal* env-resolution: it is the fingerprint of not understanding `leaf()`.
- **Hierarchy / realm chain.** Tier-1 `Neo.ai.Config` is the realm root; each per-server config is a child — `ai/ConfigProvider.mjs` overrides `getParent()` (`:268`) to return the Tier-1 singleton (the Brain has no component tree). `Provider#getOwnerOfDataProperty` (`src/state/Provider.mjs:376`) checks local `#dataConfigs` first, then walks up the parent chain: **reads resolve override-else-inherit; writes bubble to the owner.** No layer holds a copy of another's data. (The same hierarchy the Body uses for component state — see [examples/stateProvider/advanced](../../examples/stateProvider/advanced/MainContainer.mjs): read-up, write-to-owner.)
- **`formulas`** are lazy `Effect`s (`src/state/Provider.mjs:177` → first run in `onConstructed`) for **genuine reactive computed values** — re-run when a dependency accessed via the hierarchical proxy changes. They are NOT a place to re-derive a leaf with env-checks.
- **The hierarchical data proxy** (`src/state/createHierarchicalDataProxy.mjs`) resolves nested paths; its get-trap registers `EffectManager.getActiveEffect()?.addDependency(config)` (`:58`, automatic dependency tracking) and its set-trap routes assignments to the owning provider's `setData` (`:99`). **Consumers read `AiConfig.engines.chroma.dataDir`** — the Provider resolves; you read. (This routing is *why* B4 writes are mechanically dangerous — see §4.)
- **`data_` is a `merge: 'deep'` descriptor** (`src/state/Provider.mjs:61`). An operator overlay (`config.mjs`) is a *thin child of deltas* over the canonical template (`config.template.mjs`); advancing to a newer template is **inheritance, not a source-level merge** — never parse/splice config *source* to reconcile them.
- **Env precedence is bounded** — re-resolved at construct / `setEnvOverride` / `load` / `refreshEnv`, **not live-per-read** (a port that silently moves without a coordinated restart is a footgun, not a feature).

## 3. Antipattern catalog (the sanctioned-pattern reference)

A reviewer checks a config-touching diff against this list; the lint (sub #2) mechanizes the flaggable subset. Each ID is tagged **`[live-on-dev]`** (an actual cleanup target) or **`[#12420-proposed]`** (existed only on the superseded PR #12420 branch — prevented by not-merging #12420 + the lint, NOT a cleanup target). The tag is V-B-A'd: e.g. `hasEnvValue` = **0 occurrences on `dev`**.

### Group A — re-implementing the Provider's resolution
| ID | Antipattern | Tag | Sanctioned form |
|---|---|---|---|
| A1 | module-level re-derivation (`const DB_PATH = process.env.X \|\| path.join(...)`) | `[live: daemons :53-54/:36, deploy]` | read `AiConfig.X.Y` at the use site |
| A2 | imperative cascade hooks (`afterApplyEnvLeaf`) | `[#12420-proposed]` | a `formula` (only if genuinely computed) or a plain leaf derivation |
| A3 | over-engineered resolution helpers (`resolveAiDataRoot`) | `[#12420-proposed]` | the leaf's env-binding already resolves |
| A4 | inline `process.env.UNIT_TEST_MODE ? test : prod` inside a leaf | `[live: #12451]` | declarative leaf; test-mode resolved by construction |
| A5 | a `hasEnvValue(name)` helper | `[#12420-proposed]` | delete it — `leaf(default, env, type)` owns the env-check |
| A6 | leaf+formula duplication (one path defined in both) | `[#12420-proposed]` | one definition — the leaf |
| A7 | a formula re-implementing the leaf's env-resolution | `[#12420-proposed]` | drop the env knob (likely YAGNI) → `path.join(data.root, …)` |
| A8 | `storagePaths.graph` 4-branch tangle (`:memory:` + two env vars, one read direct from `process.env`, + derive) | `[#12420-proposed]` | one leaf + one derivation; test-mode by construction |
| A9 | `formulas` for plain path-joins | both | a leaf/derivation; formulas = reactive computed values only |

### Group B — indirection AROUND the SSOT (even when reading it)
| ID | Antipattern | Tag | Sanctioned form |
|---|---|---|---|
| B1 | exporting config values/subtrees (`export const X = AiConfig.Y`) | `[live: TaskDefinitions.mjs]` | consumers import `AiConfig` and read at use site |
| B2 | `const X = AiConfig.Y` pointers | review-only | read inline — alias only if used 3+ times in one scope |
| B3 | defensive `?.` on `AiConfig` reads | `[live-on-dev]` | the SSOT guarantees the tree; let it fail loud |
| **B4 ⭐** | **SAFETY-CRITICAL — runtime writes to `AiConfig`** (see §4) | `[live: ~21 test files; #12435]` | tests isolate by construction (`UNIT_TEST_MODE`); NEVER mutate the shared singleton |
| B5 | passing `AiConfig` values into other consumers' configs (`Orchestrator → buildTaskDefinitions({chromaPort, …})`, 14 threaded args) | `[live: daemons]` | the consumer imports `AiConfig` and reads it (see §5 for the C1×B5 resolution) |

### Group C — boundary / duplication
| ID | Antipattern | Tag | Sanctioned form |
|---|---|---|---|
| C1 ⛔ | **NEO imports ONLY in thread-entrypoints** (ZERO tolerance — `import Neo`/`_export`/`AiConfig` in a *non-entrypoint* script can BREAK things) | `[live: TaskDefinitions.mjs]` | genuine *non-entrypoint* consumers use a pure-defaults module (literals + env-names, no Neo import) — see §5.5 |
| C2 | duplicated primitives (`chromaClientPrimitives` re-implements the embedding dummy-fn; `chromaTestIsolation` hidden default DB names) | `[live-on-dev]` | fold into the SSOT leaves |
| C3 | tests import `config.mjs` (overlay) not `config.template.mjs` (canonical) | `[live: #11976]` | tests import the canonical template |

> **V-B-A classification correction (@neo-opus-4-7, `dev` line-evidence — Discussion #12453 `DC_kwDODSospM4BBgm5`):** the `ai/` daemon *entrypoints* (`bridge/daemon.mjs:3-6`, `orchestrator/daemon.mjs:25-27`) **legitimately `import Neo`/`_export`/`AiConfig`** — they ARE entrypoints, so their path re-derivation is **A1** (re-derivation with AiConfig already in scope), NOT a C1 violation; the "can BREAK things" framing applies to *non-entrypoints* only. The **single genuine C1×B5 site is `TaskDefinitions.mjs`** (no Neo import; `export const DEFAULT_DB_PATH`). The fan-out census MUST tag `A1-with-AiConfig-imported` vs `genuine-C1` so daemons are not over-counted as C1.

### Group D/E — why this keeps happening (root, compressed)
**D1** premise-gate failure (review checks template-compliance/tests-green, not solution-shape) · **D2** reviewing the diff, not the model · **D3** correlated same-family blind-spot · **E1** broken-window · **E2** codify-don't-promise · **E3** operating without understanding the primitive. The structural answer to all of D/E is **this ADR + the lint** — not reviewer diligence (empirically insufficient).

## 4. The danger (B4, safety-critical)

A test that mutates the shared `AiConfig` singleton to point at its own DB —
```js
aiConfig.storagePaths.graph = testDbPath;
if (!aiConfig.storagePaths) aiConfig.storagePaths = {};   // B3 defensive subtree-creation
aiConfig.engines.chroma.database = `graph-service-test-${process.pid}-${Date.now()}`;
```
— is **how test data bleeds into live DBs.** The proxy set-trap routes that assignment to `setData` on the *owning provider* (the shared singleton), so failed cleanup, a shared process, or test-ordering means the next consumer (or a non-mutating path) reads the test DB — or a live read lands on test state. This is the **#12335 orphan-incident mechanism** (~1,281 orphans `purgeTestCollections` reclaims), already fixed at great cost by `chromaTestIsolation` (isolate **by construction** under `UNIT_TEST_MODE`) — and **bypassed** in #12420 by hand-rolled config-mutation. The lesson did not stick because nothing mechanical enforced it.

**Rule:** a test NEVER mutates the shared `AiConfig`; isolation is by construction. **Lint (sub #2, fail-build):** flag any `aiConfig.<path> = …` runtime assignment, especially in tests — one check prevents the whole orphan-bleeding class. (V-B-A: ~21 test files currently do this; ticket #12435.)

## 5. Sanctioned patterns (the fix, in one place)

1. **Read at the use site:** `const dir = AiConfig.engines.chroma.dataDir;` — no export (B1), no once-used alias (B2), no `?.` (B3), no threading into other consumers (B5).
2. **Leaves are declarative:** `leaf(default, env, type)`. No inline env-ternaries (A4), no `hasEnvValue` (A5).
3. **Formulas only for genuine computed values** — reactive on real deps. Never to re-derive a leaf (A6/A7) or for a plain path-join (A9); a path-under-root is a derivation, not a formula.
4. **Tests isolate by construction** (`UNIT_TEST_MODE` → the config resolves the test DB). Never mutate the shared singleton (B4).
5. **The C1×B5 sanctioned shape** (V-B-A'd against `dev` — most "daemon C1" sites are actually A1):
   - **Entrypoints (incl. the `ai/` daemons) import `AiConfig` and read at the use site.** The daemons already `import Neo`/`_export`/`AiConfig` and work — so a daemon re-deriving a path is **A1, not C1**. Fix: read `AiConfig.X.Y` directly.
   - **Genuine non-entrypoint helpers** (e.g. `TaskDefinitions.mjs` — imported by the orchestrator entrypoint, with no Neo import of its own): a **pure-defaults module** — literals + env-var *names* only, **no Neo import** — carrying the same defaults the leaves declare. This is the one true C1×B5 locus.
   - An **entrypoint-injected value object** is acceptable *only* at a narrow, explicitly-named bootstrap boundary — not license for generic pass-along plumbing. Do **not** add a read-only accessor unless it stays pure / no-Neo-import.
   - *(Folds @neo-opus-4-7's bootstrap-weight reframe: the question was never "can it import?" — the daemons prove it can — but "should a frequent lightweight helper pay full-framework bootstrap weight to read a path?")*
6. **Overlay = thin child of deltas** over the canonical template; never parse/splice config source to reconcile (deep-merge inheritance handles it).

## 6. V-B-A Pre-Flight for future authors (the read-gate)

Before authoring or reviewing any `ai/` config work, you MUST:
1. Read **this ADR** (the AGENTS.md turn-loaded trigger makes this un-skippable).
2. If you are changing the *primitive itself* (not just consuming it), additionally read `src/state/Provider.mjs` + `src/state/createHierarchicalDataProxy.mjs` + `ai/ConfigProvider.mjs` and cite them.
3. V-B-A your diff against §3/§5's sanctioned forms — not against the surrounding (possibly broken) code.

## 7. Codification stack & sequencing

1. **This ADR** (authority) + **the one-line AGENTS.md turn-loaded trigger** — sub #1 (#12457), **merge first** (per ADR 0007: high-frequency trigger in the turn-loaded layer, depth here; net loaded-bytes negative — one line replaces a 3-file read).
2. **The fail-build lint** — sub #2, encodes §3's flaggable subset (A1·A4·A5·A6·A7·B1·B3·**B4**·B5 partial·C1; merges #12451).
3. **Fan-out inventory** (Diamond 1) — AFTER this ADR merges (operator-gated), parallel Claude-family subagents sweep `ai/` against this ADR → exhaustive `[live-on-dev]` instance census.
4. **Cleanup subs** (Diamond 2) — scoped from the census, each citing this ADR; folds in #12435, #12438, #11976, #12452.

## 8. Consequences

**Positive:** one readable authority replaces a 3-file primitive dig; the read-gate is mechanically enforced (turn-loaded trigger); the lint prevents recurrence — including the safety-critical live-DB bleed — without relying on reviewer diligence empirically shown to fail (4/4 #12420 misses). **Negative:** substrate cost of one ADR + one turn-loaded line — mitigated: the line replaces a 3-file read (net-negative loaded-bytes for any agent touching `ai/` config), and the catalog is dual-use as the lint spec. **Risk:** the `[live-on-dev]` vs `[#12420-proposed]` tags are point-in-time; the fan-out (step 7.3) re-verifies against `dev` at inventory time.

## 9. Related

- **Discussion #12453** — full archaeology trail + the divergence matrix (incl. @neo-opus-4-7's OQ3 C1=bootstrap-weight V-B-A, `DC_kwDODSospM4BBgm5`).
- **Epic #12456** — workstream coordination; **#12457** — this sub.
- **#12420** — superseded empirical anchor (do-not-merge). **#12335** — orphan incident (the B4 danger).
- Folded subs: **#12435** (B4), **#12438** (A1), **#11976** (C3), **#12452** (config primitive rename), **#12451** (config-leaf lint → sub #2).
- **ADR 0005** (ADR-at-graduation), **ADR 0007** (compaction taxonomy).
- `ai/ConfigProvider.mjs`, `src/state/Provider.mjs`, `src/state/createHierarchicalDataProxy.mjs` — the primitive.
- `learn/agentos/AiConfigModel.md` — the **public configuration-model guide** (docs-reader audience). This ADR is the **maintainer-facing complement** (antipattern catalog + safety-critical danger + read-gate); the two cross-reference and neither replaces the other.

Origin Session ID: `3ecb40bf-bfef-40b1-8693-a8aae5afa1b7`

Retrieval Hint: `query_raw_memories("AiConfig reactive Provider SSOT antipattern read-gate ADR 0019")` or commit-range anchor on this ADR's first commit.
