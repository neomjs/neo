# Age & Successor-Risk Audit Mechanics

This document provides the Atlas-level mechanics for executing the Age / Successor-Risk Audit Gate during Ticket Intake.

## 1. Workflow-Derived Bot-State Bands
Do not use arbitrary hard-coded thresholds. Derive bot-state bands from `.github/workflows/close-inactive-issues.yml` (`days-before-issue-stale` and `days-before-issue-close`).

These bands describe close-inactive automation risk only. They are NOT evidence that a ticket is architecturally current. A ticket can be stale-by-birth or stale after a short interval when newer PRs, tickets, Discussions, ADRs, operator corrections, or current source/docs/tests supersede its premise. Never cite `pre-stale` as a reason to skip successor, duplicate, existing-enforcement, or current-source checks.

- **pre-stale** (inactivity / `updatedAt` age < `days-before-issue-stale`): Standard duplicate and first-pass successor sweep. Record `createdAt` separately to distinguish same-day duplicates and hot-context drift from older-ticket successor-risk classification.
- **in-stale-window** (>= stale-days, < stale-days + close-days OR has `stale` label): Explicitly sweep newer PRs, tickets, and discussions before proceeding.
- **post-stale-with-exemption** (>= stale-days + close-days AND has `no auto close` label): Operator-parked. Full successor sweep and escalation flag required.

### 1.1 Short-Horizon Currency Check
Before emitting `valid-as-written`, explicitly check for same-day or short-horizon successor evidence when any freshness trigger is present:

- the ticket touches Agent OS substrate, skills, workflow templates, CI guards, config contracts, or ADR/Decision Record surfaces;
- the ticket body cites recently landed rules, PRs, sibling layers, or active release work;
- the operator or a peer has just corrected the premise, priority, or implementation shape;
- the ticket was created during active swarm work where local/KB state can lag remote reality.

If a newer artifact or current source state already solves or reshapes the failure mode, route to `already-resolved`, `superseded`, `duplicate`, `needs-narrowing`, or `invalid-or-negative-roi` instead of treating bot pre-stale status as low risk.

## 2. Missing Close-Link Sweep
Explicitly check for merged PRs that completed the ticket but missed a GitHub close keyword (`Resolves #N`, `Closes #N`). A merged PR touching the target surface or mentioned in the conversation may mean the ticket is `already-resolved`. If you find one, you MUST cite the PR number, merged status, target surface touched, and issue/thread link as evidence.

## 3. ADR Successor-Risk Branch
If the ticket predates, cites, conflicts with, or depends on an accepted ADR / Decision Record, run [`adr-successor-risk-audit.md`](./adr-successor-risk-audit.md) before emitting `valid-as-written`. ADRs are current authority snapshots, but later V-B-A evidence may challenge them through an explicit amendment or supersession path.

## 4. Stale Renewal vs. Exemption Discipline
If `stale` is present and the ticket remains valid, post a renewal comment and remove `stale` as a routine intake action. Do NOT auto-apply `no auto close`—applying exemption requires explicit parked/blocked rationale.

## 5. Gate-Producer Liveness
Gate waits on evidence another ticket must PRODUCE (`before #M's receipts exist`, `blocked until #M ships`)? `gh issue view <M> --json state,stateReason` before treating it as binding. Closed, or reshaped past the cited evidence, routes to `needs-relinking`, never `valid-as-written` — a dead producer makes the gate unsatisfiable while the ticket still reads as patient. Consumer side of [`ticket-intake-workflow.md`](./ticket-intake-workflow.md) §4.1; both sides exist because the closer may not sweep, and a gate can die after any sweep.
