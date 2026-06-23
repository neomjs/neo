---
id: 9556
title: 'Exploration: Worker-Side Data Sanitization vs. Lazy Record Hydration'
state: OPEN
labels:
  - help wanted
  - discussion
  - no auto close
  - ai
  - architecture
  - core
  - not-code-ready
  - needs-design
assignees: []
createdAt: '2026-03-25T20:47:58Z'
updatedAt: '2026-06-23T03:25:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9556'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# Exploration: Worker-Side Data Sanitization vs. Lazy Record Hydration

### Goal
Investigate the architectural feasibility of moving data validation and sanitization into the Data Worker Pipeline.

### Description
Currently, `Neo.data.RecordFactory` handles validation and type conversion during Record instantiation in the App Worker. While the Store's "Turbo Mode" (Lazy Hydration) defers this cost, performing these operations in the App Worker still consumes the main execution thread when data is eventually accessed.

**Exploration Points:**
1. **Thread-Agnostic Validation:** Can we extract validation logic (maxLength, nullable, etc.) into a shared utility that the Data Worker can run on raw parsed objects?
2. **Pre-Sanitization:** What are the performance trade-offs of "cleaning" raw data in the Data Worker before it crosses the worker boundary? 
3. **Turbo Mode Impact:** Does pre-sanitizing data in the Data Worker simplify or redundantize the "Soft Hydration" logic (`resolveField`) in `Neo.data.Store`?
4. **Error Reporting:** How do we efficiently report validation failures for bulk datasets (e.g., 10k rows) back to the App Worker without bloating the IPC payload?

This is a research-first ticket to determine if a "Pre-Hydration" phase in the Data Worker is a viable architectural evolution.

## Timeline

- 2026-03-25T20:47:58Z @tobiu assigned to @tobiu
- 2026-03-25T20:47:59Z @tobiu added the `discussion` label
- 2026-03-25T20:47:59Z @tobiu added the `ai` label
- 2026-03-25T20:47:59Z @tobiu added the `architecture` label
- 2026-03-25T20:48:00Z @tobiu added the `core` label
- 2026-03-25T20:50:05Z @tobiu added the `help wanted` label
- 2026-03-25T20:50:05Z @tobiu added the `no auto close` label
- 2026-03-26T15:19:31Z @tobiu unassigned from @tobiu
- 2026-06-23T03:25:18Z @neo-gpt added the `not-code-ready` label
- 2026-06-23T03:25:18Z @neo-gpt added the `needs-design` label
### @neo-gpt - 2026-06-23T03:25:26Z

[ARCH_ALIGNMENT]

Ticket-intake verdict: **needs-design / not code-ready**, but preserve open.

Evidence checked on 2026-06-23:

- #9556 is open, unassigned, and already parked as `discussion` + `no auto close` + `help wanted`.
- The ticket body explicitly frames this as a **research-first** exploration: evaluate whether validation/sanitization should move into the Data Worker pipeline, how it interacts with Turbo Mode / soft hydration, and how bulk validation errors should cross the worker boundary.
- Live duplicate/successor sweep found no implementation PR and no newer issue that already resolves this exact worker-side pre-hydration question. `gh pr list` for #9556 / the title returned no PRs.
- KB confirms the nearby Store/Turbo Mode tickets (#9414, #9066, #9331) are older closed App Worker-side hydration refinements, not a successor implementation of worker-side data sanitization.

I added `not-code-ready` + `needs-design` so this no longer appears in the claimable implementation queue. Re-entry condition: graduate the design into a current contract ledger that names the Data Worker surface, RecordFactory/Store hydration boundary, error-report payload shape, and measurement plan for large datasets.


