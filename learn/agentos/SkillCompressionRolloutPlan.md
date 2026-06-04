# Skill Compression Rollout Plan

This is the rollout-plan artifact for #11605 AC6. It converts the live
`ai:skill-size-report` inventory into risk/size-ordered batches for future
decision-atom compression work. It is topology only: each compression remains a
future child ticket or PR, preferably one skill per PR.

## Live Inventory Snapshot

Command:

```bash
npm run ai:skill-size-report -- --top 50
```

Snapshot date: 2026-06-04.

Summary:

| Files | Bytes | Lines |
|---:|---:|---:|
| 90 | 531238 | 6370 |

Top pressure rows:

| Rank | Bytes | Lines | Signals | Disposition | File |
|---:|---:|---:|---:|---|---|
| 1 | 48684 | 445 | 231 | compress-to-trigger | `.agents/skills/pr-review/references/pr-review-guide.md` |
| 2 | 36660 | 416 | 217 | compress-to-trigger | `.agents/skills/pull-request/references/pull-request-workflow.md` |
| 3 | 24872 | 193 | 154 | compress-to-trigger | `.agents/skills/ideation-sandbox/references/ideation-sandbox-workflow.md` |
| 4 | 21092 | 212 | 141 | keep | `.agents/skills/peer-role/references/peer-role-mode.md` |
| 5 | 15087 | 187 | 106 | keep | `.agents/skills/epic-resolution/references/epic-resolution-workflow.md` |
| 6 | 19007 | 205 | 100 | keep | `.agents/skills/session-sunset/references/session-sunset-workflow.md` |
| 7 | 17416 | 188 | 100 | keep | `.agents/skills/lead-role/references/lead-role-mode.md` |
| 8 | 11189 | 109 | 93 | move | `.agents/skills/ideation-sandbox/audits/consensus-mandate.md` |
| 9 | 18969 | 223 | 90 | keep | `.agents/skills/structural-pre-flight/references/structural-pre-flight-workflow.md` |
| 10 | 17895 | 176 | 75 | keep | `.agents/skills/ticket-create/references/ticket-create-workflow.md` |
| 11 | 16935 | 268 | 74 | keep | `.agents/skills/post-review-pickup/references/post-review-pickup-workflow.md` |
| 12 | 14024 | 149 | 73 | keep | `.agents/skills/pull-request/references/review-response-protocol.md` |
| 13 | 17655 | 138 | 66 | keep | `.agents/skills/ticket-intake/references/ticket-intake-workflow.md` |
| 14 | 15651 | 192 | 62 | keep | `.agents/skills/create-skill/references/skill-authoring-guide.md` |
| 15 | 18822 | 224 | 60 | keep | `.agents/skills/epic-review/references/epic-review-workflow.md` |

## Batch Rules

1. Work from the live report, not a stale hand list. Re-run
   `npm run ai:skill-size-report -- --top 50` before filing each child.
2. Keep one compression PR per skill unless two files are mechanically coupled
   by the same trigger pointer.
3. Preserve progressive disclosure: router text stays small, common-path
   decision atoms stay near the workflow, rare branches move behind trigger
   pointers.
4. Prefer mechanically protected batches after #12493 lands, so anchor churn is
   caught by lint instead of review cycles.
5. Do not compress away authority. `keep` rows are not "leave forever"; they
   mean the compression must preserve high-severity common-path behavior before
   moving examples, provenance, or edge cases.

## Batch 0: Active / Already Scoped Work

| Order | Skill surface | Current status | Next graph action |
|---:|---|---|---|
| 0.1 | `.agents/skills/pull-request/references/pull-request-workflow.md` | Rank 2; #12495 is already claimed as the pull-request compression pilot. | Complete #12495 before filing more `pull-request` compression tickets. |
| 0.2 | `.agents/skills/pr-review/references/pr-review-guide.md` | Rank 1; prior pilot work reduced but did not clear the top pressure row. | File one residual `pr-review` follow-up after the reference-integrity lint is merged, focused on extracting rare audit payloads rather than rewriting review doctrine. |

## Batch 1: High-Signal Governance Maps

These are the next highest ROI after the active pilot because they sit above
the 20 KB pressure band and shape cross-peer convergence.

| Order | Skill surface | Why first | Future sub shape |
|---:|---|---|---|
| 1.1 | `.agents/skills/ideation-sandbox/references/ideation-sandbox-workflow.md` | Rank 3, disposition `compress-to-trigger`, near the 25 KB per-file budget, high consensus-gate complexity. | Extract rare convergence / consensus / graduation edge cases into sibling payloads; leave one short OQ-to-graduation map. |
| 1.2 | `.agents/skills/peer-role/references/peer-role-mode.md` | Rank 4 by signals; high coordination impact, but currently `keep` because peer review posture is common-path. | Compress examples and convergence-rate provenance into triggered payloads; preserve the peer-role decision ladder inline. |
| 1.3 | `.agents/skills/ideation-sandbox/audits/consensus-mandate.md` | Rank 8, disposition `move`; audit payload is heavy and adjacent to 1.1. | Move or split into targeted audit payloads referenced from the ideation workflow. |

