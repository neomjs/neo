# Ticket Proposal Template

Dump this filled-out format into the chat **before** calling `create_issue`. The human must see the full ticket content as a text proposal; then you call the tool immediately after.

---

```
Title: [Subject, no category prefix. Under ~70 chars.]

Labels: [ai, <primary-label>, <secondary-label>, ...]

Body:

## Context

[Why this ticket exists now. What prompted it. Observational evidence.]

## The Problem

[Deep background context. Insights from recent Memory Core explorations. Reproducer if applicable. Historical "why."]

## The Architectural Reality

[Which Neo.mjs patterns, class topologies, or service boundaries this interacts with. File:line references. Structural specificity.]

## The Fix

[Concrete prescription: files, symbols, architectural primitives touched. What changes, and where.]

## Acceptance Criteria

- [ ] [Independently verifiable item]
- [ ] [Post-merge-only items flagged as such]

## Out of Scope

[What this ticket deliberately does NOT do. Prevents scope creep.]

## Avoided Traps

[Optional: alternatives considered and rejected, with rationale. Especially when rejecting a "generic best practice" that's wrong in Neo.mjs's multi-threaded context.]

## Related

- Reverses: #N — [title]
- Companion: #N — [title]
- Supersedes: #N — [title] (close on merge)
- Leaves intact: #N — [title]

## Origin Session ID

<current-memory-core-session-uuid>
```

---

**After dumping the above into the chat, immediately call `create_issue`. Do not ask for permission.**

**Primary labels are mutually exclusive:** pick exactly one of `epic`, `enhancement`, `bug`.
**`ai` is mandatory** on every agent-authored ticket.
**Secondary labels** are drawn from: `architecture`, `performance`, `regression`, `refactoring`, `documentation`, `testing`, plus domain labels (`core`, `grid`, `build`, etc.).
