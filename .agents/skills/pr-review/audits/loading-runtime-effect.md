# Loading-Runtime-Effect Substitution Audit

Reviewer-side audit for substrate-load mistakes. The canonical file list, placement tree, mechanical pre-flight, and empirical anchors live in [`turn-memory-pre-flight`](../../turn-memory-pre-flight/references/turn-memory-pre-flight-workflow.md); do not duplicate them here.

## When this audit fires

When a PR modifies any `/turn-memory-pre-flight` IN-SCOPE substrate file. Verify the author documented `/turn-memory-pre-flight` application and load-effect reasoning.

## Failure Mode

**Loading-runtime-effect substitution**: approving file-completeness ("all harness files updated") while missing runtime-load effect ("does this load once or twice per turn?"). It is a dimension miss, not lack of engagement.

## Required Action Template

> *"Substrate-touching files modified ({list IN-SCOPE files from PR diff}). PR body does not document `/turn-memory-pre-flight` decision-tree application. Required: invoke `/turn-memory-pre-flight` retrospectively + document the 5-step decision-tree application + mechanical pre-flight commands run + harness-load-duplication risk audit in PR body."*

## Cross-Skill Bridge

- **Proactive companion (substrate-creation time)**: `/turn-memory-pre-flight` (Epic `#11256` substrate; `turn-memory-pre-flight` skill trigger)
- **Architectural router (ambiguous cases)**: `/architecture-pre-flight` (Epic `#11256` substrate)
- **Helpful-Assistant 4-sub-mode context**: Discussion `#11259` (CLOSED RESOLVED) -> ticket `#11262` -> PR `#11263` (substrate-load-time XML salience metadata)
