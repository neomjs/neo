# Review-Loop Cost Circuit Breaker

This payload defines two distinct responses when a PR's review loop has run long: a **cost-compression** path (when semantic risk is already cleared) and a **scope-too-big break-up** path (when semantic churn is not converging). Do **not** conflate discussion *size* with PR *scope* — they are different signals with different responses (see Step 1).

## Trigger Thresholds
Assess this circuit breaker when EITHER of the following is true:
- The PR has received **≥ 3 formal reviews**.
- The measured PR discussion thread exceeds **24,000 bytes**.

You can measure this by running: `node ai/scripts/review-cost-meter.mjs <prNumber>`

These are **cost/attention** triggers: they say "this review loop has become expensive," NOT "this PR is too big." Size, byte-count, file-count, and additions are explicitly **not** scope signals — a large but well-scoped greenfield or refactor PR can exceed 24KB and be perfectly fine. PR scope is judged by **convergence** (Step 1), never by bytes.

## Step 1 — Convergence Assessment (the ≥3-cycle classification)
At the trigger, classify the review history into exactly one of three states by looking at the **trajectory of distinct semantic blockers across cycles**:

- **(a) Semantics cleared** — no `semantic-blocker` / `contract-blocker` / `5-layer-coverage-blocker` open; only `mechanical-hygiene` / `metadata-drift` remain.
  → **Cost-compression path:** use the Micro-Delta Review Template (below). This is the original cost-saver.
- **(b) Semantic blocker, converging** — semantic/contract blockers are open but **narrowing**: each cycle resolves prior blockers and surfaces fewer (or no) new distinct ones.
  → **Full review** (`pr-review-followup-template.md`). The loop is making progress; let it finish.
- **(c) Semantic churn NOT converging** — across ≥ 3 cycles, **new distinct** semantic / contract / shape blockers keep appearing (different concerns each cycle, no narrowing): the PR is an epic-in-disguise.
  → **Scope-Too-Big Break-Up Verdict** (Step 2a). Do NOT run another full cycle, and do NOT assume approval.

Convergence is about whether the set of distinct semantic blockers is **shrinking across cycles**, not about the byte/line/file size of any single cycle.

## Step 2a — Scope-Too-Big Break-Up Verdict (state (c): non-converging semantic churn)
≥ 3 cycles of non-converging semantic churn is the empirical signal that the PR is **wrong-shape / too big** — not "almost done." (A mega-PR that ran 8 review cycles with no break-up call became an epic-in-disguise and was closed with everything lost — versus carving out and merging the converged ~50% early.) Common-sense "this is too big, break it up" empirically fails for AI reviewers, so it is codified here.

The mandated verdict is **break-up** — not another cycle, not assume-approval:

1. **Post a `CHANGES_REQUESTED` (Drop+Supersede) verdict** that names the **distinct concern-clusters** which surfaced across the cycles (e.g. "config + consumers + tests + a hard-rule violation = 4 separable tickets").
2. **Recommend decomposition via the `epic-create` skill**: one epic + scoped, one-PR-deliverable subs — **one concern per sub**. Point the author at the epic-create skill.
3. **Salvage the converged parts.** Any concern-cluster that DID converge must be carved into its own scoped PR and merged — do not let it die with the mega-PR (that is the `#12420` loss).
4. **Supersede the mega-PR** once the subs exist: close it with a pointer to the epic, rather than running cycle N+1.

This is a **verdict, not a new gate**: it reuses the existing ≥3-cycle trigger and the existing blocker classes; it only adds the non-converging branch and its break-up action.

## Step 2b — Maintainer Polish Fast Path (state (a) only)
When the cost-compression path (state (a)) is active, reviewers may bypass the normal author-return loop for purely mechanical/metadata fixes.
- Reviewer may directly commit and push strictly mechanical/metadata defects.
- **Evidence of Verification:** Reviewer MUST provide an Evidence block stating the exact head SHA, the prior semantic review anchor, verification commands, and why full review reload is unnecessary.
- **FYI A2A:** Reviewer MUST broadcast an FYI to the swarm indicating a unilateral polish push.

## Micro-Delta Review Template (state (a) only)

```markdown
# Pull Request Micro-Delta Review

> **Context:** This review is using the Micro-Delta Approval format because the Review-Loop Cost Circuit Breaker has fired and the convergence assessment is state (a): the underlying PR has previously received thorough semantic review and has reached the mechanical-hygiene or metadata-drift phase.

### State Vector
- **Target SHA:** `[Insert precise SHA being reviewed]`
- **Current reviewDecision:** `[Current GitHub reviewDecision]`
- **Semantic Status:** `[e.g., APPROVED / ALIGNED]`
- **CI Status:** `[e.g., GREEN / PENDING]`
- **Remaining Blocker Class:** `[mechanical-hygiene | metadata-drift]`
- **Measured Discussion Cost:** `[e.g., > 24KB]`

### Micro-Delta Focus
*Only defects classified as `mechanical-hygiene` or `metadata-drift` are reviewed here.*

- `[ ]` **Issue 1:** [File path / line] - [Description of remaining hygiene defect]

### Verdict
- [ ] **APPROVED** (All mechanical-hygiene cleared. Merge-ready.)
- [ ] **CHANGES_REQUESTED** (Mechanical-hygiene defects remain as listed above.)
- [ ] **MAINTAINER POLISH FAST PATH APPLIED** (Reviewer unilaterally patched and pushed fixes. Approved.)

---
*Note: If a new semantic delta appears, this micro-delta format is invalidated and the reviewer MUST revert to the full `pr-review-followup-template.md` — or, if new distinct semantic blockers keep recurring across cycles, to the Step 2a break-up verdict.*
```
