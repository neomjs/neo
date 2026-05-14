# Age & Successor-Risk Audit Mechanics

This document provides the Atlas-level mechanics for executing the Age / Successor-Risk Audit Gate during Ticket Intake.

## 1. Workflow-Derived Age Bands
Do not use arbitrary hard-coded thresholds. Derive age bands from `.github/workflows/close-inactive-issues.yml` (`days-before-issue-stale` and `days-before-issue-close`).

- **pre-stale** (inactivity / `updatedAt` age < `days-before-issue-stale`): Standard duplicate and first-pass successor sweep. Record `createdAt` separately to distinguish same-day duplicates (hot context) from older-ticket successor-risk classification.
- **in-stale-window** (>= stale-days, < stale-days + close-days OR has `stale` label): Explicitly sweep newer PRs, tickets, and discussions before proceeding.
- **post-stale-with-exemption** (>= stale-days + close-days AND has `no auto close` label): Operator-parked. Full successor sweep and escalation flag required.

## 2. Missing Close-Link Sweep
Explicitly check for merged PRs that completed the ticket but missed a GitHub close keyword (`Resolves #N`, `Closes #N`). A merged PR touching the target surface or mentioned in the conversation may mean the ticket is `already-resolved`. If you find one, you MUST cite the PR number, merged status, target surface touched, and issue/thread link as evidence.

## 3. Stale Renewal vs. Exemption Discipline
If `stale` is present and the ticket remains valid, post a renewal comment and remove `stale` as a routine intake action. Do NOT auto-apply `no auto close`—applying exemption requires explicit parked/blocked rationale.
