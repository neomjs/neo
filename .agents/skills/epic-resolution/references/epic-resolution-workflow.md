# Epic Resolution Workflow

Closeout gate for parent epics. Answers the canonical question: **"we resolved all epic subs, are we done now?"**

Sibling to `epic-review` (which is the *entry* gate at sub-creation time). `epic-resolution` is the *exit* gate at sub-closure time. Both skills share the same matrix shape on the parent epic body — `epic-review` seeds the AC → sub mapping; `epic-resolution` reconciles delivered evidence against required evidence and produces a verdict recommendation.

**Origin:** Discussion #10697 + issue #10698. Empirical anchor: PR #10696 / Epic #10671 cycle, where peer broadcasts of "Epic substrate side complete" went unchallenged despite RESIDUAL_L4 ACs and a BLOCKER sub. Mental model per @tobiu: "turn friction into gold."

## 1. When to invoke this skill

Trigger conditions (any one fires the workflow):

1. **Last required sub closes.** When you merge or observe-merged the final sub linked to an epic, run this workflow on the parent.
2. **Peer broadcasts epic-readiness.** Phrases like "Epic #N substrate side complete," "components look solid," "ready for human handoff" are TRIGGERS for closeout reconciliation, NOT closeouts themselves. Run the workflow before agreeing.
3. **Team member claims completion.** A team member (operator or peer agent) directly states an epic is done.
4. **Before closing an epic as COMPLETED.** Any time you would otherwise post a closure-rationale comment on an epic, run this workflow first.

**Trigger does NOT fire for:** routine sub-merge events that aren't the last required sub; epics where ACs have not been formally articulated; non-epic issues.

## 2. Concurrency guard (epic-closeout discipline-layer mutex)

Before populating the matrix, check whether another agent is already running the closeout for this epic.

**Steps:**
1. Read the recent comments on the epic. If a comment titled `## Epic Resolution Review (in progress)` exists with a timestamp less than 30 minutes old AND from a different agent identity, STOP.
2. If you stopped, A2A the active closeout reviewer with `subject: "Re: Epic #N closeout — joining your review"` and cite the active comment-id. Do NOT post a parallel verdict.
3. If no recent in-progress comment exists, post your own `## Epic Resolution Review (in progress)` comment immediately as a claim, before populating the matrix. The claim comment should be a single line: `Reviewing epic closeout — matrix population in progress. Started by @<your-identity> at <ISO-timestamp>.`
4. Update your in-progress comment to the final verdict comment via `manage_issue_comment` action `update` once the matrix is built. The same comment evolves from claim → verdict.

**Optional primary-owner restriction:** if the epic has an explicit assignee, only the assignee runs the closeout. Other agents detecting the trigger A2A-ping the assignee instead of running the workflow.

## 3. Populate the matrix

The shared matrix shape (used by both `epic-review` entry-pass and `epic-resolution` exit-pass):

```md
| Parent AC | Required evidence | Owning sub(s) | Delivered PR(s) | Achieved evidence | Residual state |
|---|---|---|---|---|---|
```

For each parent AC of the epic:

1. **Parent AC** — quote or reference the AC text from the epic body.
2. **Required evidence** — L1 / L2 / L3 / L4 per the [Substrate Evidence Ladder](../../../../learn/agentos/evidence-ladder.md). The `epic-review` entry pass should have set this; if missing, derive from the AC text (does it require runtime / live / observable behavior?).
3. **Owning sub(s)** — the sub-issue(s) addressing this AC. From the epic's native sub-issue links (`update_issue_relationship` graph) or AC-explicit references.
4. **Delivered PR(s)** — the merged PR(s) closing each sub. Use `gh pr list --search "linked-to:<sub-number>"` or check sub-issue's `closedByPullRequestsReferences`.
5. **Achieved evidence** — read the merged PR body's `Evidence:` declaration. If two ceilings (sandbox vs achievable), report both: `L2 (sandbox) / L4 (achievable)`. If no Evidence declaration, mark as `L?? — declaration missing` and flag in residuals.
6. **Residual state** — one of:
   - `none — closed` (achieved >= required)
   - `RESIDUAL_L<N> — <reason>` (operator handoff window pending, etc.)
   - `BLOCKER` (sub not started, sub failing, evidence below required with no path to close)
   - `RESIDUAL_AC<N> [#<followup-ticket>]` (split-follow-up filed for unproven AC)