## Batch 2: Session And Coordination Lifecycle Maps

These files are common enough that compression should prioritize clearer
decision atoms over byte reduction alone.

| Order | Skill surface | Why in this batch | Future sub shape |
|---:|---|---|---|
| 2.1 | `.agents/skills/session-sunset/references/session-sunset-workflow.md` | Rank 6; high stale-wake / handoff failure cost. | Extract rare convergent-sunset and automation-cleanup branches behind trigger pointers. |
| 2.2 | `.agents/skills/lead-role/references/lead-role-mode.md` | Rank 7; coordination common-path, similar topology to peer-role. | Compress role posture to decision atoms; move examples and empirical anchors behind provenance pointers. |
| 2.3 | `.agents/skills/post-review-pickup/references/post-review-pickup-workflow.md` | Rank 11; frequent lifecycle boundary skill with 268 lines. | Split author-lane pickup, review-first, and concentration-detector branches into conditional payloads. |
| 2.4 | `.agents/skills/structural-pre-flight/references/structural-pre-flight-workflow.md` | Rank 9; high-severity file-placement guard. | Keep the mechanical trigger and fast-path inline; move archaeology and uncommon novel-directory cases behind triggers. |

## Batch 3: Ticket / Epic Workflow Payloads

These are related enough for one planning batch, but each PR should still close
one child ticket to keep review scope narrow.

| Order | Skill surface | Why in this batch | Future sub shape |
|---:|---|---|---|
| 3.1 | `.agents/skills/ticket-create/references/ticket-create-workflow.md` | Rank 10; high-risk public artifact creation. | Move duplicate-sweep examples and label edge cases behind trigger pointers. |
| 3.2 | `.agents/skills/ticket-intake/references/ticket-intake-workflow.md` | Rank 13; common pre-execution gate. | Compress stale/ADR/duplicate audits into a shorter checklist plus triggered sub-audits. |
| 3.3 | `.agents/skills/epic-review/references/epic-review-workflow.md` | Rank 15; broad six-stage review surface. | Extract avoided-traps and prescription-layer examples; keep the stage order inline. |
| 3.4 | `.agents/skills/epic-resolution/references/epic-resolution-workflow.md` | Rank 5 by signals; closeout decisions are high-cost when wrong. | Split close/keep/open-child/retire verdict branches into compact decision atoms. |
| 3.5 | `.agents/skills/create-skill/references/skill-authoring-guide.md` | Rank 14; authoring authority for future skill changes. | Defer until after Batches 1-3 reveal stable compression patterns to avoid reshaping the guide too early. |

## Batch 4: Templates, Audits, And Mid-Tier Payloads

This batch should not start until the first three batches reduce the common
workflow maps; otherwise template compression may hide the very audits reviewers
need while reshaping skills.

| Order | Skill surface | Why in this batch | Future sub shape |
|---:|---|---|---|
| 4.1 | `.agents/skills/pr-review/assets/pr-review-template.md` | Rank 21; template bulk is loaded during review cycles, not every pr-review read. | Compress only after pr-review guide residual pass identifies which audits remain expanded. |
| 4.2 | `.agents/skills/memory-mining/references/memory-mining-protocol.md` | Rank 18; moderate size but important anti-rederivation behavior. | Keep protocol shape; move examples and query variants behind trigger pointers. |
| 4.3 | `.agents/skills/ticket-triage/references/ticket-triage-workflow.md` | Rank 26; maintainer-only workflow. | Compress social-contract text into decision atoms; preserve label/permission gate. |
| 4.4 | `.agents/skills/neo-identity-update/references/framing-governance.md` | Rank 28; identity drift impact is high but rare. | Move audience examples and provenance to triggered payloads. |

## Lean / Monitor Pool

Ranks 31-50 are below the current planning threshold for standalone compression
children unless a future report moves them up, a reviewer observes repeated
load-time friction, or a file becomes coupled to an active batch. Examples:
`tech-debt-radar-guide.md`, `unit-test.md`, `whitebox-e2e-protocol.md`, and
the smaller pr-review audit payloads should stay in monitor mode for now.

## Closeout Criteria For #11605

#11605 AC6 is satisfied when this artifact is merged and #11605 links to it.
The artifact does not close the compression work itself; it turns the remaining
work into an ordered queue:

1. Finish #12495.
2. File Batch 1 children from a refreshed live report.
3. Continue one batch at a time, one child per skill unless mechanical coupling
   justifies bundling.
4. Re-run `ai:skill-size-report` after each merged compression PR and update the
   relevant child ticket with the before/after row.
