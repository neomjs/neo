# ADR 0040: The AgentOS Extraction Topology — One Repository Whose Root Is the Host Edge

> The Agent OS leaves `neomjs/neo` for **`neomjs/neo-agent-brain`** — ONE repository whose root
> manifest IS the Host-Edge package: root scripts are Edge-only, `cloud/` is an independent nested
> package that installs alone, npm workspaces are forbidden because hoisting is the falsifier of the
> isolation this topology exists to prove, and a pure `shared/` package exists only if the inventory
> proves a population for it. AgentOS depends on the published Engine; the Engine's production graph
> never depends back — its test infrastructure consumes the extracted package as pinned dev-time
> tooling only. Runtime root and target root are two authorities that never collapse into one cwd. Nothing
> relocates until two receipts exist — the zero-residue inventory and the paired isolation exercise —
> the cut precedes the v13.2 Engine release, and no historical `neomjs/neo` SHA changes, ever.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-08-22 (transitions to Accepted only on approved, green PR merge at the human merge gate, per ADR 0005) |
| **Author** | Vega (@neo-opus-vega), recording the D#17489 convergence; topology authored by the swarm — Emmy's C′ fold + STEP_BACK, the operator's root-invariant and function-legibility challenges plus the winning name candidate, Grace's severance rows and build-vocabulary naming convergence, Clio's staged-split falsifiers, Euclid's two-root consumer correction |
| **Resolves** | #17502 — the `Required: ADR` gate on Epic #17500's topology authority |
| **Graduated from** | Discussion #17489 — family-keyed quorum (Signal Ledger in the Epic #17500 body): GPT author signal + Claude `[GRADUATION_APPROVED]`, re-issued and REVALIDATED at the root-invariant correction `DC_kwDODSospM4BFFq_`; two-root authority + release sequence folded at `DC_kwDODSospM4BFJBP` (2026-08-23) |
| **Depends on** | ADR 0039 — this ADR realizes its Brain-internal host-edge ↔ container-plane boundary as *repository and package* topology; 0039's proof semantics (two instruments, neither sufficient alone) are inherited, not replaced. ADR 0019 — realm disposition may move config files but may not create a second config authority. |
| **Aligns with** | ADR 0018 — the extracted repository is the Brain's new home; the Body (`/src/`) stays in `neomjs/neo`, and this ADR moves nothing across that seam |
| **Anti-anchor for** | npm workspaces anywhere in the new repository; package-omission presented as isolation; `process.cwd()` as target-repo authority; `npm run` plus one shared cwd carrying both root meanings; an orchestration-only root manifest; extracting Core or `src/ai/**`; a second Engine history rewrite; treating first-wave custody as permanent global topology |

---

## 1. Context

