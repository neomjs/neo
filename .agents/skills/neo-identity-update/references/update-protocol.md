# Update Protocol — step by step (the Map)

Use when applying an identity change (a new tagline, a corrected fact, a new capability that outgrew the framing, or a CTA / next-step surface). This file is the entry point; it routes to the four payloads below as each step needs them:
- **Surface inventory** (every surface, 5 update-mechanism classes, file:line) → `./affected-areas-map.md`
- **Facts source-of-truth ledger** (version, server count, Node, handle, motto, metrics) → `./facts-ledger.md`
- **Framing governance** (apex, audience clusters, drift-vs-divergence escalation, claim V-B-A gate) → `./framing-governance.md`
- **CTA governance** (ACTIONS, next-step doors, liveness, proof adjacency, business-owned content boundary) → `./cta-governance.md`

## Step 0 — Scope the change
State in one line WHAT is changing and whether it is a **FACT** (single value), **FRAMING** (positioning), or **ACTION** (CTA / next-step surface). Most changes are one class; mixed surfaces must be split. Example: in "try the first multi-worker engine", the CTA is an ACTION, "first/2019" is a FACT, and the surrounding claim is FRAMING.

## Step 1 — Enumerate the affected surfaces
Open `./affected-areas-map.md`. For the thing you're changing, list EVERY surface across all 5 classes that carries it. Do not stop at the README. Grep to confirm occurrences:
```bash
# example: who states the MCP-server count?
grep -rinE "MCP server|MCP Server" README.md .github/ learn/ apps/portal/index.html buildScripts/docs/seo/generate.mjs
```

## Step 2 — Apply the correct mechanic per class
- **FACT** → fix the SSOT (see `./facts-ledger.md`), then derive / coherence-check every other occurrence. Never hand-edit a derived copy and call it done.
- **FRAMING** → see `./framing-governance.md`. Check each surface for compatibility with the apex (not equality — audience-segmentation is deliberate). If a surface *contradicts* the apex, classify drift-vs-divergence; escalate divergence to the operator.
- **ACTION** → see `./cta-governance.md`. Enumerate CTA-bearing surfaces, verify each primary door is live, keep proof near strong claims, and record business/product dependencies instead of inventing offer copy.
- **Class 2 (generated)** → edit `buildScripts/docs/seo/generate.mjs`, then rebuild and diff the output. NEVER edit `llms.txt`/`sitemap.xml` directly.
- **Class 4 (external)** → use `gh repo edit` / npm publish flow; these won't appear in your diff, so list them explicitly in the PR body as out-of-tree changes.
- **Class 5 (dated-snapshot)** → update the as-of date and refresh the lock-step sibling in the SAME PR.

## Step 3 — Verify claims (V-B-A gate)
Before writing any "fastest / only / first / Nth" into a surface, run the check in `./framing-governance.md` § claim gate. Drop unbounded superlatives or hedge them. Regenerate every number from its SSOT at this step.

For ACTIONS, also run the liveness and proof-adjacency checks in `./cta-governance.md`. A CTA that points at a dead / low-retention / unverified surface cannot be primary. A strong claim with no nearby proof door fails the ACTIONS gate even if the prose is otherwise accurate.

## Step 4 — One PR, cross-family review
- Branch + PR targeting `dev` (per repo pull-request workflow). Reference the identity ticket and ADR 0018.
- **Mandatory: request a cross-family review.** Identity edits are single-author, high-blast canonical-framing changes — exactly the self-authored-blind-spot class cross-family review catches (anchors: PRs #12146, #11999, #11962). If only one family is active, the human merge-gate is the backstop; say so in the PR.
- In the PR body, list the out-of-tree (Class 4) changes separately so the reviewer can confirm them.

## Step 5 — Post-merge
- If a fact's SSOT or propagation tooling was missing (e.g. `prepare.mjs` didn't cover a surface), file the gap as a follow-up so the next update auto-propagates.
- If a CTA needs operator-owned offer content, lead-capture routing, pricing, or business language, record the dependency instead of inventing it.
- If you sharpened the apex, confirm ADR 0018 §2.7 reflects it.

## Anti-patterns
- Editing only the README and declaring identity "updated."
- Editing `llms.txt`/`sitemap.xml` output instead of the generator.
- Find-replacing a tagline across all surfaces (destroys deliberate audience-segmentation).
- Find-replacing a CTA across all surfaces (destroys audience-segmented doors).
- Letting a pitch end in passive docs when the audience needs a next-step door.
- Inventing offer / contact / pricing content that belongs to the operator or product lane.
- Pasting a number into prose with no SSOT link (it will rot).
- Shipping an identity PR single-family with no cross-family review and no merge-gate note.
- Renaming a GitHub handle in 63 files by hand instead of routing through `ai/graph/identityRoots.mjs`.
