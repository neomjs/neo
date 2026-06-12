# Post-Review Follow-up Surfacing

This payload applies when a reviewer lands an `Approve+Follow-Up` verdict or
names explicit follow-up work via `[KB_GAP]`, `[TOOLING_GAP]`,
`[RETROSPECTIVE]`, or plain "non-blocking follow-up" language.

## Rule

Before merge, the author MUST convert durable follow-up work into graph-visible
substrate:

1. File each follow-up as an actual GitHub issue via the normal `ticket-create`
   workflow, unless an equivalent open issue already exists.
2. Link each filed or existing follow-up to a discoverable parent with
   `update_issue_relationship` (`parent_child` or `blocked_by` as appropriate).
   Prefer the close-target's parent epic, the close-target itself, or a
   sibling-anchor ticket from the review's substrate.
3. Optionally add a `## Follow-ups` block near the top of the PR body listing
   the filed issue numbers and relationship anchor. This block is a
   **pre-merge operator-visibility surface only**; it is not durable substrate.

If a reviewer labels something as follow-up but no durable ticket is warranted,
the author MUST document the reason in the review response or PR body. Do not
leave follow-up work only as prose in the PR body or review thread.

## Optional PR Body Mirror

```markdown
## Follow-ups
- #M — <one-line scope>; linked as <parent_child|blocked_by> to #P
```

## Anti-Pattern

A PR body `## Follow-ups` block that lists prose-only tasks, unfiled issue
numbers, or tickets without native relationships is not durable. File and link
first; the PR body only mirrors the durable graph for merge-time visibility.
