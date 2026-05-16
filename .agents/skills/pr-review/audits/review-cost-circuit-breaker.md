# Review-Loop Cost Circuit Breaker

This payload defines the compressed review mode when a PR has already cleared semantic risk but the discussion thread has become too expensive.

## Trigger Thresholds
Activate this circuit breaker when EITHER of the following is true:
- The PR has received **≥ 3 formal reviews**.
- The measured PR discussion thread exceeds **24,000 bytes**.

You can measure this by running: `node ai/scripts/review-cost-meter.mjs <prNumber>`

## Blocker Classes and Eligibility
- **Eligible:** `mechanical-hygiene` and `metadata-drift`. When semantic risk is cleared, the review MUST use the micro-delta format.
- **Ineligible:** `semantic-blocker`, `contract-blocker`, and `5-layer-coverage-blocker`. If these blockers exist, the PR MUST use the full review template.

## Maintainer Polish Fast Path
When this circuit breaker fires, reviewers may bypass the normal author-return loop for purely mechanical/metadata fixes.
- Reviewer may directly commit and push strictly mechanical/metadata defects.
- **Evidence of Verification:** Reviewer MUST provide an Evidence block stating the exact head SHA, the prior semantic review anchor, verification commands, and why full review reload is unnecessary.
- **FYI A2A:** Reviewer MUST broadcast an FYI to the swarm indicating a unilateral polish push.

## Micro-Delta Review Template

```markdown
# Pull Request Micro-Delta Review

> **Context:** This review is using the Micro-Delta Approval format because the Review-Loop Cost Circuit Breaker has fired. The underlying PR has previously received thorough semantic review and has reached the mechanical-hygiene or metadata-drift phase.

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
*Note: If a new semantic delta appears, this micro-delta format is invalidated and the reviewer MUST revert to the full `pr-review-followup-template.md`.*
```
