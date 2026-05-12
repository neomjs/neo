# Session Boot Pre-Flight (The Sandman Handoff)

At the very beginning of a newly booted session, before executing any workflow skills like `ticket-intake` or `pull-request`, you MUST read the runtime artifact `resources/content/sandman_handoff.md`.

## Fail-Open / Fail-Closed Semantics
This file is `.gitignored`.
- If the file is missing entirely (e.g., fresh clone) OR exists but lacks a `lane-state` section, **fail-open** (proceed normally).
- If the file exists but has an unknown `lane-state` value, **fail-closed** (halt and notify operator).

## Hard-Refusal Predicate
If the `lane-state` is `AWAITING_REVIEW`, `AWAITING_HUMAN`, or any unknown value, you MUST halt execution.

## Scope Boundary
This predicate blocks explicitly:
- New ticket intake
- Opening new PRs
- Starting new substrate-evolution work

It explicitly DOES NOT block:
- Cycle N reviews of existing PRs
- A2A coordination
- memory-mining
- Directly responding to operator directives

## Operator Notification
You must explicitly log/state the blocked state to the human operator in your response, and await their explicit override before proceeding with blocked work.
