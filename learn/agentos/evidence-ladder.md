# Substrate Evidence Ladder

Authoritative reference for the Evidence Ladder + Close-Target Gate that prevents *evidence-class collapse* in agent PR review and epic closeout.

**Origin:** Discussion #10697 graduation artifact (issue #10698). Empirical anchor: PR #10696 / issue #10677 cycle, where mock-bin dispatcher tests were initially promoted to "substrate-correct primitive validated" framing despite the close-target requiring live operator-handoff verification.

**Mental model (per @tobiu):** "turn friction into gold" — the ladder exists to convert review-cycle friction into a durable workflow rule, not to assign blame for past instances.

## Why this exists

Agents can ship locally-coherent work that passes mocked tests, get the PR approved, and still not satisfy the close-target issue's acceptance criteria. The collapse happens in four steps:

1. **Static source shape** proves one thing (e.g., "config wiring matches contract")
2. **Mock-dispatch tests** prove a stronger but still limited thing (e.g., "fake binary receives expected argv")
3. **Review language** mentally upgrades that to live-substrate proof (e.g., "validated substrate-correct primitive")
4. **`Resolves #N`** points at an issue whose ACs require live behavior that was never observed

The ladder makes step 3 mechanical: each level has explicit definitions of what it proves and what it does NOT prove. The Close-Target Gate makes step 4 mechanical: `Resolves #N` is permitted only if the achieved evidence level satisfies the close-target's ACs, with explicit annotations for residual ACs that remain operator-gated.

## The ladder (L1 — L4)

| Level | Evidence Class | Proves | Does Not Prove |
|---|---|---|---|
| **L1** | Static contract | Source shape, forbidden flags absent, config wiring intact | Runtime dispatch, live host behavior |
| **L2** | Mock dispatch | Fake binary/path receives expected argv/env/lock behavior; spec-driven contract tests pass | Real binary exists or launches; MCP connection establishes; sessionId rotates |
| **L3** | Live non-destructive probe | Real binary/path/surface exists and can be invoked safely (binary resolves, executes a no-op, exits cleanly) | Old harness terminated; fresh MCP session is the active reviewer; coordination state is consistent |
| **L4** | Operator-gated destructive handoff | Old harness or MCP transport is terminated/restarted; new agent session is observed; `currentSessionId` differs; no duplicate processes; agent successfully boots into the recovery context | Long-term stability under all timing races; cross-host portability |

### Two ceilings (single dimension is insufficient)

Empirically there are two ceilings to track per PR:

1. **Sandbox ceiling:** highest level the CI / agent-sandbox can verify *without* operator-controlled handoff
2. **Achievable ceiling:** highest level the substrate physically permits (with operator handoff)

For substrate / harness / wake / restart PRs, sandbox-ceiling = L2 is common (agents cannot safely spawn live operator-facing harnesses). Achievable-ceiling = L4 is common (a host with the harness installed can run the operator-gated sequence).

The gap (L3, L4) between the two ceilings is *structural* — not a discipline failure. PR bodies must distinguish "shipped at L2 because L3+ requires operator handoff" from "shipped at L2 because the author didn't bother probing further."

## When the ladder applies (trigger scope)

The ladder applies to any PR where:

> The close-target's ACs include any item describing observable runtime effect on a surface the CI / agent sandbox cannot reach.

**Heuristic clusters that hit this trigger:**
- Substrate / harness / wake / restart PRs (operator-controlled GUI / CLI surfaces)
- UI PRs where ACs require browser-rendered visual confirmation
- CLI ergonomics PRs where ACs require shell-host behavior
- Any PR closing an issue with ACs naming `verify-effect`, `live behavior`, `runtime invariant`, `observable on host`, etc.

**Trigger does NOT apply to:**
- Pure config-shape refactors with no runtime-verify ACs
- Doc-only changes
- Internal-API refactors where ACs fully cover via unit tests

## The PR-body declaration (1-line greppable)

PRs whose close-target hits the trigger MUST include a 1-line evidence declaration in the body:

```md
Evidence: L<X> (<sandbox-ceiling description>) → L<Y> required (<close-target ACs requiring it>). Residual: AC<N> [#<close-target>].
```

**Examples:**

```md
Evidence: L2 (mock-bin dispatch + real SIGTERM on spawned node child) → L4 required (AC5 sessionId distinctness via MCP from spawned session). Residual: AC5 [#10677].
```

```md
Evidence: L3 (browser-rendered visual confirmation on local Chromium) → L4 required (AC2 cross-browser parity on Safari). Residual: AC2 [#NNNN].
```

```md
Evidence: L1 (static config-shape audit) → L1 required (no runtime-verify ACs). No residuals.
```

The 1-line shape is parser-friendly. Reviewers can scan PRs for `Evidence:` regex.

## The Close-Target Gate (Resolves rule)

`Resolves #N` / `Closes #N` / `Fixes #N` is permitted IFF one of:

1. **Achieved evidence ≥ close-target required evidence** (clean close)
2. **Achieved evidence < required, AND** the unmet ACs are explicitly listed in the PR body's `## Residual / Post-Merge Validation` section, AND the close-target issue body has the residual ACs annotated as `[L<N>-deferred — operator handoff needed]`, AND the post-merge verification log will be appended to the close-target issue before final close

If neither condition is met, use `Related: #N` with a remaining-validation checklist, or split a follow-up ticket for the unproven ACs.

This generalizes the existing close-target audit from #10324 (which protects epics from accidental magic-close) to any issue whose ACs require a stronger evidence class than the PR has actually achieved.

## The shared matrix (epic-review entry, epic-resolution exit)

Both `epic-review` (entry pass at sub-creation time) and `epic-resolution` (exit pass at sub-closure time) write to / read from the same matrix shape on the parent epic body:

```md
| Parent AC | Required evidence | Owning sub(s) | Delivered PR(s) | Achieved evidence | Residual state |
|---|---|---|---|---|---|
| AC1 (...) | L2 | #1234 | #5678 | L2 (mock dispatch) | none — closed |
| AC2 (...) | L3 | #1235 | #5679 | L3 (live probe) | none — closed |
| AC3 (...) | L4 | #1236, #1237 | #5680 | L2 (sandbox) / L4 (achievable) | RESIDUAL_L4 (operator handoff window pending) |
| AC4 (...) | L2 | #1238 | (not started) | L0 | BLOCKER |
```

`epic-review` seeds the AC → sub mapping at the front door (cols 1-3). `epic-resolution` consumes the mapping at the exit door (cols 4-6) and runs the verdict logic.

## Cross-references

- Discussion #10697 — origin ideation
- Issue #10698 — graduation artifact (this file + epic-resolution skill + amendments)
- [`contract-ledger.md`](./contract-ledger.md) — reciprocal mapping of API contract completeness (T1-T4)
- Issue #10324 — existing close-target audit (this generalizes it)
- `.agents/skills/epic-resolution/` — closeout workflow consuming this ladder
- `.agents/skills/pr-review/` — Evidence Audit section consuming this ladder
- `.agents/skills/pull-request/` — 1-line declaration template consuming this ladder