## 3.5. Source Discussion Closeout Gate

**Trigger:** This stage MUST be executed if the epic links to a source GitHub Discussion (e.g., an Ideation Sandbox graduation) OR if the entry-pass `epic-review` produced a Stage 2.5 "Source Discussion Mapping" table.

**Task:** Reconcile upstream criteria before returning an Epic AC verdict.

1. **Locate Source Criteria:** Read the source Discussion (specifically the graduation criteria proposed by the team) or use the Stage 2.5 mapping table from the initial `epic-review`.
2. **Verify Delivery:** For each mapped graduation criterion, verify that the corresponding Epic AC (and its owning sub-issues) achieved the required evidence.
3. **Handle Gaps:** If an upstream criterion was dropped, down-scoped, or deferred *without* a formal follow-up ticket capturing the remaining work, flag it as `SOURCE_CRITERIA_UNMET`.

*If any source Discussion criterion is not delivered, explicitly deferred, or converted into a follow-up ticket, the verdict MUST NOT be `RECOMMEND_CLOSE_COMPLETED`.*

## 4. Compute the verdict

Apply the verdict logic in this order:

| Condition | Verdict |
|---|---|
| Any row has `BLOCKER` state | `RECOMMEND_KEEP_OPEN` |
| Any row has `SOURCE_CRITERIA_UNMET` | `RECOMMEND_KEEP_OPEN` or `RECOMMEND_CREATE_MISSING_SUBS` |
| Any row has `RESIDUAL_L<N>` AND no follow-up ticket exists | `RECOMMEND_CREATE_MISSING_SUBS` |
| Some ACs met but upstream source criteria converted to follow-ups | `RECOMMEND_CLOSE_PARTIAL_WITH_FOLLOW_UPS` |
| All rows are `none — closed` OR `RESIDUAL_<X> [#<followup-ticket>]` (residuals tracked elsewhere) | `RECOMMEND_CLOSE_COMPLETED` |
| Epic's purpose has been superseded by another effort or the AC framing is no longer valid | `RECOMMEND_RETIRE_OR_SUPERSEDE` |

**Verdict authority:** the skill produces a structured review + recommendation. **Terminal-action shape depends on the verdict**:

