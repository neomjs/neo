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

SSOT covers two things that earlier revisions of this ADR conflated, so they are named separately: **resolution** — env layering, the hierarchy chain, reactivity — is AiConfig's, unconditionally and without exception. **Declaration** — where a literal is physically written — is AiConfig's too, with exactly one exception, stated mechanically in §5.5. A literal living elsewhere is never justified by *who consumes it*; only by *what the leaf machinery cannot do for itself*.

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
| **B4 ⭐** | **SAFETY-CRITICAL — runtime writes to `AiConfig`** (see §4) | `[live-on-dev: check-aiconfig-test-mutation]` — the gate is the enforcement anchor; it scans `test/**` only, so `ai/**` is unenforced (§4) | tests isolate by construction (`UNIT_TEST_MODE`); NEVER mutate the shared singleton |
| B5 | passing `AiConfig` values into other consumers' configs (`Orchestrator → buildTaskDefinitions({chromaPort, …})`, 14 threaded args) | `[live: daemons]` | the consumer imports `AiConfig` and reads it (see §5 for the C1×B5 resolution) |

### Group C — boundary / duplication
| ID | Antipattern | Tag | Sanctioned form |
|---|---|---|---|
| C1 ⛔ | **NEO imports ONLY in thread-entrypoints** (ZERO tolerance — `import Neo`/`_export`/`AiConfig` in a *non-entrypoint* script can BREAK things) | `[live: TaskDefinitions.mjs]` | keep the non-entrypoint Neo-free; it takes pure FUNCTIONS from a shared module, and any LITERAL it needs must earn §5.5's anchor reason — being a non-entrypoint is never itself the reason, and it must not carry a resolver for anything a leaf already binds |
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

