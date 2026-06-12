# Ticket Triage Workflow

Authoritative protocol for maintainer-side label triage of unlabeled tickets. Codifies the social contract for what happens when a ticket arrives without `ai`, primary, or secondary labels — typically because the author lacked maintainer permissions to apply them at create-time.

`ticket-triage` is the **maintainer-side** dual of `ticket-create` (author-side label discipline) and a **pre-step** to `ticket-intake` (pickup-side intake). When a maintainer agent encounters an unlabeled ticket, this skill governs the labeling decision **before** the ticket can be picked up under `ticket-intake`.

## 1. When to Invoke

Fire this skill when **all** conditions hold:

1. You have maintainer permission on the repository (`WRITE` permission or higher — verify via `get_viewer_permission` MCP tool).
2. You encounter a ticket that is missing **any** of:
   - The mandatory `ai` provenance label (per `ticket-create §4`)
   - A primary label (`bug` / `enhancement` / `epic`)
   - Domain-relevant secondary labels (`architecture`, `core`, `testing`, etc.)
3. You are about to either pick up the ticket OR review it as a maintainer.

**Per-ticket one-shot:** once a maintainer has triaged and labeled a ticket, subsequent maintainers cite the prior triage rather than re-running this skill. Triage is not a per-pickup step — it's a per-ticket gate.

If the ticket already has full labels (mandatory + primary + relevant secondary), skip this skill and proceed to `ticket-intake` (or PR review, if applicable).

## 2. Pre-Triage Context Pull

Before running the four-step workflow:

1. **The ticket body.** Use the `mcp_neo-mjs-github-workflow_get_conversation` tool to read the live issue (remote-truth-fresh per `ticket-intake §1.1`).
2. **Existing label set.** Run `list_labels` on the repo to see canonical label inventory. Do NOT invent label names — if a needed label is missing, propose its creation via a comment on the ticket and halt triage until the label exists.
3. **Author identity + permission.** Confirm whether the author is a maintainer (would have applied labels themselves), an external contributor (couldn't), or a lower-privileged agent (couldn't).
4. **Adjacency sweep.** Has a similar ticket been filed and labeled? Quick `grep_search` against `resources/content/issues/` (active and archived) to anchor the secondary-label decisions.

## 3. The Four-Step Triage Workflow

### Step 1 — Retrospective Six-Stage Challenge

Apply the same six-stage challenge chain from `ticket-create §2` retrospectively, but as a **labeling decision**, not a creation gate:

1. **Premise:** is the stated problem real and reproducible? Has the underlying symptom been independently verified, or is it secondhand?
2. **Prescription:** is the stated fix the right substrate for the problem, or does it treat a symptom?
3. **Substrate:** where does this work belong? Service-layer / build script / CI / framework core / documentation? Match the fix to the substrate that owns the concern.
4. **Consumer:** who reads the output of this change? Human developer, agent, Memory Core, Native Edge Graph, Knowledge Base?
5. **Service-Boundary:** does the proposed work cross a service boundary it shouldn't?
6. **Decision Record impact:** does the ticket depend on, amend, supersede, or challenge an ADR / Decision Record?

**Outcome routing:**

- **All six pass:** proceed to Step 2 (apply labels).
- **One or more fail:** post a structured review comment on the ticket flagging the failure(s) using the `pr-review` `[ARCH_ALIGNMENT]` framing, AND apply the `needs-re-triage` label (canonical taxonomy marker for *"premise identified as stale, duplicate, or Negative ROI by Swarm Agent"*). Do **NOT** apply primary or secondary labels. Halt the triage protocol.

**The retrospective challenge is the labeling-decision gate.** A ticket that fails any stage is not yet ready for label application — labels signal "this is real work this repo wants done." Premature labels create downstream pickup pressure on flawed premises.

**Why `needs-re-triage` on the halt path:** without a marker, the halted ticket remains in the same "unlabeled" bucket that triggers `ticket-triage` itself, creating a re-triage loop where every passing maintainer re-runs the six-stage challenge and posts duplicate review comments. The `needs-re-triage` label signals *"premise has been challenged; further triage requires author clarification first"* — preventing the loop while preserving auditability.

### Step 2 — Apply Primary Label

Choose **exactly one** of `bug` / `enhancement` / `epic` based on the ticket body:

- **`bug`:** real defect with reproducer; "X is broken when Y."
- **`enhancement`:** new capability or material improvement; "add X" / "improve Y."
- **`epic`:** body of work spanning multiple sub-issues; the ticket itself is project-management scaffolding, not a directly-implementable unit. Per `pr-review §5.2`, epics are NEVER valid PR close-targets — only sub-issues are.

