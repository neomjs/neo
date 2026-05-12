---
name: sandman-handoff-pre-flight
description: "Authoritative protocol for the Session Boot Pre-Flight. Read at the very beginning of a newly booted session to interpret the sandman_handoff.md runtime artifact."
---

# Session Boot Pre-Flight (The Sandman Handoff)

At the very beginning of a newly booted session, before executing any workflow skills, you MUST read the runtime artifact `resources/content/sandman_handoff.md`.

## Execution Protocol

1. **Fail-Open / Fail-Closed Semantics:** This file is `.gitignored`. If the file is missing entirely (e.g., fresh clone) OR exists but lacks a `lane-state` section, **fail-open** (proceed normally). If the file exists but has an unknown `lane-state` value, **fail-closed** (halt and notify operator).
2. **Hard-Refusal Predicate:** If the `lane-state` is `AWAITING_REVIEW`, `AWAITING_HUMAN`, or any unknown value, you MUST halt execution.
3. **Scope Boundary:** This predicate blocks explicitly: new ticket intake, opening new PRs, and starting new substrate-evolution work. It explicitly DOES NOT block: Cycle N reviews of existing PRs, A2A coordination, memory-mining, or directly responding to operator directives.
4. **Operator Notification:** You must explicitly log/state the blocked state to the human operator in your response, and await their explicit override before proceeding with blocked work.