- **`RECOMMEND_CLOSE_COMPLETED` (with zero unresolved residuals)**: the reviewer-agent SHOULD close the epic as completed via `gh issue close --reason completed` as the natural downstream of the review. The review IS the gate; the close-act is not a separate operator-gate. **This is NOT a §0 Invariant 1 parallel** — §0 strictly forbids `gh pr merge` (PR merge action only); epic-close is downstream of the review verdict, not in §0 scope. Failing to close after a clean CLOSE_COMPLETED verdict produces stale-pending-action board pollution (empirical anchor: #10691 verdict 2026-05-04 → epic closed 2026-05-11 after operator surfaced the misframing).

- **`RECOMMEND_CLOSE_PARTIAL_WITH_FOLLOW_UPS`**: the reviewer-agent SHOULD close the epic as completed via `gh issue close --reason completed`, but the review MUST explicitly enumerate the new follow-up tickets generated to track deferred upstream criteria or residuals.

- **`RECOMMEND_KEEP_OPEN`**: no terminal action. Review surfaces blockers/residuals; operator or sub-owner decides path forward.

- **`RECOMMEND_CREATE_MISSING_SUBS`**: no terminal action. Recommendation surfaces; operator authorizes new-sub creation; assigned owner files via `/ticket-create`.

- **`RECOMMEND_RETIRE_OR_SUPERSEDE`**: no terminal action. Reviewer-agent does NOT auto-close-as-not-planned; operator authority for substrate-cohesion reasons (potential separate substrate concern — could be sub-issue if a §0-parallel claim is correct for retire-action specifically).

For `RECOMMEND_CREATE_MISSING_SUBS`:
1. List the gaps explicitly (which AC, what evidence is missing).
2. Identify proposed owners (agents) for each new sub. If unclear, A2A the team to volunteer.
3. Coordinate via A2A — DO NOT autonomously create the new subs without operator approval.
4. The skill output recommends; the operator authorizes; the assigned owner files via `ticket-create`.

For `RECOMMEND_RETIRE_OR_SUPERSEDE`:
1. Articulate the rationale clearly (what changed since the epic was filed; what supersedes it).
2. Cross-reference the superseding epic / discussion if any.
3. Operator acts on the recommendation.

## 5. Post the verdict comment

Update your `## Epic Resolution Review (in progress)` comment to the final shape via `manage_issue_comment` action `update`:

```md
## Epic Resolution Review

**Reviewer:** @<your-identity>
**Started:** <ISO-timestamp> (in-progress claim)
**Completed:** <ISO-timestamp>
**Verdict:** RECOMMEND_<CLOSE_COMPLETED | CLOSE_PARTIAL_WITH_FOLLOW_UPS | KEEP_OPEN | CREATE_MISSING_SUBS | RETIRE_OR_SUPERSEDE>

### Source Discussion Verification (If Applicable)

<Did the epic deliver on the upstream graduation criteria? List any dropped or deferred criteria and link the corresponding follow-up tickets.>

### Matrix

| Parent AC | Required evidence | Owning sub(s) | Delivered PR(s) | Achieved evidence | Residual state |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... |

### Rationale

<2-4 paragraphs explaining the verdict. For KEEP_OPEN: which residuals/blockers/unmet source criteria + path to close. For CREATE_MISSING_SUBS: enumerate gaps + proposed owners. For RETIRE: superseding artifact. For CLOSE_COMPLETED: confirmation that all residuals are tracked elsewhere. For CLOSE_PARTIAL_WITH_FOLLOW_UPS: highlight the explicitly tracked deferrals.>

### Required operator action

<For RECOMMEND_CLOSE_COMPLETED or CLOSE_PARTIAL_WITH_FOLLOW_UPS: "Close epic as completed when convenient." For RECOMMEND_CREATE_MISSING_SUBS: "Authorize creation of N new subs (proposed owners listed above)." Etc.>

### A2A coordination

<List peers A2A'd, with subject + commentId for the operator's audit trail.>

Origin Session ID: <your session UUID>
```

## 6. A2A peer coordination

After posting the verdict comment, A2A the relevant peers:

- For `RECOMMEND_CLOSE_COMPLETED` or `RECOMMEND_CLOSE_PARTIAL_WITH_FOLLOW_UPS`: A2A all agents who had subs in the epic, FYI of closure recommendation.
- For `RECOMMEND_KEEP_OPEN` with BLOCKER: A2A the blocked sub's owner with the blocker rationale + ask whether they need help unblocking.
- For `RECOMMEND_CREATE_MISSING_SUBS`: A2A proposed owners with the gap + ask whether they accept ownership.
- For `RECOMMEND_RETIRE_OR_SUPERSEDE`: A2A the superseding effort's owner with the link.

Per `feedback_a2a_commentid_pre_flight`: post the verdict comment FIRST, capture the literal commentId, THEN compose the A2A messages with the literal commentId substituted.

## 7. Cross-references

- `learn/agentos/evidence-ladder.md` — L1-L4 definitions + matrix schema authority
- `.agents/skills/epic-review/` — entry-pass sibling (seeds matrix at sub-creation time)
- `.agents/skills/pr-review/` — sub-execution gate (audits Evidence declaration on each merging PR)
- `.agents/skills/pull-request/` — author-side Evidence declaration template
- `.agents/skills/ticket-create/` — invoked by the operator on `RECOMMEND_CREATE_MISSING_SUBS`
- AGENTS.md §0 Invariant 1 — verdict authority parallel (close-act reserved for human)
- Discussion #10697 — origin ideation
- Issue #10698 — graduation artifact

## 8. Empirical anchor — Epic #10671 (motivating example)

The first run of this skill should be against Epic #10671 itself — the epic whose closeout-friction motivated #10697 + #10698. Expected matrix shape:

- 9 subs across substrate-restart components (forensic, detector, in-flight lock, idle-out, sunset-mode, harness adapters, Codex Desktop primitive, mock-test discipline)
- Most subs delivered at L2 (mock dispatch) or L3 (live binary verification by reviewer)
- AC5 verify-effect (sessionId distinctness via MCP from spawned session) = RESIDUAL_L4 across #10676, #10695, #10696
- #10679 (Codex Desktop primitive) = BLOCKER (sub blocked on MC startup diagnosis)
- Verdict: `RECOMMEND_KEEP_OPEN` until either #10696 merges + AC5 L4 logged + #10679 unblocks, OR #10679 explicitly retired with rationale

If the skill is run against Epic #10671 and produces a different verdict shape, audit the matrix population against the public state of the subs/PRs.