Apply via `manage_issue_labels` action `add`:

```
manage_issue_labels(action: 'add', issue_number: N, labels: ['<primary-label>'])
```

**The `ai` label is mandatory if the agent picks this up.** Apply alongside the primary label IF the ticket will enter the agent work queue. If the ticket will likely be picked up by a human contributor, defer the `ai` application to actual pickup.

### Step 3 — Apply Secondary Labels

Match the ticket's domain to relevant secondary labels:

- **Domain-vertical:** `core`, `grid`, `build`, `ai`, `testing`, etc.
- **Cross-cutting:** `architecture`, `performance`, `regression`, `refactoring`, `documentation`, `security`.

Use `list_labels` to verify each label exists; **do NOT invent label names** (causes silent GitHub API rejections per `ticket-create §4`). If a domain label is missing and the ticket needs it, propose label creation via a comment and halt the triage until the label is created.

Apply via `manage_issue_labels` action `add`:

```
manage_issue_labels(action: 'add', issue_number: N, labels: ['architecture', 'core', ...])
```

### Step 4 — Assignment Disposition (Optional)

After labels are applied, decide assignment:

- **Self-assign + proceed to `ticket-intake`:** if the ticket is well-scoped, you are the natural agent for the work, and no other agent has signaled interest. Then immediately run the `ticket-intake` skill on the now-labeled ticket.
- **Self-assign + park:** if you intend to pick up later but want to claim ownership now. Per the `ticket-intake §3a` 7-day rule, park-and-leave is allowed but creates a clock against you.
- **Leave unassigned + invite contributor:** post a comment on the ticket inviting the original author or interested contributors to self-claim. Common when the ticket is a fit for a contributor's skillset rather than a maintainer's.
- **Leave unassigned + flag for swarm:** post a comment routing the ticket to the appropriate agent identity (`@neo-opus-ada`, `@neo-gemini-pro`) if cross-family expertise applies.

Assignment disposition is **not** part of the labeling decision — it's a post-triage allocation choice. The triage protocol ends at Step 3 if you choose to defer assignment.

## 4. Anti-Patterns

| Anti-pattern | Why it harms |
|---|---|
| Applying labels before retrospective six-stage challenge | Bypasses the gate that filters out flawed premises; downstream pickup pressure on bad work |
| Inventing label names | Silent GitHub API rejection; lost label intent |
| Skipping `list_labels` verification | Domain-label drift; future agents see inconsistent taxonomy |
| Applying `ai` label without intent to pick up | False signal that the agent queue owns this work |
| Self-assigning without `ticket-intake` follow-through | Bypasses the validation/branch-before-code gates |
| Triaging a ticket the original author should clarify | Premature labeling locks the author into a framing they may not endorse |
| Re-triaging a ticket already-labeled by another maintainer | Duplicate work; cite prior triage instead |

## 5. Relationship to Sibling Skills

| Skill | When | Scope | Relationship |
|---|---|---|---|
| `ticket-create` | Ticket birth | Author-side label discipline | Authors apply labels at create-time; `ticket-triage` covers the case where the author *couldn't* (no maintainer permission). Same labels, different application moment. |
| `ticket-intake` | Sub pickup | Pickup-side validation | `ticket-triage` runs *before* `ticket-intake` when a ticket is unlabeled. After triage, intake proceeds per its own protocol. |
| `epic-review` | Epic pre-pickup | Epic-scope challenge | Orthogonal — `epic-review` runs once per epic per agent identity; `ticket-triage` runs once per ticket per maintainer. |
| `pr-review` | PR validation | Post-work | Orthogonal — `ticket-triage` is at ticket level; `pr-review` is at PR level. |

## 6. Cross-Reference Citations

When you complete a triage, cite the protocol in your label-apply comment:

> *"Triaged per `ticket-triage` skill. Applied: `<labels>`. Stage retrospective passed. [Optional: assignment disposition.]"*

This makes the triage decision auditable and prevents re-triage by future maintainers.

## 7. Verification Before Acting

Before calling `manage_issue_labels`:

- [ ] You have maintainer permission (`get_viewer_permission` returns `WRITE`/`MAINTAIN`/`ADMIN`)
- [ ] Stage 1 retrospective six-stage challenge passed (or you've posted the challenge comment and halted)
- [ ] Primary label chosen is exactly one of `bug`/`enhancement`/`epic`
- [ ] Secondary labels verified to exist in `list_labels` output
- [ ] No invented label names
- [ ] `ai` label included only if the ticket enters agent work queue
- [ ] Triage decision will be cited in your follow-up comment
