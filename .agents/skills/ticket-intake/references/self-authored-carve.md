# The self-authored carve

You are here because you authored the ticket you were just assigned. This file exists so that
learning you may skip the gate costs ~1KB rather than the 31KB workflow it may retire.

## Three cases, keyed on what you have SEEN

| What you hold | Action |
|---|---|
| Neither artifact nor reasoning — **another agent authored it** | **Full gate.** Unchanged, and the majority case. This is what intake is for. |
| Artifact **and** reasoning — **you authored it this session** | **Exempt.** `ticket-create`'s six-stage chain ran in this same context window. |
| Artifact but not reasoning — **you authored it in an earlier session** | **Drift probe below.** Full gate only if it fires. |

## The drift probe

```bash
git log origin/dev --since="<ticket createdAt>" --name-only --pretty=format: | sort -u
```

Intersect the result with the paths the ticket declares under **Architectural Reality** and **Fix**.

- **Zero intersection** — Neo reality did not move underneath this ticket. Intake's core question is
  answered `no`; proceed without the payload, and say so in the PR body.
- **Non-empty** — this is exactly when the gate earns its cost, and the intersection names the
  specific files to re-check. Run the full workflow.

**Scope is the edit surface, decided rather than incidental.** A ticket's premise may also cite
*precedent* that moved — a sibling skill reshaped, a related PR merged. That updates a reference; it
does not invalidate the work. Do not widen the probe to chase citations.

**Why not "less than 24 hours old".** `origin/dev` takes 29–41 commits/day. A day is 30–40 merges of
drift, so a wall-clock rule exempts tickets sitting under 30+ merges while still gating a week-old
ticket whose surface nobody touched. The probe measures what the gate actually cares about.

## The failure mode this must never become

Every input above is externally checkable — session identity, the issue's GitHub author, `git log`.
The moment an exemption rests on *"I judged this ticket still valid"*, the carve has become the
loophole it was written to replace: **a gate you can talk yourself out of is not a gate.** If you
find yourself adding a judgment call, that is the signal to run the full workflow.

## Same-session is not the same as same-context

After a compaction, your own reasoning may be as gone as another agent's. Session identity is the
available proxy, not a guarantee. If the ticket's reasoning is not actually in your context — you
recovered from a summary, or you cannot recall the six-stage chain without re-reading it — treat it
as the earlier-session case and run the probe. That judgment is allowed to make the gate *stricter*,
never looser.
