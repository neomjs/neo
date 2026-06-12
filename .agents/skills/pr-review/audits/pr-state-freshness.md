# PR-State Freshness Gate (every lifecycle relay, not just review-start)

The §2 Context-Initialization `state: OPEN` check fires at review-START only. Under
merge-on-approval, every PR signal (A2A, wake, comment) is stale within seconds of being
read. Therefore, immediately before **relaying any review outcome or posting any
merge-eligibility claim** — A2A handoff, `[merge-eligible]` broadcast, re-stamp request,
chat report, or follow-up action keyed to merge state — run:

```bash
gh pr view <N> --json state,mergedAt
```

If `MERGED`/`CLOSED`: relay the TERMINAL state instead; never emit "at the merge gate"
language for a settled PR.

**Verdict, not enum:** relay the review BODY's §9 Strategic-Fit verdict, not the
`reviewDecision` enum — the enum flattens `Approve+Follow-Up` (whose follow-up leaves
file AT merge, per `ticket-create` §4 boardless defaults) into plain `APPROVED`.

**Empirical provenance** (both 2026-06-12, operator-flagged): PR `#12950` — a
`[merge-eligible]` broadcast landed 15 seconds after the merge; PR `#12956` — the
approval was relayed off `reviewDecision` alone while the body's verdict was
`Approve+Follow-Up`, and the merge landed seconds later. Same check-at-last-moment
epistemics as `ticket-create`'s `#12856` two-phase claim discipline.

**Sunset condition:** if A2A lifecycle messages ever carry a mechanical state echo,
compress this audit to its trigger line in the guide.