The Brain (`ai/`) and the Body (`src/`) stopped being one deployable long before they stopped being
one repository. The engine→Brain boundary reads zero crossings (#17239); the engine provably
releases with `ai/` deleted; and the root `package.json` mixes three realms of scripts while
`ai/scripts` holds ~157 `.mjs` files across nine realm-blind folders. The operator direction of
2026-08-21 set a one-week extraction wave; D#17489 converged the shape; Epic #17500 coordinates it.

The converged decisions were load-bearing but distributed — a long Discussion, a Stage-2.5
STEP_BACK, an author correction, and an Epic body. A later migration PR could pick a locally
convenient workspace, root script, or cwd fallback and still look consistent with one fragment of
that conversation. This record exists so it cannot.

## 2. Decision

### §2.1 One repository; the root manifest IS the Host-Edge package

The first wave extracts the Agent OS into one new repository: **`neomjs/neo-agent-brain`** —
closed by disjoint two-maintainer convergence on the operator-proposed candidate
([#17502 close receipt, 2026-08-23](https://github.com/neomjs/neo/issues/17502#issuecomment-5387121429),
superseding the 2026-08-22 `neo-cortex` close after the operator's function-legibility challenge):
`agent` carries the function axis, `brain` carries the vocabulary the build already enforces
(`package.brain.json`, `engine-brain-boundary-lint`, the `unit-brain` test projects), and every
registry form (`neo-agent-brain`, `neoagentbrain`, `agentbrain`, the GitHub org/user namespace) was
verified free under two independent instruments. "Agent OS" remains the subsystem term regardless of
the repository's concrete name (§2.10).

**Contraction discipline** (Grace's convergence condition, on the record): the full form is the only
registry and import surface. The intended prose shorthand is the canon hemisphere term "the Brain";
spoken contractions ("neo brain", "agent brain") are speech-only drift and never name artifacts.

- **Repository root = the Host-Edge package surface.** Root scripts are Edge-only. There is no
  orchestration-only root manifest, and no Cloud operation is runnable from the local root. The
  operator challenge that produced this inversion is the hoist falsifier stated positively: a root
  that owns no packages cannot hoist Cloud dependencies into Edge reach.
- **`cloud/` = an independent nested package.** It installs alone, runs alone in containers, and its
  entrypoints additionally fail loud when started outside their plane.
- **npm workspaces are forbidden.** Workspace hoisting can resolve a Cloud dependency from the Edge
  root, which silently restores exactly the reachability the split removes. Nested packages install
  independently; hoisting is the falsifier, not an inconvenience.

### §2.2 `shared/` is admitted — the accepted inventory proved its population

The gate was conditional; the proof has run. The accepted inventory (#17525, merged) establishes
**exactly one** pure cross-plane module — `ai/scripts/benchmark/helpers/stats.mjs`, reached by both
planes' benchmark roots and owning no capability — so the plane-neutral `shared/` package **exists
in the first wave** for the inventory-owned population. Custody split: **the registry owns the
list; this record owns the admission rule** — pure, driver-free, capability-free, no ambient config
authority, both planes depending on it explicitly. Growth happens through registry rows under that
rule, never by editing this record, and proof 2 revalidates the population at the cut. An
empty-but-present `shared/` stays refused: if the registry's shared population ever empties, the
package retires with it — a future dumping ground wearing a contract's name is the failure mode
this rule exists to block.

### §2.3 Dependency direction: AgentOS → published Engine; the Engine's production graph never back

The extracted repository consumes the Engine as a **published package**. The Engine never imports
from the extracted repository, and `src/ai/**` (the Body-side AI surfaces) stays Engine-owned. The
release seam already exists as the two-command protocol: `publish.mjs` owns the Engine half;
`ai:post-release-sync` owns the Brain half with a fail-closed preflight (#17239).

The covenant is **production-strict, with one explicit dev-time carve-out** — decided here because
the measured consumer classes
([`DC_kwDODSospM4BFJL_`](https://github.com/neomjs/neo/discussions/17489#discussioncomment-18125567))
determine whether "Engine-only clone remains testable" and "no Engine→AgentOS dependency" can both
stay true:

- **Engine test infrastructure and `apps/agentos` specs** (the whitebox-e2e fixture is the second
  Bridge entrypoint, importing seven Neural Link services; the app specs import fleet services)
  consume the extracted package as a **pinned devDependency, test tooling only**, with the Bridge
  arriving as a package-owned bin per §2.5's family-1 shape. The production import graph stays
  Engine-only and mechanically enforced: the existing engine-brain boundary checker extends to fail
  any `dependencies`-reachable or `src/**`/`buildScripts/**` Brain import while permitting `test/**`
  dev-time consumption. The move leaf rewires the fixture's relative imports; the Engine-only clone
  proof (leaf 12) proves the clone **buildable without** and **testable with** the devDependency.
- Rejected in place: relocating the NL-dependent e2e population out of the Engine (the Engine loses
  its own component-regression loop) and vendoring the Bridge (the parallel-substrate trap §2.11
  already names).

The D#17489 body carries this fold's source measurement; its author-side mirror follows the same
anchors. A migration PR may not widen the carve-out beyond `test/**` dev-time consumption.

### §2.4 Isolation is a proof-set, not a package-omission claim

"The Edge cannot reach a durable store" is established by the full set, inherited from ADR 0039 and
extended to the new topology:

1. **reconciled membership** — every executable/command/workflow/config surface dispositioned by the
   inventory, with membership authority reconciled against disk reality;
2. **isolated Edge install** — `npm ci` at the Edge root on a machine without the Cloud packages;
3. **static closure** — the module-graph walk (`scriptPlaneClosure.mjs` lineage);
4. **runtime denial** — the spawned-process denial witness (the only instrument that sees
   eager-lifecycle reach; a green static walk is never the whole property);
5. **Cloud positive control** — the same denial harness proving the Cloud plane genuinely needs what
   the Edge is denied;
6. **computed-import disposition** — dynamic/`await import()` sites individually dispositioned.

### §2.5 Two root authorities, never one

- **`agentosRuntimeRoot`** — where the Agent OS itself is installed and runs.
- **`targetRepoRoot`** — the checkout the Agent OS operates ON (a tenant codebase, or `neomjs/neo`
  itself).

Fleet's existing provisioning already separates installed `mainCheckout` from target `repoPath`;
C′ promotes that separation to named authorities. **`process.cwd()` is never a fallback for the
target root**: the binding is explicit and fails loud when absent. The negative-fallback proof is
part of the paired exercise, because a cwd default is the kind of convenience that survives every
review until an operator runs a command from the wrong directory.

**Consumer mapping** (Euclid's source-bound tightening `DC_kwDODSospM4BFI-g`, folded
`DC_kwDODSospM4BFJBP` — the monorepo hides this because both roots are one path today):

| Authority | Owns | Must not own |
|---|---|---|
| `agentosRuntimeRoot` | Agent OS MCP executable/package resolution; the Neural Link Bridge spawn root (`--cwd` names THIS, never the target) | the repository GitHub Workflow acts on merely because the server runs there |
| `targetRepoRoot` | the resident's active checkout; Git/worktree/project truth for GitHub Workflow, startup-bound | Agent OS executable or Bridge discovery |
| ambient `process.cwd()` | nothing | fallback for either root |

What does not survive the split: `npm run` plus one shared cwd carrying both meanings. The
generated-seat proof runs with **different** runtime and target directories and carries two negative
controls — swapped roots fail on the named boundary, and an omitted binding fails loud without
recovering through `process.cwd()`. Already-provisioned ignored seat configs are **re-materialized
and read back at cutover**; a corrected template alone is not migration evidence. The merged
same-root repair for the current monorepo (#17611 / PR #17610) is a compatibility fix, not
extraction precedent, unless explicitly revalidated against this contract.

**Tracked seat hooks are the third consumer family** (beyond Neural Link `--cwd` and GitHub
Workflow's target binding): they run every seat turn in the target checkout and today import Brain
lifecycle modules relatively. Post-split they resolve Brain substrate only through
`agentosRuntimeRoot`-provisioned artifacts per §2.7's custody ruling — never relatively from
`targetRepoRoot`.

### §2.6 The two blocking receipts precede every relocation leaf (criteria 2/3, amended timing)

Per the author correction `DC_kwDODSospM4BFFq_` — which explicitly amended "before Epic filing" to
"before the first relocation leaf" as the smallest honest repair under the one-week window:

1. the **zero-residue inventory + membership-authority reconciliation** (#17525) and
2. the **temporary-layout paired exercise** of membership + isolated Edge resolution +
   static/runtime denial + Cloud positive control (#17533)

are the Epic's first two blocking proofs. **No relocation leaf starts until both receipts are linked
from Epic #17500.** Undispositioned population and unexercised isolation block every move; the
timing amendment relaxed *when* the receipts exist, never *whether*.

**The receipts are red-capable, and that is the contract rather than a concession** (the #17533
premise correction, validated 2026-08-23): proof 2 runs before the store-edge severance leaf, so a
receipt demanding zero Cloud reach at that point is a proof that cannot honestly fail — which is a
proof of nothing. Instrument integrity and paired controls must be green; the membership, static
reach, runtime denial, and computed-edge results are exact current-head truth whose blockers may be
NON-EMPTY; every non-empty finding names the successor leaf that owns it and whether it blocks
relocation; and relocation authorization requires the receipt to exist AND its named pre-move
blockers to be discharged. The already-scheduled severance stays leaf 3 — never smuggled into
proof 2, never an excuse for the proof to pretend green.

**Release sequencing (operator decision, folded 2026-08-23 at `DC_kwDODSospM4BFJBP`):** the Agent OS
repository cut plus the Engine-only clone/build/test/onboarding proof **precede the v13.2 Engine
release**. The split is the onboarding simplification v13.2's story rests on; publishing onboarding
instructions against a topology scheduled to disappear would invert that. Sequencing orders the
releases; it waives none of the receipts, the naming disposition, the cut window, or live
acceptance. Within the wave, the operator's tempo guidance permits draining adjacent backlog first —
notably the Neural Link consumer set — because the cut inherits whatever suite state exists when it
lands.

### §2.7 Wave-one custody — what stays Engine, explicitly

Staying in `neomjs/neo` in wave one: `apps/**` (the FM's later home is its own decision), published
`learn/agentos` content and every Portal/SEO/tree input derived from it, `resources/content`
mirrors, `src/ai/**`, and the minimal Engine contributor surface. The extracted repository takes the
Brain's executables and services per the inventory's disposition — custody follows the dispositioned
population, not directory intuition.

**Tracked seat hooks move.** The `.claude/hooks`, `.codex/hooks`, and `.kimi-code/hooks` files are
Agent OS substrate (lane-state, wake, presence are Brain concepts) that imports `ai/scripts/lifecycle/*`
relatively; leaving them tracked in the Engine breaks them the moment `ai/` leaves. They relocate to
the extracted repository, and **seat provisioning materializes them into target checkouts as
generated-not-tracked artifacts** — the same covenant shape as §2.5's seat-config re-materialization.
The seat re-provisioning leaf (leaf 11) owns this scope explicitly, and the Engine's ignore rules
take the generated paths.

### §2.8 Conversion, canary, cut window

- **Label provisioning + a one-ticket transfer canary** precede any bulk ticket conversion.
- Converted items re-qualify under the legacy-alias shape (D#17247 OQ8); the "Agent OS extraction
  wave" holding milestone in `neomjs/neo` stages them (Phase 1 executed 2026-08-22, 26 items).
- The cut lands in a **named window** with an **in-flight-lane ledger**: every open PR/lane crossing
  the cut is enumerated with its disposition before relocation begins.

### §2.9 Migration provenance without history rewrite

No historical `neomjs/neo` SHA changes — the repository's commit history, cited by tickets, Memory
Core sessions, and ADRs, is load-bearing substrate. Provenance for moved code lives in the wave's
ledger and the new repository's import commits, not in a rewritten past. (The v13.0 4.83GiB
pack-size problem is real and is NOT solved by this wave; solving it by rewrite is permanently out
of scope here.)

### §2.10 Vocabulary and scope boundaries

- **Repository name ≠ subsystem term.** "Agent OS" names the subsystem in docs and speech regardless
  of the repository's concrete name; the name itself is the #17502 naming disposition's output.
- **ADR 0039 is realized, not replaced.** Its two-plane executable boundary becomes package topology
  here; its proof semantics and its §2.4 debt ledger are untouched.
- **D#17247 remains the long-term topology authority.** This ADR decides wave one. A future physical
  Edge split, FM repository, or Core extraction re-opens there, not here.

### §2.11 Rejected alternatives and their falsifiers

| Rejected | Falsifier |
|---|---|
| Two repositories now (Cloud + Edge as separate repos) | Doubles the cut surface inside a one-week window; every seam the paired exercise must prove would exist twice; D#17489 matrix option B carried no champion after the fold |
| npm workspaces with per-plane packages | Workspace hoisting resolves Cloud dependencies from the Edge root — the ancestor-hoist falsifier; "installed independently" stops being checkable |
| Orchestration-only root manifest (packages both nested) | Inverted by the operator challenge: a root that owns the Edge surface cannot be hoist-poisoned, and an orchestration root re-creates the three-realm root-script mix the extraction exists to end |
| Package omission presented as isolation | ADR 0039's central lesson: reachability survives omission via eager lifecycles and computed imports; only the §2.4 proof-set decides |
| `process.cwd()` as target-root fallback | Convenience that binds the tool to wherever it was invoked; falsified by the negative-fallback requirement in the paired exercise |
| Extract Core or `src/ai/**` in wave one | Crosses the Body/Brain seam ADR 0018 anchors; no inventory disposition supports it; D#17247 territory |

## 3. Consequences and consumer obligations

- Every relocation/migration PR under Epic #17500 cites this ADR for topology and gate authority;
  the Epic stays the coordination umbrella and is never a PR close-target.
- A migration PR that introduces a workspace, a root Cloud script, a cwd fallback, or an
  Edge→durable-store reach is **refused on topology divergence**, whatever its local convenience.
- Config files may move realms; config *authority* does not multiply (ADR 0019 — one SSOT, no second
  resolver, no pass-along).
- The Engine's release protocol keeps its two-command shape; the extracted repository's release
  cadence is its own (release identity is a separate, still-open planning decision — deliberately
  not recorded here).

## 4. Avoided traps

- **ADR as implementation checklist.** This records decisions and gates. The Epic owns the child
  graph; duplicating it here would stale on the first re-scope.
- **Restating ADR 0039.** Realization, not replacement — one boundary, two altitudes.
- **Workspace = isolation.** The hoist falsifier survives every convenience argument.
- **Cwd = target authority.** The negative proof is required, not assumed.
- **"First wave" silently becoming permanent topology.** D#17247 stays open; §5's triggers reopen
  this record instead of letting it drift into a global claim it never made.

## 5. Verification and liveness

- **Receipts:** #17525 (inventory + reconciliation) and #17533 (paired exercise) linked from
  Epic #17500 are the blocking evidence; this ADR's §2.6 is satisfied by those links, never by
  prose.
- **Standing witnesses:** the static-closure and runtime-denial instruments (ADR 0039 §5 lineage)
  re-run against the new repository layout as part of the paired exercise.

**Revalidation triggers** — any of these reopens this record: a future physical Edge/Cloud
repository split; custody changes to `apps/**`, `learn/agentos`, or `src/ai/**`; a new plane
entrypoint class; a computed-import mechanism that bypasses the §2.4 disposition; any dependency
change that reintroduces hoisting; a new out-of-`ai/` Brain-consumer class beyond the three §2.3/§2.7
disposition (test infrastructure, app specs, tracked seat hooks); a widening of the dev-time
carve-out beyond `test/**`; renaming the repository after creation.

**Retirement:** this ADR retires only by explicit successor in this series; the wave completing
does not retire it — the topology it records is what "completed" means.

## Decision Record impact

`REQUIRED` — this record. It adds a forward relation to ADR 0039 (realized-by) and takes no position
on release identity, D#17247's long-term shape, or the FM repository — each owned elsewhere.

---

Origin Session ID: `9cd02a1c-1e51-4c53-a361-84adbc5daa4f`
