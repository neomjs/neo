# ADR 0041: The File-System Executor Runs Unjailed, And Says So

> `run_playwright_test` executes arbitrary JavaScript with the host trust of the MCP server process.
> The path guard binds **arguments**, never the **process**, so `write_file` composed with
> `run_playwright_test` reaches outside the project root without either call violating a guard. We
> **accept** that, because the containment that would fix it costs more than the exposure is worth on
> a surface whose callers already hold host access — and we pay for the acceptance in honesty: every
> projected surface a caller receives states the limit, and no surface anywhere claims isolation.

| Attribute | Value |
|---|---|
| **Status** | Accepted — 2026-08-25 |
| **Author** | Grace (@neo-opus-grace), recording the decision #16979 exists to force; defect reported externally by @novice-22 (three independent times, reproduced from source), split from #16481 by @neo-opus-vega, projected-surface census by @neo-gpt-emmy |
| **Resolves** | #16979 AC-1 — "a decision is recorded: isolate the executor, or accept unjailed execution as the contract" |
| **Anti-anchor for** | any guard that blocks the specific two-step reproduction while leaving arbitrary JS execution unbounded; any surface text that describes this executor as isolated, sandboxed, or contained; a sandbox that reports success while no longer containing |

---

## 1. Context

The file-system MCP server validates every path argument against the project root. That guard is real
and it works — for arguments. It cannot bind what a *spec* does, because a Playwright spec is
arbitrary JavaScript running in the server's own process.

So the read/write set of `run_playwright_test` is the host process, not the project root, and the
composition is trivial: `write_file` a spec inside the root, then `run_playwright_test` it, and the
spec reads or writes anywhere the server can. Neither call violates the jail. The jail was never the
thing standing between the tool and the host.

The external reporter stated the closure precisely, and it is why this needed a decision rather than
a cleverer guard:

> *"A sound tool-level partition would have to keep `write_file` out of everywhere
> `run_playwright_test` can read. But a spec is arbitrary JavaScript, so the executor's read set is
> not statically bounded — it is the project."*

There is no line to draw between the two tools. A guard attempting one becomes a guard over a set
nobody can enumerate, which is exactly how the previous wording came to promise containment it could
not deliver.

## 2. Decision

**Accept unjailed execution as the contract.** Do not isolate the executor.

The alternative — a child process with a restricted filesystem view, or a container — was considered
and rejected on cost, not on difficulty:

- test runs get slower and need their fixtures carried across the boundary;
- failure diagnostics have to cross it too, or debugging gets materially worse;
- the boundary becomes a thing to keep correct, and **a broken sandbox that reports success is worse
  than no sandbox** — it converts a known limit into a false assurance.

That last cost is decisive rather than merely large. This surface is used by agents already operating
on this repository with host access. Isolation would therefore buy little real containment while
introducing a component whose silent failure mode is *believing you are contained*. Trading a limit
people can read for an assurance that can rot is a bad trade at this exposure level.

## 3. What acceptance obliges

Acceptance is not free. It is only honest if the limit reaches the caller, so:

- **Every projected surface states it.** The MCP tool surface is projected twice — `tools/list` reads
  `x-neo-tool-summary` (compacted, ~120 chars) and the full schema reads `description`. Both carry
  the limit. A warning in only one is a warning one call away from the discovery path that mattered.
- **The word "isolated" does not appear** describing this executor, in any operation description,
  summary, or tag. The prior text opened with *"Runs the Playwright runner isolated to the requested
  spec file"* and buried the correction below it, which reads as containment to anyone who stops at
  the first sentence.
- **The tag is not "Execution sandbox".** A tag describing a sandbox re-asserts, at the category
  level, exactly what the operation retracts.

## 4. Consequences

**Accepted:** the composition described in #16481 continues to work. It is a documented property of
the surface, not a latent defect, and a reader who grants this tool input they would not grant the
host process has been told plainly not to.

**Required:** any future capability on this server that executes caller-supplied code inherits this
ADR — it is unjailed by construction and must say so on both projections at the moment it ships.
Retrofitting the warning is the losing order, and this ADR exists because that order was tried once.

**Revisit when** the executor gains a caller who does *not* already hold host trust — a hosted
instance, an untrusted contributor path, or an MCP client outside the maintainer fleet. That changes
the exposure calculus in §2 completely, and the rejection recorded here does not survive it. Until
then, isolation would be machinery guarding a boundary that no caller is on the far side of.

## 5. Related

#16979 (this decision) · #16481 (the false-claim correction, PR #16976) · ADR 0039 (two-plane
boundary — a different boundary, and this ADR does not weaken it)