**Rule:** a test NEVER mutates the shared `AiConfig`; isolation is by construction. **Lint (sub #2, fail-build):** flag any `aiConfig.<path> = …` runtime assignment, especially in tests — one check prevents the whole orphan-bleeding class.

**Live status — `check-aiconfig-test-mutation` is the enforcement anchor.** Run it for the current disposition rather than trusting any number written here; two distinct figures it reports must not be conflated:

- **Enforcement reach** — the files the gate actually scans. It walks `test/` only (`find test -type f -name '*.mjs'`, filtered to `test/`), so **`ai/**` is outside the scan set by construction** and no rule-tightening inside the checker reaches it.
- **Legacy census** — `ALLOWLIST.size`, a point-in-time count of pre-existing exempted files, shrinking as they are repaired. It measures remaining debt, not enforcement strength, and a green gate says nothing about the unscanned region.

## 5. Sanctioned patterns (the fix, in one place)

1. **Read at the use site:** `const dir = AiConfig.engines.chroma.dataDir;` — no export (B1), no once-used alias (B2), no `?.` (B3), no threading into other consumers (B5).
2. **Leaves are declarative:** `leaf(default, env, type, metadata)`. No inline env-ternaries (A4), no `hasEnvValue` (A5). A custom env parser rides **`metadata.parse`** — the only sanctioned way to declare one, and it overrides the type-derived parser. **A hand-written descriptor object (`name: {default, env, parse}`) is non-canonical**, and the cost is not stylistic: the config-path collector counts a descriptor as a leaf only when `default` + `env` + `type` are all present, so a hand-written one reads as a **namespace** — and the module-scope capture rule *passes* namespace captures while *failing* leaf captures, so the misread silently widens what B5 permits. (2026-07-25, `#15914` — `metadata.parse` was added precisely to remove the reason the descriptor form existed; it converted the four live instances.)
3. **Formulas only for genuine computed values** — reactive on real deps. Never to re-derive a leaf (A6/A7) or for a plain path-join (A9); a path-under-root is a derivation, not a formula.
4. **Tests isolate by construction** (`UNIT_TEST_MODE` → the config resolves the test DB). Never mutate the shared singleton (B4).
5. **The C1×B5 sanctioned shape** (V-B-A'd against `dev` — most "daemon C1" sites are actually A1):
   - **Entrypoints (incl. the `ai/` daemons) import `AiConfig` and read at the use site.** The daemons already `import Neo`/`_export`/`AiConfig` and work — so a daemon re-deriving a path is **A1, not C1**. Fix: read `AiConfig.X.Y` directly.
   - An **entrypoint-injected value object** is acceptable *only* at a narrow, explicitly-named bootstrap boundary — not license for generic pass-along plumbing. Do **not** add a read-only accessor unless it stays pure / no-Neo-import.
   - **A config literal may live outside the leaf for exactly ONE mechanical reason: the module-scope anchor** — a leaf default is computed from it and the Provider does not exist yet (§10.5). **Everything else reads the resolved leaf.** That is a property of the leaf machinery, checkable without judgment; it is never a property of the consumer.
   - **A helper module may stay free of Neo imports for one reason too: its consumers are CONFIG FILES**, which cannot read a Provider that does not exist yet. That is the same chicken-and-egg stated from the module's side. It is not a companion shadowing the config — it is the config layer's own helper, and it must not carry a second resolver for anything a leaf already binds.
   - *(2026-07-25, #15892 — retires the "is this a no-Neo consumer?" test entirely, along with the pure-defaults-twin shape it sanctioned. The test was decidable by appearance and its audience was empty: a census found the plane literals had one consumer (the config itself), **every** production caller of the twin's data-root resolver passed `{env: {}}` to disable its env path, and its identity resolver had no production caller at all — the parallel resolution existed only for its own tests. The exemplar was collapsed rather than re-justified: two export kinds → one shared constant, and the module now reads no env outside the leaf's own `parse` hook.)*
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

## 10. Amendment — the plane-identity paired artifact (2026-07-24, #15799 / PR #15811)

*Drafted by @neo-fable-clio under the ticket's amendment mandate (`Decision Record: amends ADR 0019`); falsification seat: the ADR author, whose PR-review `[RETROSPECTIVE]` endorsed the §10.1 inversion. Exemplar: `ai/planeConfig.mjs` (twin) + the `plane` subtree in `ai/configBase.mjs` (leaf).*

### 10.1 The twin shape is RETIRED — one shared constant, no second resolver

*(Rewritten 2026-07-25, #15892 — this subsection previously prescribed a "pure-defaults twin" the leaf declared FROM, absorbing the former §10.2. The exemplar has been collapsed rather than re-justified, so what it prescribed no longer exists.)*

**The twin's defining feature was never its exported constants — it was a parallel env-resolution path running beside the leaf's own env layer.** Two resolvers for one value, able to disagree. That is A3, and the audience argument was what hid it.

Measured on the exemplar before removal: the plane literals had **one** consumer (the config itself); **every** production caller of the data-root resolver passed `{env: {}}` to switch its env path off; and the identity resolver had **no production caller at all**. The second resolution path was exercised only by its own tests.

**The sanction was actively propagating.** On 2026-07-25 a second instance was built — `ai/stopHookConfig.mjs`, authored explicitly *"via the ADR-0019 §5.5/§10.1 pure-defaults twin, leaf declares FROM it"* — and deleted the same day (`3a6d8bfafc`) once the shape was questioned. A sanctioned pattern that spawns a fresh instance within hours of being cited and then needs reverting is not a pattern being followed correctly; it is a trap the sanction sets. That is the strongest argument for retirement over re-justification, and it is why this subsection now records a removal rather than prescribing a shape.

The shape now: **one exported constant** (`CANONICAL_PLANE_ID` — crossing the boundary because the `plane.id` leaf declares it *and* §10.4's coherence assertion compares against it, so drift between them would let an overlay pass as canonical), plus pure functions. The anchor computation takes `rootDir` and reads no environment. **Env binding belongs to the leaf, unconditionally and alone.**

**Sharing a pure FUNCTION is not A3 and never needed an exception** — that is ordinary reuse. Only a LITERAL outside the leaf needs §5.5's anchor reason. The A3 test is **direction**: a helper the leaf declares FROM is sanctioned; one an entrypoint calls INSTEAD of reading the leaf is A3, whatever its audience.

**Falsified along the way, and recorded so it is not re-derived:** a first attempt at this collapse moved the `plane` subtree behind a descriptor factory, and the config-parity gate correctly reported three declared paths GONE — its collector reads `name: leaf(` / `name: {` and nothing else. That is a real limitation of a line-scan lint, and it was briefly written into this ADR as a second sanctioned reason ("parity visibility"). **It is not one.** The gate requires the *declaration* to stay inline; it never required the *literals* to be exported, and removing them keeps it green. A tooling limitation is debt to fix, not architecture to codify — the collector's grammar is tracked separately.

### 10.3 Plane identity: three concepts, never conflated

- **Identity** — `plane.id`: a stable OPAQUE string; `planeId` equality is the only sanctioned "same plane?" predicate, never path comparison. Opacity is enforced on **resolved values** by one predicate (`isOpaquePlaneId`) behind two surfaces — the module-load guard and the leaf's `parse` (env layer) — with the boot assertion (§10.4) closing the third route: a custom config file the env parser never sees. *(Was three surfaces; the middle one was a second identity resolver with no production caller, deleted 2026-07-25 per §10.1.)* A guard that covers only the frozen default protects the one value that cannot vary.
- **Resolved evidence** — `plane.dataRoot`: the durable root THIS process resolved; the single anchor every plane-member leaf default derives from (§10.5).
- **Checkout root** — `NEO_AI_CANONICAL_ROOT` names a checkout for provisioning-time hydration (`bootstrapWorktree.mjs`) and is deliberately NOT plane identity: a checkout-shaped identity would silently pre-decide the data-root placement election.

**Provisioning disposition:** the planeId is *declared by the deployment layer* (env → leaf, stable literal default). Both alternative branches are rejected: persisting it inside the plane is circular (the plane must be resolved to read the id whose purpose is making that resolution deterministic), and deriving it from path/checkout content re-imports the defect the opaque form exists to prevent.

### 10.4 The F-invariant boot assertion

`assertPlaneCoherence` (twin-side, pure, injectable): resolved `planeId` must be opaque; resolved `dataRoot` must be absolute (a relative root re-imports ambient-cwd resolution); and a NON-canonical `planeId` — a declared overlay — must not resolve, **symlink-transparently**, to the canonical durable root: identity-without-isolation would mutate the durable plane (the reconcile probe's symlink-escape class). The **member-coherence clause** (`assertPlaneMemberCoherence`, §10.5) extends the invariant to the member set: a declared member server walks its claimed `PLANE_MEMBER_PATHS` at the same boot point. Wired at the head of `BaseServer.runHealthcheckAndLogStatus()` — the building block every boot order calls after config load, so custom `boot()` overrides inherit it. Local wake-delivery files participate through their declared plane-member leaves when a local process owns that lane. ADR 0014 supplies the deployment taxonomy — wake delivery is local-only — rather than a separate file-freshness premise; the per-profile disposition is recorded in §10.7.

### 10.5 Member derivation: the A9/A2 decision rule + enforced coherence

Plane-member leaf defaults derive from ONE module-scope anchor (`resolvePlaneDataRoot({env: {}, rootDir: neoRootDir})` — **env-free** twin resolution; the leaf machinery owns all env binding, so the anchor computation is not an inline env read). Because `plane.dataRoot` is itself env-relocatable while member DEFAULTS are anchor-static, the derivation rule alone cannot guarantee coherence on the relocation branch — so the contract is derivation **plus enforcement**:

- **Member defaults → static derivation from the anchor** (A9): `leaf(path.resolve(planeDataRoot, 'sub'), ENV, 'string')` — one source, no per-leaf re-derivation.
- **Enforced coherence at boot** (the member-coherence clause): each member config base exports its claimed `PLANE_MEMBER_PATHS`; at boot, every claimed member must resolve **beneath the RESOLVED `plane.dataRoot`** or be **explicitly placed** (resolved ≠ its declared default). Setting `NEO_PLANE_DATA_ROOT` alone — a relocated root with members still on their anchor defaults — is a partially-moved plane and **fails boot**: relocation is per-member placement work (member env bindings / the per-profile election), never an implicit cascade.
- **Child of a RELOCATABLE parent leaf → formula** (the A2 remedy): a child *within* the plane whose parent leaf is itself relocatable is genuinely computed from the parent's RESOLVED value — an explicit `*Override` leaf wins, else derive from the resolved parent, so relocating the parent moves its children (the `wakeDaemon` watermark shape).
- **Declared membership → mechanically complete** *(2026-07-25, #15932)*: the claimed `PLANE_MEMBER_PATHS` lists must EQUAL the set derivable from the descriptor tree, because the alternative guards the wrong direction — a pinned count (`expect(list.length).toBe(N)`) plus a self-resolution check catches deletions and nothing else, while the operation that actually happens (add a plane-anchored leaf, forget the list) passes green forever with a real member outside the boot coherence assertion *looking guarded* (#15872's `storagePaths.graphProd` was the first confirmed instance). So **declaration and membership are one act**: every leaf whose default resolves beneath the plane anchor carries an explicit `planeMember` decision in its descriptor metadata — `true` (a member), or `false` with a non-empty `planeMemberReason` (an explicit non-member, e.g. the profile-pinned `tenantRepoMirrorRoot` and the `plane.dataRoot` anchor leaf itself). `derivePlaneMemberPaths` walks the descriptor tree and **fails closed** on an anchored leaf with no decision; the declared lists stay declared exports (membership is intent, never a derivable property — the §10.5 "explicitly placed" distinction), and the spec asserts set-equality rather than a literal count, so a legitimate membership change never needs a pin bumped. The completeness half applies to ALL declaring bases (Tier-1 + per-server), not only the file the question was first asked about.

Per-profile-pinned members (e.g. a canonical base/cloud default naming that profile's plane root) stay explicit rather than force-anchored; relocated profiles bind them declaratively per the election in §10.7.

### 10.6 Observed identity — resolvable is not observable

A deployment manifest compares desired vs OBSERVED per service, so each process REPORTS its resolved `{plane.id, plane.dataRoot}` on its healthcheck payload (a tool-layer spread reading the SSOT at the use site). Host-side re-derivation cannot populate an observed column — it degrades the comparison to desired-vs-desired, which passes trivially and detects nothing.

### 10.7 Per-profile placement election (#15800)

The election is **per profile**, not one bind-versus-volume rule imposed on unlike workloads. `plane.id` remains opaque and never derives a filesystem path or port. The deployment profile declares placement; the runtime asserts the resolved identity/root and declared member set; static Compose coverage closes the profile-pinned leaves that are intentionally outside that walk.

| Profile | Plane placement | Profile-pinned members | Wake-delivery disposition | Host publication |
|---|---|---|---|---|
| Base/cloud (`ai/deploy/docker-compose.yml`) | Canonical `/app/.neo-ai-data`; named volumes persist the service-owned subtrees. | `orchestrator.tenantRepoMirrorRoot` keeps its canonical `/app/.neo-ai-data` default. `backupPath` is pinned to `/app/.neo-ai-data/backups` via `NEO_BACKUP_PATH` and its host source bound from `NEO_HOST_BACKUP_ROOT` (default `${HOME}/.neo-ai/backups`) — **two separately named contracts, never one value** (§10.9). Repeated graph and handoff env entries use scalar YAML anchors so their rendered values cannot drift by service. | ADR 0014 disables local-only wake delivery in the cloud scheduler profile; no cloud wake-file freshness contract exists. | MCP services are internal and reached through ingress; the profile does not publish the local parity band. |
| Canonical local hard cut (`docker-compose.yml` + `docker-compose.local-agent-os.yml`) | Docker-owned named volumes persist the canonical `/app/.neo-ai-data` plane; the pre-Docker checkout plane is an import source, never a live bind target. Chroma owns its Docker volume. | Canonical provider/corpus state stays inside Docker. The container Orchestrator uses its plane state member; a graphless host-edge Orchestrator uses a distinct host-only state root and cannot open local graph storage. | The container uses `container-plane`; a launchd-supervised signed Shape-B receiver remains the final-mile security boundary. A separate `host-edge` scheduler invocation initially owns only LM Studio supervision. `legacy-mixed` and Shape C are absent. | IPv4 loopback `3102` path-routes authenticated `/kb/mcp` + `/mc/mcp`; Chroma publishes `8000` for host-local diagnostics. |
| Dev parity (`ai/deploy/docker-compose.dev.yml`) | Relocated hybrid: source stays a repo bind at `/app`; the declared plane root `/app/.neo-ai-data-parity` rides a Compose-managed named volume, as does Chroma. Project name and `plane.id` share one YAML scalar. | The shared `x-plane-env` places every declared member and explicitly binds `NEO_TENANT_REPO_MIRROR_ROOT` and `NEO_BACKUP_PATH` to the relocated root. These explicit bindings are mandatory because both leaves are `planeMember:false` and therefore outside the boot member walk. Parity keeps its bundles inside the parity root deliberately: they are disposable fixture artifacts on a named volume, so neither §10.9 hazard applies. | Its container orchestrator uses the cloud-safe lane profile, so wake delivery remains with the separate host-local Agent OS edge on the canonical local plane; the parity containers neither read nor deliver those wake files. | The default plane uses IPv4 loopback `3100` (KB), `3101` (MC), and `8100` (Chroma): 31xx for MCP, 81xx for engine primitives. Additional concurrent planes declare distinct publications; ports are never hash-derived from opaque identity. `probePortClaims` observes host claims, while MCP healthchecks prove served `{plane.id, plane.dataRoot}`. |
| Parity CI overlay (`ai/deploy/docker-compose.parity-ci.yml`) | Inherits the dev placement and project scoping, but replaces provider auth and removes host publication behind an internal network. | Inherits `x-plane-env`; no second placement map. | No host wake-delivery lane. | No host ports; topology probes run inside the Compose network. |
| Integration fixture (`ai/deploy/docker-compose.test.yml`) | Explicit ephemeral test topology: service-specific tmpfs paths under `/tmp/neo-integration`; it is not a durable Agent OS parity profile. | No durable profile-pinned plane contract is claimed. | No wake-delivery lane. | Fixed 13xxx/18080 fixture ports belong to the isolated integration harness, not the local parity band. |

**Legacy Shape-C wake-envelope reading:** until #16167 deletes it, the local graph worker owns two independently overridable plane members, not one implied root. Wake-daemon cursors, watermarks, logs, PID, and delivery state derive from the resolved `memoryCoreConfig.wakeDaemon.dataDir` (`NEO_AI_DAEMON_DIR`); the swarm-heartbeat liveness sentinel resolves separately through Tier-1 `wakeDaemonHeartbeatAlivePath` (`NEO_HEARTBEAT_ALIVE_PATH`). A relocated process that owns either lane must explicitly place the corresponding member and passes the §10.4/§10.5 boot checks. The canonical hard cut does not relocate those members: container Memory Core owns heartbeat/coalescing, while the graphless host receiver takes explicit manifest/state paths outside AiConfig. The current cloud/dev-container/test profiles own neither local-only Shape-C lane, so there is no cross-profile file-freshness dependency to preserve.

**Revalidation trigger:** adding a durable profile, moving a profile-pinned leaf, changing the local 31xx/81xx publication, or enabling a local-only wake lane inside a container profile reopens this election. The change must update this matrix and re-run plane-config coherence, static Compose placement coverage, served-identity checks, and the integration-parity topology suite.

### 10.8 Orchestrator task-authority profiles (#16166)

`orchestrator.deploymentMode` and task authority are orthogonal. Deployment mode owns the existing
local-only/cloud-only defaults; it cannot express two supervisors on one machine. The Tier-1 leaf
`orchestrator.authorityProfile` therefore resolves exactly one explicit role:

| Profile | Owned authority classes | Disposition |
|---|---|---|
| `legacy-mixed` | host-edge + container-plane + shared-primitive | Compatibility profile for existing maintainer checkouts until #16167 performs the machine cutover. It is a named value, never a fallback inferred from `deploymentMode`. |
| `host-edge` | host-edge | Owns local session/desktop/worktree/process effects. It cannot reclaim plane work through a per-lane boolean. |
| `container-plane` | container-plane + shared-primitive | Owns cloud-capable Agent OS maintenance. Compose declares this role for both production and dev-parity orchestrators. |

The canonical leaf defaults are `deploymentMode=cloud` and
`authorityProfile=container-plane`. Production Compose therefore does not restate
those values or the matching disabled local/model lanes. A host Orchestrator, where
one is elected, opts into both `deploymentMode=local` and
`authorityProfile=host-edge`; this keeps deployment defaults and task ownership
orthogonal while making the container reality the zero-override path. Secrets,
provider/tenant choices, network placement, and privileged runtime capabilities
remain deployment inputs rather than config policy.

The #16039 rerun makes that boundary mechanical. Canonical Compose carried 45
unique `NEO_*`/`MCP_*` keys before the cut: 10 were already-retired MCP startup
controls and seven more restated static or derived defaults. The guarded surface
now contains 28 unique keys:

| Deployment category | Keys | Meaning |
|---|---:|---|
| Required choices / placement / capabilities | 11 | Transport, network/Chroma/plane paths, in-process WAL ownership, Compose project, runtime-access enablement + allowlist |
| Optional overrides | 15 | Provider/model/ask selections and non-default WAL cadences |
| Secrets | 2 | OpenAI-compatible and KB ask credentials; secret values never become config policy |

`ai/scripts/lint/config-leaf-parity.json` owns the exact classified key lists,
service-to-config-template map, and retired/derived denylist. The existing
AiConfig lint fails when canonical base/dev Compose reintroduces a denied env,
sets a literal equal to the owning leaf default, or drifts the 28-key census.
Interpolated provider choices remain deployment inputs and are not mistaken for
literal default restatements.

Authentication is the worked derivation example. `auth.mode=github-pat` derives
`autoProvisionIdentitySources=['github-pat']` and a safe single-provider-subject
pin; GitLab derives its own provenance, while non-PAT modes derive no provider
source. A plural-resident GitHub plane explicitly opts the pin out. The
bootstrap/healthcheck PAT is provisioned once as a file-backed Compose secret;
repository workflow PATs, signed-wake HMACs, and resident remote-MCP bearers are
distinct credentials.

The leaf is the only environment binding (`NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE`). The daemon
entrypoint reads it once at `start()`; leaf consumers do not re-read env, infer a role from
`deploymentMode`, pass the role down a call chain, or mutate runtime config. The pure
`taskAuthority.mjs` policy consumes that resolved value and the canonical task registries.

Before PID recovery, database initialization, or polling, the orchestrator audits the relevant
topology for an explicit classification plus exactly one owner per continuous, scheduled,
recurring-internal, or auxiliary-child lane. Unknown roles, missing classifications, ownership
gaps, and duplicate owners fail boot. A secret-free `orchestrator-authority.json` receipt records
`role`, `task`, `authorityClass`, and `effectiveOwner`; per-lane enable flags remain enablement only
and cannot transfer authority.

**Sunset trigger:** once #16167's maintainer-machine receipt is accepted, the immediate cleanup
series removes `legacy-mixed`. Before resident release, rollback restores the pre-cut root under
the tracked preparation revision. The first resident release is forward-only. Receipt acceptance
triggers immediate cleanup; the post-cleanup tree does not retain a second runtime product.

### 10.9 A plane's escape hatch is not a plane member (#16201)

**An artifact whose purpose is surviving the plane must not resolve beneath it.** `backupPath` was
`planeMember: true` with a plane-anchored default, which resolved the backup root inside the git
working tree. `.neo-ai-data` is gitignored, correctly and non-negotiably at these sizes; `git clean
-x` is *defined* as reaching ignored files. Two individually-correct facts, jointly destructive —
observed as a dry-run listing 36 bundles, ~133 GB, one reflexive command away.

The remedy is classification, not a guard: `planeMember: false` with a `planeMemberReason`, and
**every profile places it explicitly** — the `orchestrator.tenantRepoMirrorRoot` shape. A member that
must escape the plane was never a member.

**Scope of the guarantee, bounded deliberately.** The relocation changes how the DEFAULT is
derived: it no longer derives from the Compose project/checkout path. It does **not** establish that
bundles occupy a different physical filesystem from the graph or that repository operations can
never reach them: an explicit override may still place them under a checkout, and a checkout may be
placed under the default path. Whether backup and graph should share a failure domain at all is a
**separate, latent** concern with its own owner; at the time of writing no capacity incident has
occurred. This subsection is about *placement relative to the checkout*, and must not be cited as
having settled the capacity question — the two are easy to conflate precisely because one
relocation could in principle serve both.

**The paired rule — host source and container target are separate contracts, separately named.**
Before #16201 the canonical Compose bind source (`./.neo-ai-data/backups`, relative to the project
directory) and the config default (`path.resolve(planeDataRootDefault, 'backups')`) agreed **only
because both derived from the plane root.** Nothing asserted the agreement; it was a coincidence,
and coincidences break silently when either side moves. The half-fix is the instructive part: giving
the container an explicit target while leaving the host source in-tree leaves the deletion vector
fully intact, and moving the config default without an explicit container target sends bundles to an
unbound writable-layer path where they vanish on the next recreate. **Each half alone is worse than
the coupled original.**

So the two are declared separately and never collapsed into one value:

| Contract | Binding | Requirement |
|---|---|---|
| Host source | `NEO_HOST_BACKUP_ROOT` (default `${HOME}/.neo-ai/backups`) | the **default does not derive from the Compose project/checkout path**. That is the whole contract: an explicit override is unconstrained, and a checkout placed under the default path would still be reachable by repository operations |
| Container target | `NEO_BACKUP_PATH` | explicit per-profile placement; mandatory once the leaf left the member walk |

**Generalization for future leaves:** when a leaf crosses a namespace boundary — host filesystem vs
container filesystem — one value cannot carry both contracts even when it happens to render the same
string. Name them separately and assert each against its own invariant, or the next relocation
re-derives this incident.

**Revalidation trigger:** reclassifying any leaf's `planeMember` decision, or changing either backup
contract, updates §10.7's matrix and re-runs plane-config coherence plus static Compose placement
coverage. Parity profiles that keep disposable bundles inside their own relocated root are exempt
from the host-source requirement and must say so where they bind it.

---

Origin Session ID: `3ecb40bf-bfef-40b1-8693-a8aae5afa1b7`

Retrieval Hint: `query_raw_memories("AiConfig reactive Provider SSOT antipattern read-gate ADR 0019")` or commit-range anchor on this ADR's first commit.
