# ADR Successor-Risk & Challenge Audit

This payload provides the ADR-specific branch of the ticket-intake successor-risk gate. ADRs are accepted decision snapshots and current authority targets, not immutable law. A later ticket, Discussion, or PR may challenge an ADR when it brings fresh V-B-A evidence and routes the decision change explicitly; an older ticket may instead be superseded by a later accepted ADR.

## 1. Trigger

Run this audit when any architecture-bearing ticket, Discussion, Epic, or PR:

- cites an ADR, Decision Record, or `learn/agentos/decisions/` file;
- predates a related accepted ADR and prescribes a conflicting shape;
- postdates an accepted ADR and proposes a different architecture;
- introduces, amends, supersedes, or retires durable agent/workflow substrate;
- depends on a draft or pending ADR PR as merge-order authority.

If no related ADR exists and the proposal does not affect decision-record substrate, record `ADR successor-risk: no-adr-impact` and continue the ordinary workflow.

## 2. Required Inputs

Before classifying, gather:

- `Artifact`: ticket / Discussion / Epic / PR number, author, `createdAt`, and `updatedAt`.
- `Related ADR(s)`: ADR number/path, `Status`, decision date if present, and current repo state.
- `Chronology`: whether the artifact predates, postdates, or is same-cycle with the ADR.
- `Conflict surface`: the concrete contract, workflow, service boundary, or architectural premise that overlaps.
- `Evidence`: source/docs/tests/tickets/Discussions/PRs proving alignment, conflict, supersession, or fresh challenge.

Do not classify from title similarity alone. The conflict must be tied to a specific decision surface.

## 3. Classifier

| Verdict | Use when | Required evidence | Route |
|---|---|---|---|
| `no-adr-impact` | No related ADR affects the work. | Search or source sweep found no ADR relationship. | Continue ordinary workflow. |
| `adr-aligned` | The artifact follows the accepted ADR. | ADR path/status plus matching ticket/PR/Discussion premise. | Continue ordinary workflow; cite the ADR as authority. |
| `superseded-by-adr` | The artifact predates a later accepted ADR and conflicts with it. | Artifact date, ADR accepted/current state, and conflict surface. | Do not implement as written; route to superseded / retire / re-triage handling. |
| `adr-challenge` | The artifact postdates an accepted ADR and provides fresh V-B-A evidence that the ADR may no longer be best for Neo. | Fresh falsifying evidence plus the ADR section being challenged. | Route through Ideation Sandbox or an explicit ADR amendment/supersession ticket before implementation merge. |
| `adr-amendment-required` | The implementation can proceed only if an accepted ADR is amended, superseded, or retired. | Direct dependency between diff behavior and ADR text. | Name the ADR update path and merge-order dependency; do not bypass the ADR. |
| `adr-authority-pending` | The architecture depends on an ADR PR or draft decision that is not accepted on the target branch yet. | Draft/pending ADR link and consuming work. | Block merge or keep work as draft until the authority artifact is accepted. |

## 4. Decision Rules

- ADRs outrank older tickets and stale Discussion prose for current architecture decisions.
- ADRs do not outrank fresh V-B-A evidence forever. The correct challenge path is amendment, supersession, or retirement, not silent bypass.
- Ticket age is not a verdict. Age only raises the chance that a later ADR superseded the premise.
- Operator clarification can identify friction, but durable architecture changes still need public evidence in a ticket, Discussion, ADR, PR body, or review thread.
- If the ADR relationship is ambiguous, halt the execution lane and route the ambiguity to Discussion or ticket-body clarification before writing implementation code.

## 5. Required Output Shape

When this audit fires, record a compact line in the current workflow artifact:

```md
ADR successor-risk: <verdict> — artifact <#N/date>; ADR <####/status/date>; evidence <path|issue|PR|discussion>; route <continue|supersede|challenge|amendment-required|pending-authority>.
```

For public artifacts that create new work, also include:

```md
Decision Record impact: none | aligned-with ADR #### | depends-on ADR #### | amends ADR #### | supersedes ADR #### | challenges ADR ####
```

## 6. Workflow Surface Map

- **`ticket-intake`**: run before `valid-as-written` when a ticket touches architecture or agent substrate.
- **`ticket-create`**: add `Decision Record impact` when filing architecture/substrate tickets.
- **`ideation-sandbox`**: if a proposal conflicts with an accepted ADR, make the keep/amend/supersede/retire choice explicit before graduation.
- **`epic-review` / `epic-resolution`**: check whether later ADRs supersede an epic premise, or whether the epic needs an ADR challenge path before closeout.
- **`pull-request` / `pr-review`**: PRs conflicting with accepted ADRs must name the ADR amendment/supersession path or pending authority dependency before approval/merge eligibility.
