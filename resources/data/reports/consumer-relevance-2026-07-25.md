# Consumer-Relevance Census — merged PRs, 2026-02-25 → 2026-07-25

Generated: 2026-07-25T16:30:24.910Z · corpus: `git log origin/dev --name-only` · mapping: `ai/scripts/diagnostics/consumerRelevanceMap.mjs`
Re-runnable and deterministic for a fixed range + mapping. **No single relevance percentage is computed anywhere** — the deliverable is the distribution and the mapping; necessity judgment is the reader's, permanently.

## Distribution

| Bucket | PRs |
|---|---|
| consumer-enabling | 1568 |
| consumer-direct:now | 526 |
| internal-only | 303 |
| consumer-direct:future-direct | 117 |
| unclassified | 1 |
| **total** | **2515** |

## Per-month trend

| Month | consumer-direct:future-direct | consumer-direct:now | consumer-enabling | internal-only | unclassified |
|---|---|---|---|---|---|
| 2026-03 | 0 | 1 | 0 | 3 | 0 |
| 2026-04 | 0 | 77 | 137 | 22 | 0 |
| 2026-05 | 0 | 118 | 497 | 81 | 0 |
| 2026-06 | 27 | 200 | 598 | 124 | 1 |
| 2026-07 | 90 | 130 | 336 | 73 | 0 |

## Unclassified (1)

PRs whose touched files match no mapping rule — listed, never silently omitted. A growing row here is a mapping gap, not a corpus defect.
- #14004 fix(ai): preserve Memory Core partial-export collection identity (#14001) (#14004) — files: —

## Appendix: per-PR table

| PR | Date | Bucket | Subsystem | Ticket labels | Files |
|---|---|---|---|---|---|
| 15898 | 2026-07-25 | consumer-enabling | skill-machinery | — | 8 |
| 15911 | 2026-07-25 | consumer-enabling | skill-machinery | — | 3 |
| 15840 | 2026-07-25 | internal-only | portal-internal | documentation, enhancement, ai, '[ ] 15248 DragCoordinator teardown hygiene: exact-once cleanup across gesture terminals', '[ ] 15207 Workstation drag-affordance layers: DockPreview + DockDropIndicators overlay siblings', '[ ] 15245 Popup acquisition contract: platform defaults from the measured matrix', '[ ] 15247 Whole-stack reintegration and the vessel close policy', '[ ] 15246 Workspace-set composition, continuous remote preview, claim arbitration', The five beats (the epic body): tear-out → convert-while-dragging → popup-over-popup previews → dock-in-popup → whole-stack reintegration with self-closing vessel. | 4 |
| 15896 | 2026-07-25 | consumer-direct:now | mcp-runtime | — | 8 |
| 15903 | 2026-07-25 | consumer-direct:future-direct | fleet-tooling | — | 1 |
| 15901 | 2026-07-25 | consumer-direct:now | app-engine | — | 2 |
| 15902 | 2026-07-25 | consumer-enabling | ci-test-infra | — | 3 |
| 15881 | 2026-07-25 | consumer-enabling | ci-test-infra | — | 1 |
| 15897 | 2026-07-25 | consumer-direct:now | app-engine | — | 2 |
| 15880 | 2026-07-25 | internal-only | docs-internal | — | 1 |
| 15893 | 2026-07-25 | consumer-enabling | skill-machinery | — | 3 |
| 15890 | 2026-07-25 | consumer-enabling | ci-test-infra | — | 8 |
| 15876 | 2026-07-25 | consumer-direct:now | mcp-runtime | — | 2 |
| 15883 | 2026-07-25 | consumer-enabling | ci-test-infra | — | 1 |
| 15870 | 2026-07-25 | consumer-enabling | ci-test-infra | — | 4 |
| 15865 | 2026-07-25 | internal-only | docs-internal | — | 2 |
| 15859 | 2026-07-25 | consumer-enabling | ci-test-infra | — | 9 |
| 15860 | 2026-07-25 | consumer-enabling | skill-machinery | — | 5 |
| 15867 | 2026-07-25 | internal-only | docs-internal | — | 2 |
| 15869 | 2026-07-25 | consumer-enabling | ci-test-infra | — | 2 |
| 15864 | 2026-07-25 | consumer-enabling | ci-test-infra | — | 5 |
| 15858 | 2026-07-25 | consumer-enabling | ci-test-infra | — | 1 |
| 15857 | 2026-07-25 | consumer-enabling | ci-test-infra | — | 3 |
| 15854 | 2026-07-25 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 15853 | 2026-07-25 | consumer-enabling | ci-test-infra | — | 1 |
| 15846 | 2026-07-25 | consumer-enabling | ci-test-infra | — | 2 |
| 15850 | 2026-07-25 | consumer-enabling | ci-test-infra | — | 1 |
| 15822 | 2026-07-24 | consumer-enabling | ci-test-infra | enhancement, ai, neo-opus-grace, 2026-07-03T22:03:50Z @neo-opus-grace assigned to @neo-opus-grace | 4 |
| 15832 | 2026-07-24 | consumer-enabling | ci-test-infra | — | 6 |
| 15836 | 2026-07-24 | consumer-enabling | ci-test-infra | — | 2 |
| 15844 | 2026-07-24 | consumer-direct:future-direct | fleet-tooling | — | 4 |
| 15824 | 2026-07-24 | consumer-enabling | ci-test-infra | — | 2 |
| 15827 | 2026-07-24 | consumer-enabling | ci-test-infra | — | 2 |
| 15829 | 2026-07-24 | consumer-enabling | ci-test-infra | — | 1 |
| 15834 | 2026-07-24 | consumer-direct:now | agent-cloud | — | 6 |
| 15841 | 2026-07-24 | consumer-enabling | ci-test-infra | — | 5 |
| 15839 | 2026-07-24 | consumer-enabling | ci-test-infra | — | 2 |
| 15823 | 2026-07-24 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 15833 | 2026-07-24 | consumer-direct:now | app-engine | — | 4 |
| 15819 | 2026-07-24 | consumer-direct:now | mcp-runtime | — | 2 |
| 15816 | 2026-07-24 | consumer-enabling | ci-test-infra | — | 5 |
| 15811 | 2026-07-24 | consumer-direct:now | mcp-runtime | — | 17 |
| 15815 | 2026-07-24 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 15814 | 2026-07-24 | consumer-enabling | ci-test-infra | — | 2 |
| 15808 | 2026-07-24 | consumer-enabling | ci-test-infra | — | 5 |
| 15793 | 2026-07-24 | consumer-enabling | ci-test-infra | — | 3 |
| 15794 | 2026-07-24 | consumer-enabling | ci-test-infra | — | 4 |
| 15810 | 2026-07-24 | internal-only | docs-internal | — | 1 |
| 15797 | 2026-07-24 | consumer-enabling | ci-test-infra | — | 11 |
| 15796 | 2026-07-24 | consumer-enabling | skill-machinery | — | 2 |
| 15804 | 2026-07-24 | consumer-enabling | skill-machinery | — | 8 |
| 15788 | 2026-07-24 | internal-only | docs-internal | — | 1 |
| 15781 | 2026-07-24 | consumer-enabling | skill-machinery | — | 2 |
| 15772 | 2026-07-24 | consumer-enabling | ci-test-infra | — | 11 |
| 15777 | 2026-07-24 | consumer-enabling | skill-machinery | — | 1 |
| 15779 | 2026-07-24 | consumer-enabling | skill-machinery | — | 1 |
| 15776 | 2026-07-24 | consumer-direct:now | agent-cloud | — | 3 |
| 15773 | 2026-07-23 | consumer-enabling | ci-test-infra | — | 11 |
| 15771 | 2026-07-23 | internal-only | docs-internal | — | 2 |
| 15769 | 2026-07-23 | consumer-direct:now | agent-cloud | — | 2 |
| 15766 | 2026-07-23 | internal-only | docs-internal | — | 9 |
| 15765 | 2026-07-23 | consumer-enabling | ci-test-infra | — | 8 |
| 15764 | 2026-07-23 | internal-only | docs-internal | — | 8 |
| 15747 | 2026-07-23 | internal-only | docs-internal | — | 13 |
| 15757 | 2026-07-23 | consumer-enabling | ci-test-infra | — | 30 |
| 15756 | 2026-07-23 | consumer-enabling | ci-test-infra | — | 3 |
| 15754 | 2026-07-23 | consumer-enabling | ci-test-infra | — | 9 |
| 15753 | 2026-07-23 | internal-only | docs-internal | — | 5 |
| 15752 | 2026-07-23 | consumer-enabling | ci-test-infra | — | 5 |
| 15743 | 2026-07-23 | internal-only | docs-internal | — | 1 |
| 15750 | 2026-07-23 | consumer-enabling | ci-test-infra | — | 5 |
| 15742 | 2026-07-23 | consumer-enabling | ci-test-infra | — | 12 |
| 15741 | 2026-07-23 | consumer-enabling | skill-machinery | — | 3 |
| 15732 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 11 |
| 15736 | 2026-07-22 | consumer-direct:future-direct | fleet-tooling | — | 10 |
| 15738 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 2 |
| 15734 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 6 |
| 15735 | 2026-07-22 | consumer-direct:now | app-engine | — | 8 |
| 15705 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 6 |
| 15733 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 4 |
| 15715 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 3 |
| 15712 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 12 |
| 15731 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 1 |
| 15716 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 9 |
| 15728 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 1 |
| 15726 | 2026-07-22 | consumer-direct:now | app-engine | — | 4 |
| 15725 | 2026-07-22 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 15724 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 1 |
| 15719 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 3 |
| 15717 | 2026-07-22 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 15696 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 7 |
| 15711 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 4 |
| 15721 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 1 |
| 15718 | 2026-07-22 | consumer-direct:future-direct | fleet-tooling | — | 5 |
| 15713 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 2 |
| 15708 | 2026-07-22 | consumer-direct:future-direct | fleet-tooling | — | 8 |
| 15707 | 2026-07-22 | consumer-direct:now | app-engine | — | 2 |
| 15698 | 2026-07-22 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, security, '[ ] 15152 Reconcile GitHub issue activity exhaustively', '[ ] 15159 Project bounded tenant community-attention counts', '[ ] 15157 Expose a temporal community Bird View and seen state', '[ ] 15155 Coordinate local GitHub community reconciliation' | 15 |
| 15688 | 2026-07-22 | consumer-direct:now | agent-cloud | — | 3 |
| 15690 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 3 |
| 15685 | 2026-07-22 | consumer-direct:now | mcp-runtime | — | 2 |
| 15584 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 6 |
| 15682 | 2026-07-22 | internal-only | docs-internal | — | 1 |
| 15661 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 2 |
| 15676 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 24 |
| 15675 | 2026-07-22 | internal-only | docs-internal | — | 3 |
| 15672 | 2026-07-22 | internal-only | docs-internal | — | 1 |
| 15670 | 2026-07-22 | consumer-direct:now | app-engine | — | 2 |
| 15669 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 6 |
| 15656 | 2026-07-22 | consumer-enabling | ci-test-infra | — | 3 |
| 15654 | 2026-07-21 | consumer-enabling | ci-test-infra | — | 5 |
| 15646 | 2026-07-21 | consumer-direct:now | app-engine | — | 1 |
| 15659 | 2026-07-21 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 15644 | 2026-07-21 | consumer-enabling | ci-test-infra | — | 1 |
| 15653 | 2026-07-21 | consumer-enabling | ci-test-infra | — | 19 |
| 15587 | 2026-07-21 | consumer-enabling | ci-test-infra | — | 6 |
| 15638 | 2026-07-21 | consumer-direct:future-direct | fleet-tooling | — | 8 |
| 15643 | 2026-07-21 | consumer-enabling | ci-test-infra | — | 3 |
| 15642 | 2026-07-21 | consumer-direct:now | app-engine | — | 2 |
| 15633 | 2026-07-21 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 15629 | 2026-07-21 | consumer-enabling | ci-test-infra | — | 11 |
| 15620 | 2026-07-20 | consumer-enabling | ci-test-infra | — | 5 |
| 15626 | 2026-07-20 | consumer-direct:now | app-engine | — | 10 |
| 15623 | 2026-07-20 | consumer-direct:now | app-engine | — | 10 |
| 15565 | 2026-07-20 | consumer-enabling | ci-test-infra | — | 17 |
| 15619 | 2026-07-20 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 15617 | 2026-07-20 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 15613 | 2026-07-20 | consumer-enabling | ci-test-infra | — | 7 |
| 15589 | 2026-07-20 | consumer-enabling | ci-test-infra | — | 3 |
| 15611 | 2026-07-20 | consumer-enabling | skill-machinery | — | 3 |
| 15609 | 2026-07-20 | internal-only | docs-internal | — | 1 |
| 15608 | 2026-07-20 | consumer-enabling | skill-machinery | — | 2 |
| 15602 | 2026-07-20 | consumer-enabling | ci-test-infra | — | 9 |
| 15601 | 2026-07-20 | consumer-enabling | ci-test-infra | — | 6 |
| 15600 | 2026-07-20 | consumer-direct:now | agent-cloud | — | 2 |
| 15594 | 2026-07-19 | consumer-enabling | ci-test-infra | — | 17 |
| 15590 | 2026-07-19 | consumer-enabling | ci-test-infra | — | 8 |
| 15588 | 2026-07-19 | consumer-enabling | ci-test-infra | — | 8 |
| 15583 | 2026-07-19 | consumer-enabling | ci-test-infra | — | 8 |
| 15566 | 2026-07-19 | consumer-direct:now | app-engine | — | 18 |
| 15547 | 2026-07-19 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 15471 | 2026-07-19 | internal-only | portal-internal | enhancement, ai, neo-gpt-emmy, '[x] 15207 Workstation drag-affordance layers: DockPreview + DockDropIndicators overlay siblings' | 6 |
| 15582 | 2026-07-19 | consumer-enabling | ci-test-infra | — | 4 |
| 15578 | 2026-07-19 | consumer-enabling | ci-test-infra | — | 2 |
| 15572 | 2026-07-19 | consumer-enabling | ci-test-infra | — | 9 |
| 15575 | 2026-07-19 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 15573 | 2026-07-19 | consumer-enabling | ci-test-infra | — | 25 |
| 15569 | 2026-07-19 | consumer-enabling | ci-test-infra | — | 3 |
| 15567 | 2026-07-19 | consumer-enabling | ci-test-infra | — | 14 |
| 15538 | 2026-07-19 | consumer-direct:future-direct | fleet-tooling | — | 1 |
| 15564 | 2026-07-19 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 15559 | 2026-07-19 | consumer-enabling | ci-test-infra | documentation, enhancement, ai, architecture, security, '[ ] 15151 Admit idempotent community batches into durable history', '[ ] 15150 Add tenant-scoped community source registration', '[ ] 15162 Prove the community-activity authority chain end to end', '[ ] 15160 Calibrate community policy from measured evidence' | 22 |
| 15560 | 2026-07-19 | consumer-enabling | ci-test-infra | enhancement, ai, neo-gpt, rerunning one resident with corrected family, GitHub login, and mailbox skips stale identityRoots / ModelStats / spec surfaces but appends a second README row;, The existing owner is `ai/scripts/setup/generateRosterOnboarding.mjs`; extend it rather than adding a parallel generator. | 2 |
| 15558 | 2026-07-19 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 15545 | 2026-07-19 | consumer-enabling | ci-test-infra | — | 8 |
| 15546 | 2026-07-19 | internal-only | docs-internal | — | 4 |
| 15553 | 2026-07-19 | internal-only | docs-internal | — | 46 |
| 15552 | 2026-07-19 | consumer-enabling | ci-test-infra | — | 4 |
| 15550 | 2026-07-19 | internal-only | docs-internal | — | 1 |
| 15548 | 2026-07-19 | consumer-enabling | ci-test-infra | enhancement, ai, testing, architecture, neo-gpt, `ai/services/github-workflow/sync/DiscussionSyncer.mjs:323-331` and `:499-512` own bulk and force-refetch materialization and currently pass `maxComments: 50` / `maxReplies: 20`. | 6 |
| 15544 | 2026-07-19 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 15543 | 2026-07-19 | consumer-direct:future-direct | fleet-tooling | — | 10 |
| 15541 | 2026-07-19 | consumer-direct:future-direct | fleet-tooling | bug, developer-experience, ai, testing, neo-gpt, a timeout result renders `0 started · 1 rejected` while its reachable detail says `timeout`;, `FleetCockpitController` is the composition root for the fleet-level action. Batch serialization and authoritative Store selection belong there; service-side ordering/backoff remains untouched. | 5 |
| 15540 | 2026-07-19 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, security, '[ ] 15151 Admit idempotent community batches into durable history', '[ ] 15159 Project bounded tenant community-attention counts', '[ ] 15158 Bind community events to canonical A2A Tasks', '[ ] 15157 Expose a temporal community Bird View and seen state', '[ ] 15155 Coordinate local GitHub community reconciliation', '[ ] 15154 Reconcile GitHub Discussions and nested replies', '[ ] 15153 Reconcile GitHub pull requests and reviews exhaustively' | 11 |
| 15532 | 2026-07-19 | consumer-enabling | ci-test-infra | — | 5 |
| 15528 | 2026-07-18 | consumer-enabling | ci-test-infra | enhancement, ai, neo-opus-vega, **loss:** `live → stale` when the transport stops answering, with a retained safe reason on the owner; | 1 |
| 15534 | 2026-07-18 | consumer-direct:future-direct | fleet-tooling | — | 4 |
| 15530 | 2026-07-18 | consumer-direct:future-direct | fleet-tooling | — | 5 |
| 15513 | 2026-07-18 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, performance, security, '[ ] 15150 Add tenant-scoped community source registration', '[ ] 15158 Bind community events to canonical A2A Tasks', '[ ] 15157 Expose a temporal community Bird View and seen state', '[ ] 15156 Push hosted GitHub community batches securely', '[ ] 15155 Coordinate local GitHub community reconciliation', '[ ] 15152 Reconcile GitHub issue activity exhaustively' | 5 |
| 15529 | 2026-07-18 | consumer-direct:now | app-engine | — | 17 |
| 15515 | 2026-07-18 | consumer-direct:future-direct | fleet-tooling | — | 3 |
| 15518 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 3 |
| 15511 | 2026-07-18 | consumer-enabling | ci-test-infra | enhancement, ai, testing, architecture, performance, '[ ] 15148 Define community-activity authority in ADR 0036', '[ ] 15150 Add tenant-scoped community source registration' | 8 |
| 15510 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 2 |
| 15505 | 2026-07-18 | consumer-direct:now | app-engine | — | 6 |
| 15503 | 2026-07-18 | consumer-direct:future-direct | fleet-tooling | — | 3 |
| 15492 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 2 |
| 15507 | 2026-07-18 | consumer-direct:future-direct | fleet-tooling | — | 1 |
| 15501 | 2026-07-18 | consumer-direct:now | app-engine | — | 13 |
| 15497 | 2026-07-18 | internal-only | docs-internal | — | 1 |
| 15496 | 2026-07-18 | consumer-direct:future-direct | fleet-tooling | — | 6 |
| 15502 | 2026-07-18 | consumer-direct:now | app-engine | — | 3 |
| 15488 | 2026-07-18 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, security, '[ ] 15149 Measure community-activity shadow coverage and cost', '[ ] 15156 Push hosted GitHub community batches securely', '[ ] 15151 Admit idempotent community batches into durable history' | 2 |
| 15499 | 2026-07-18 | consumer-direct:now | agent-cloud | — | 3 |
| 15491 | 2026-07-18 | consumer-direct:future-direct | fleet-tooling | — | 1 |
| 15482 | 2026-07-18 | consumer-direct:now | app-engine | enhancement, developer-experience, ai, needs-re-triage, '[ ] 14617 FM cockpit auto-hide rails: secondary panes on the edge-rail chain', **Consumes the #12679-orbit digest contract** (window-parameterized synthesis per the operator-seed ACs routed to its owner: `(windowStart, windowEnd, partition)` with grains as presets) — this leaf renders, never synthesizes; sequenced behind that contract exactly as #14603 is. | 24 |
| 15483 | 2026-07-18 | consumer-direct:now | app-engine | enhancement, ai, accessibility, '[ ] 15207 Workstation drag-affordance layers: DockPreview + DockDropIndicators overlay siblings', '[ ] 15246 Workspace-set composition, continuous remote preview, claim arbitration', '[ ] 15245 Popup acquisition contract: platform defaults from the measured matrix', '[ ] 15244 Dock tear-out: lift the proxy-to-popup opt-out into dock semantics', The dock model side is COMMAND-shaped already: `detachItem` (ADR 0029 §2.1 / ADR 0020) and `transferItem` are semantic operations — no pointer required; this leaf builds the interaction surface, not new model capability. | 6 |
| 15480 | 2026-07-18 | consumer-direct:now | app-engine | enhancement, ai, architecture, '[ ] 15246 Workspace-set composition, continuous remote preview, claim arbitration', '[ ] 15252 The five-beat multi-window wow demo: recorded journey on the workstation', The `#15240` outcome machine governs every terminal: source cleanup + empty-vessel close ONLY after `COMMITTED_TARGET`; reject/no-preview restores the source with zero model mutation; **model commit precedes window close — a close failure can neither roll back the commit nor double-reintegrate**. | 6 |
| 15479 | 2026-07-18 | consumer-enabling | ci-test-infra | enhancement, developer-experience, ai, neo-fable, Rides the lane-3 demo pattern (deterministic NL-driven tour = the test, the demo, AND the recording script — one source of truth; #14589's contract, cockpit-half). | 5 |
| 15481 | 2026-07-18 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 15455 | 2026-07-18 | consumer-enabling | ci-test-infra | enhancement, ai | 5 |
| 15478 | 2026-07-18 | consumer-direct:now | app-engine | — | 2 |
| 15469 | 2026-07-18 | consumer-direct:now | app-engine | — | 2 |
| 15475 | 2026-07-18 | consumer-direct:now | mcp-runtime | — | 2 |
| 15474 | 2026-07-18 | consumer-enabling | ci-test-infra | enhancement, developer-experience, ai, '[ ] 14615 FM cockpit shell layout: compose the surface via the docking container contract', '[ ] 14620 FM cockpit catch-up view: what happened since you last looked', Consumes the #13280 chain: rail projection (merged), reveal overlay + pin (its open phases — this leaf binds them when they land; until then rails render + pin-less reveal degrades to a click-to-pin-prompt, honestly). | 2 |
| 15473 | 2026-07-18 | internal-only | docs-internal | documentation, enhancement, ai, architecture, neo-gpt, '[ ] 15149 Measure community-activity shadow coverage and cost' | 3 |
| 15472 | 2026-07-18 | consumer-direct:future-direct | fleet-tooling | enhancement, javascript, ai, refactoring, **apps/agentos/view/fleet/EventChip.mjs:59-65** | 4 |
| 15470 | 2026-07-18 | consumer-enabling | ci-test-infra | enhancement, ai, testing, '[ ] 15212 FM cockpit card click no longer opens the agent-detail drill', '[x] 14610 FM cockpit pop-out: agent detail to its own OS window on the shared heap', Whitebox-e2e house pattern (custom named config; `NEO_TEST_SKIP_CI` only; honest-red discipline); suite conventions shared with #14607/#14591. | 1 |
| 15467 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 3 |
| 15465 | 2026-07-18 | consumer-direct:now | app-engine | enhancement, ai, architecture, '[ ] 15244 Dock tear-out: lift the proxy-to-popup opt-out into dock semantics', '[ ] 15240 Amend ADR 0029: claim arbitration, gesture outcome states, vessel lifecycle', '[ ] 15252 The five-beat multi-window wow demo: recorded journey on the workstation', '[ ] 15247 Whole-stack reintegration and the vessel close policy', `Neo.manager.DragCoordinator`: already N-window shaped (`sortGroup → Map(windowId → zone)`); the `#13028` native-popup candidate path (450 ms dwell / 250 ms settle) is EXTENDED, never replaced. | 10 |
| 15464 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 5 |
| 15463 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 4 |
| 15462 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 1 |
| 15458 | 2026-07-18 | consumer-direct:now | app-engine | bug, ai, refactoring, testing, regression, grid, `src/grid/Body.mjs:240-241` gives every physical body `tabIndex: '-1'`. | 6 |
| 15456 | 2026-07-18 | consumer-direct:future-direct | fleet-tooling | enhancement, ai, '[ ] 15245 Popup acquisition contract: platform defaults from the measured matrix', '[ ] 15212 FM cockpit card click no longer opens the agent-detail drill', '[ ] 15244 Dock tear-out: lift the proxy-to-popup opt-out into dock semantics', `apps/agentos` Fleet cockpit: the card → agent-detail drill (currently regressed, `#15212`, Euclid's lane — a blocker this leaf waits out). | 2 |
| 15427 | 2026-07-18 | consumer-direct:future-direct | fleet-tooling | — | 11 |
| 15461 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 14 |
| 15457 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 2 |
| 15453 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 4 |
| 15451 | 2026-07-18 | internal-only | docs-internal | — | 1 |
| 15419 | 2026-07-18 | internal-only | docs-internal | — | 3 |
| 15438 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 10 |
| 15445 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 1 |
| 15434 | 2026-07-18 | consumer-direct:now | app-engine | — | 2 |
| 15435 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 7 |
| 15444 | 2026-07-18 | consumer-direct:now | app-engine | enhancement, ai, architecture, '[ ] 15240 Amend ADR 0029: claim arbitration, gesture outcome states, vessel lifecycle', '[ ] 15243 Headed three-OS portability spike: the seven-row tear-out matrix', '[ ] 15251 Fleet cockpit consumes the dock tear-out seam', '[ ] 15250 Keyboard detach path: a11y parity for the multi-window choreography', '[ ] 15246 Workspace-set composition, continuous remote preview, claim arbitration', `src/draggable/container/SortZone.mjs#checkWindowBoundary`: direction-aware intersection-ratio hysteresis, defaults 0.8 detach / 0.6 reattach (`#8160`). | 5 |
| 15437 | 2026-07-18 | consumer-direct:now | app-engine | — | 2 |
| 15442 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 7 |
| 15440 | 2026-07-18 | consumer-direct:future-direct | fleet-tooling | enhancement, design, ai, neo-opus-vega, `apps/agentos/view/AgentConfigCard.mjs` (219 lines), `apps/agentos/view/FleetSettingsPanel.mjs` (188 lines), `apps/agentos/view/Accounts.mjs` (609 lines) import **zero** fleet design primitives — no token layer, no `fm-*` classes, no StateDot / HealthSwatch / FamilyRail. Their last commits were data-plumbing only (#14998 sparse-config persistence, #14920 store de-singletonization)., The Brain-side machinery is shipped: registry + credential store (#13031), control-plane facade (#13192), add-agent canonical readback round-trip (#14614). This leaf is UI composition, not new services. | 25 |
| 15433 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 5 |
| 15424 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 1 |
| 15420 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 3 |
| 15399 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 7 |
| 15411 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 5 |
| 15403 | 2026-07-18 | consumer-direct:future-direct | fleet-tooling | — | 4 |
| 15425 | 2026-07-18 | internal-only | docs-internal | — | 1 |
| 15423 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 2 |
| 15418 | 2026-07-18 | consumer-direct:now | app-engine | — | 5 |
| 15409 | 2026-07-18 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 15416 | 2026-07-18 | consumer-direct:now | agent-cloud | — | 2 |
| 15413 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 3 |
| 15408 | 2026-07-18 | consumer-direct:now | app-engine | — | 6 |
| 15406 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 7 |
| 15398 | 2026-07-18 | consumer-direct:future-direct | fleet-tooling | — | 12 |
| 15389 | 2026-07-18 | consumer-direct:now | app-engine | — | 6 |
| 15393 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 3 |
| 15381 | 2026-07-18 | consumer-direct:now | app-engine | — | 2 |
| 15384 | 2026-07-18 | internal-only | docs-internal | — | 5 |
| 15388 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 2 |
| 15386 | 2026-07-18 | consumer-enabling | ci-test-infra | — | 5 |
| 15380 | 2026-07-17 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, security, '[ ] 15270 FM cockpit per-agent mailbox pane — read-only AgentDetail tab (S1 view half, D#15249)' | 22 |
| 15378 | 2026-07-17 | consumer-enabling | ci-test-infra | — | 2 |
| 15375 | 2026-07-17 | consumer-direct:future-direct | fleet-tooling | enhancement, ai, architecture, `wireBootIdentityReadSource` is the shape precedent: `create*ReadSource` + a `wire*` that installs it onto the bridge and returns it, with "no source → leave the seam unwired (honest advisory-unknown), never fabricate a source". | 3 |
| 15373 | 2026-07-17 | consumer-enabling | ci-test-infra | — | 4 |
| 15341 | 2026-07-17 | consumer-enabling | ci-test-infra | bug, ai, testing, neo-gpt-emmy, Reviewer's local exact-head run: 62/62, `QueryService` alone one-worker 14/14 — **correct**, because the *branch* has 32 files (fewer than dev). | 1 |
| 15371 | 2026-07-17 | consumer-enabling | ci-test-infra | enhancement, ai, neo-fable, `.claude/hooks/laneStateStopHook.mjs` + its decision module: the validator already distinguishes trigger classes (`valid lane-state terminal` vs enum/evidence failures) — the acceptance seam exists. | 4 |
| 15335 | 2026-07-17 | consumer-direct:future-direct | fleet-tooling | enhancement, ai, architecture, neo-opus-ada, `ai/services/fleet/FleetControlBridge.mjs:87` documented a source exposing `readActivitySnapshot(params)` and returning bounded `{capability, events}`., `FleetControlBridge` is dependency-injected and authors no admission fact. The composer is a source it consumes, not a capability the bridge invents. | 3 |
| 15327 | 2026-07-17 | consumer-direct:now | app-engine | bug, ai, testing, core, accessibility, neo-gpt-emmy, the button stays in the tab order;, `src/component/Abstract.mjs:72-76` defines the generic contract: `neo-disabled` plus no DOM events. | 5 |
| 15361 | 2026-07-17 | consumer-enabling | ci-test-infra | — | 1 |
| 15355 | 2026-07-17 | consumer-enabling | ci-test-infra | — | 1 |
| 15357 | 2026-07-17 | consumer-enabling | ci-test-infra | bug, ai, testing, neo-opus-grace, `getBroadcastDeliveryEdge(messageId, target)` selects the recipient-specific carrier. | 2 |
| 15314 | 2026-07-17 | consumer-enabling | ci-test-infra | bug, ai, architecture, neo-gpt-emmy, **`ai/scripts/setup/initServerConfigs.mjs:788-800`** — the narrow `isOnlyServerMaterializationDrift` case is safe and preserves operator edits. **Every broader per-server drift executes `await fs.writeFile(activePath, activeTemplateSrc)`** — the whole materialized template over `config.mjs`, with **no per-server backup**. *(V-B-A'd at source before folding: confirmed exactly as reported.)* | 21 |
| 15363 | 2026-07-17 | consumer-enabling | ci-test-infra | — | 1 |
| 15356 | 2026-07-17 | consumer-enabling | ci-test-infra | bug, ai, model-experience, neo-opus-ada, **The diff:** clean by construction. | 1 |
| 15350 | 2026-07-17 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, neo-opus-vega, '[x] 15115 FM cockpit keyboard operability: listitem cards + native drill Button', Token-level contrast audit: every ink-tier × surface-tier pair in #14578 measured against WCAG AA for its usage class (body text vs meta text vs disabled) — results recorded IN the token reference doc (deltas = recorded design decisions with Grace's design authority in the loop)., *Superseded: "Focus-or | 1 |
| 15349 | 2026-07-17 | consumer-enabling | ci-test-infra | enhancement, ai, testing, neo-opus-ada, `ai/mcp/server/*/configBase.mjs` — post-#15314, defaults and leaves live here. | 4 |
| 15348 | 2026-07-17 | consumer-direct:future-direct | fleet-tooling | bug, ai, neo-opus-grace, `ai/services/fleet/fleetWakeStateAdapter.mjs` | 7 |
| 15346 | 2026-07-17 | consumer-enabling | ci-test-infra | bug, ai, testing, neo-opus-vega | 1 |
| 15344 | 2026-07-17 | consumer-enabling | ci-test-infra | enhancement, ai, testing, neo-gpt-emmy, **No false-green risk.** `playwright.config.e2e.mjs` sets `workers: 1, fullyParallel: false`, so no intra-run collision; an occupied port throws `EADDRINUSE` in `beforeEach` — fail-loud., `src/ai/fleet/installFleetBridge.mjs:21` — `url` default, injectable in signature, never injected. | 6 |
| 15343 | 2026-07-17 | consumer-enabling | ci-test-infra | enhancement, help wanted, good first issue, contributor-experience, ai, testing, core, msranjana, Runtime source: `src/util/Array.mjs` | 1 |
| 15342 | 2026-07-17 | consumer-direct:future-direct | fleet-tooling | enhancement, design, ai, neo-opus-ada, Graduated design direction (binding): **two orthogonal axes, not one enum** — `wake: on | off | suppressed | unknown` × `throttle: none | overage | rate-limited | unknown`. | 13 |
| 15338 | 2026-07-17 | consumer-enabling | ci-test-infra | bug, developer-experience, ai, neo-opus-ada, Agent worktrees are created by the documented bootstrap path (`bootstrapWorktree`), which copies configs but does **not** set `user.name` / `user.email`; git then resolves them from the operator's global config. | 4 |
| 15336 | 2026-07-17 | internal-only | docs-internal | bug, ai, build, neo-gpt-emmy, `apps/devindex/services/GitHub.mjs:258-286` owns the authenticated REST transport and is the narrowest correct retry boundary. | 3 |
| 15334 | 2026-07-17 | consumer-direct:now | mcp-runtime | bug, ai, testing, security, neo-gpt, '[ ] 15291 Run the synchronized Genesis Neural Link proof', `createProbeEnvironments()` already gives the probe-owned MCP child an explicit SQLite path and gives both diagnostic-writing children an explicit log root under the unique disposable root. | 7 |
| 15332 | 2026-07-17 | consumer-direct:future-direct | fleet-tooling | enhancement, ai, neo-opus-vega, `readActivitySnapshot` exists **only as a consumer** — `FleetControlBridge.mjs:355` calls `this.activitySource.readActivitySnapshot(params)`, and `:87` documents the contract. **No producer fills the slot.** | 4 |
| 15329 | 2026-07-17 | consumer-enabling | ci-test-infra | enhancement, ai, testing, neo-opus-vega, `buildScripts/util/check-aiconfig-test-mutation.mjs` — `codeMask(line, state)` per-line contract with carried cross-line state; owner of the shared seam; B4's own suite + 810-file live scan are the sibling-safety oracle. | 6 |
| 15326 | 2026-07-17 | consumer-direct:now | app-engine | enhancement, ai, testing, neo-opus-ada, '[x] 15240 Amend ADR 0029: claim arbitration, gesture outcome states, vessel lifecycle', '[ ] 15252 The five-beat multi-window wow demo: recorded journey on the workstation', '[ ] 15247 Whole-stack reintegration and the vessel close policy' | 4 |
| 15321 | 2026-07-17 | consumer-enabling | ci-test-infra | bug, ai, neo-opus-ada, Line 2104: `db.getAdjacentNodes(messageId, 'both')` is the vicinity-sync whose stated purpose ("Ensures the SENT_TO edge iteration sees peer-process writes") is exactly what fails here. | 2 |
| 15319 | 2026-07-17 | consumer-enabling | ci-test-infra | bug, ai, testing, architecture, build, neo-opus-grace, `resources/content/_index.json`: **4,566** `pulls` entries., §1.3: GitHub is source of truth; `resources/content/` is regeneratable. | 11 |
| 15310 | 2026-07-17 | consumer-enabling | ci-test-infra | enhancement, developer-experience, ai, neo-opus-grace | 4 |
| 15318 | 2026-07-17 | consumer-enabling | ci-test-infra | bug, ai, testing, regression, neo-gpt, '[ ] 15251 Fleet cockpit consumes the dock tear-out seam', '[ ] 14613 FM cockpit drill e2e: card → detail → pop-out → reattach round-trip', `FleetCockpitDrillNL.spec.mjs` still clicks `.fm-card-avatar`. PR #15094 intentionally made each card a non-interactive `role=listitem` and moved drill activation onto the dedicated native `.fm-card-drill` Button. The avatar doing nothing is now correct., `AgentCard` is a non-interactive `role=listitem`. The resident name is a dedicated native drill `Button` (`.fm-card-drill`) with native Enter/Space semantics; lifecycle toggle/restart are se | 2 |
| 15313 | 2026-07-17 | consumer-enabling | ci-test-infra | bug, ai, neo-opus-ada, 2026-07-16T~06:05Z — `list_issues({assignee: 'neo-fable', state: 'open'})` → `{count: 0, issues: []}`, The GitHub-workflow server syncs GitHub → `resources/content/issues/**` on the hourly data pipeline; `list_issues` reads that store. Frontmatter carries `assignees`, so the filter presumably matches mirror rows — a row missing/stale in the mirror silently drops out of the answer. | 5 |
| 15312 | 2026-07-17 | consumer-direct:now | app-engine | enhancement, ai, neo-opus-vega, `dispatchFleetRequest` receives no request-bound identity — zero hits for identity / RequestContext / auth / token., View: `apps/agentos/view/fleet/MailboxPane.mjs` + its `AgentDetail` tab host — renders, never fetches. | 19 |
| 15298 | 2026-07-17 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-ada, '[x] 15267 Produce the lifecycle frontier — the response-required fact source', **Owner:** the Memory Core operational service boundary (§2.6). Every local resident already authenticates to it; its SQLite/WAL store is process-shared so multiple processes can arbitrate one target; it has an operational `SummarizationJobs` lease-table precedent; and keeping the writer next to the broker lets the resource vali | 11 |
| 15295 | 2026-07-17 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, model-experience, neo-opus-ada, '[x] 15296 Publish hook projections through the fenced single-writer lease', **Envelope:** `lifecycle-frontier.v1` — `{schemaVersion, scope: {agentId, harnessInstance}, status, capturedAt, sourceWatermark, expiresAt, coverage: {sources, degradedSources}, items[], notAuthority: true}`. | 7 |
| 15311 | 2026-07-16 | consumer-enabling | ci-test-infra | bug, ai, testing, model-experience, neo-gpt, `getReviewBudgetAuditSnapshot()` recognizes exact `[review-budget-managed]` / `[review-budget-override]` lines and the reserved audit-field grammar in `ai/services/github-workflow/PullRequestService.mjs:902-931`., Runtime owner: `ai/services/github-workflow/PullRequestService.mjs` | 3 |
| 15285 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, ai, neo-opus-vega, '[ ] 15270 FM cockpit per-agent mailbox pane — read-only AgentDetail tab (S1 view half, D#15249)', MailboxService already discovers bounded pagination (`limit`, `offset`) and thread metadata (`partOfThread`); its public summary must carry that discovered thread fact so the adapter can project the real service contract rather than an enriched test double. | 4 |
| 15281 | 2026-07-16 | consumer-direct:now | app-engine | enhancement, ai, neo-opus-grace, The graduated taxonomy (binding): `throttle: none | overage | rate-limited | unknown`. Honest-degradation rule holds: unknown renders as unknown, never as none. | 8 |
| 15307 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-gpt-emmy | 18 |
| 15305 | 2026-07-16 | internal-only | docs-internal | bug, documentation, ai, neo-opus-grace, Re-planning v13.2, re-weighting cornerstones, or touching the deferred set. The g | 1 |
| 15304 | 2026-07-16 | consumer-enabling | ci-test-infra | bug, developer-experience, ai, neo-opus-grace | 5 |
| 15302 | 2026-07-16 | consumer-direct:future-direct | fleet-tooling | bug, design, ai, neo-opus-grace | 2 |
| 15300 | 2026-07-16 | consumer-enabling | ci-test-infra | bug, developer-experience, ai, neo-opus-grace, `.claude/settings.template.json:30` allows `git push --force-with-lease origin agent/*`. Branches under `agent/*` can therefore **rebase** — a rebase replays only the author's own commits, never stages dev's sync files, and never trips this guard. | 2 |
| 15287 | 2026-07-16 | consumer-direct:now | app-engine | enhancement, ai, architecture, neo-opus-grace, **Two-hemisphere boundary is the design rule (inherited from #13015):** the tenant PAT is a secret — stored/used Node-side (Brain), never transits the browser. The PAT rides *in* through the connect call and authenticates MC/KB transport; it never comes back out., Add a `connectTenant` control verb (single-`params`: `{tenantUrl, credential}`) to `FleetControlBridge`; add to `FLEET_WIRE_METHODS` + the browser-side bridge; disp | 5 |
| 15280 | 2026-07-16 | consumer-direct:now | app-engine | enhancement, ai, neo-opus-grace, The graduated taxonomy (binding): `wake: on | off | suppressed | unknown` — one of two ORTHOGONAL axes (throttle is the sibling leaf). Honest-degradation rule: unknown renders as unknown, never as healthy. | 11 |
| 15290 | 2026-07-16 | consumer-direct:future-direct | fleet-tooling | enhancement, design, ai, neo-fable, Derive one shell-level banner from the existing owner-held `gridAdapterState` / `streamAdapterState` values. `sample` (cold) takes precedence over `stale` (degraded), which takes precedence over `live`. | 4 |
| 15292 | 2026-07-16 | consumer-enabling | ci-test-infra | bug, ai, neo-fable-clio, `test/playwright/unit/ai/services/graph/computedGoldenPathRouting.spec.mjs`, The stop-hook's lexicon/validator behavior (#15233 and its wave own that)., #15233 (adjacent hook substrate), the `UNIT_TEST_MODE` isolation discipline. | 2 |
| 15264 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, model-experience, neo-opus-ada, **Synthesis engine reuse:** the on-demand `synthesizeTemporalBirdView` composition + honest-absence envelope shipped by #14435 (`ai/services/memory-core/helpers/*`) is the shared dynamic-synthesis path. `explore_lane_landscape` injects a *current-state* source projection into that same engine, exactly as #15088 injected its PR-source retrieve — no second synthesizer. | 20 |
| 15288 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, ai, neo-fable, `apps/agentos/app.mjs` already calls `installFleetBridge()` unconditionally (fetch transport → `http://127.0.0.1:8083/fleet`); the browser side needs zero changes. | 5 |
| 15282 | 2026-07-16 | consumer-direct:now | app-engine | enhancement, ai, neo-fable-clio, '[ ] 15252 The five-beat multi-window wow demo: recorded journey on the workstation', '[ ] 15250 Keyboard detach path: a11y parity for the multi-window choreography', '[ ] 15241 Register the workstation app in the portal examples catalogs' | 24 |
| 15279 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, help wanted, ai, testing, architecture, security, neo-gpt, '[x] 15186 Enforce an exact Neural Link local probe projection', '[x] 15185 Bind local MCP ingress to loopback with a disposable bearer', `RecorderService` writes tool telemetry to the configured Memory Core SQLite path and uses WAL sidecars. | 13 |
| 15289 | 2026-07-16 | consumer-enabling | ci-test-infra | bug, ai, testing, neo-fable-clio, the `before` assert hard-equals the 2-item list; | 1 |
| 15229 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-vega, 2026-07-04T03:51:35Z @neo-fable-clio added the `enhancement` label | 13 |
| 15266 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, developer-experience, ai, neo-fable, '[x] 14608 FM cockpit agent detail view: drill-in panes with freshness-labeled claims', '[ ] 14613 FM cockpit drill e2e: card → detail → pop-out → reattach round-trip', Consumes the multi-window/shared-heap primitive + the #13158/#14423 seam contracts (reparent-never-recreate is seam-v0's promise; rows 3–4 are the cockpit-card binding surface per its owner). | 6 |
| 15259 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-vega, '[x] 15277 Era-chain-first family read spine + era-owned flat-fact retirement', Each family/model read-path consumes `buildHydrationIndex(...).index.currentEra.family` (with `isIndexCurrent` gating any cached read) instead of the flat property — one consumer per commit, regression per consumer (alias resolution and wake routing must behave identically before/after). | 14 |
| 15275 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, build, neo-opus-grace, '[x] 14500 ADR-0019 lint: fail-build on defensive optional-chaining (B3) + env-helper reintroduction (A5) on AiConfig', `buildScripts/util/check-aiconfig-antipatterns.mjs` (shipped by PR #15211) carries an extensible `RULES` array, the shared `codeMask` string/comment masking (imported from the B4 sibling), an `ESCAPE_MARKER` relief valve, and a census-seeded `ALLOWLIST` ratchet. A1 slots in as a third rule — but with a **file-level pre-condition**, not just a line regex. | 2 |
| 15263 | 2026-07-16 | consumer-enabling | skill-machinery | documentation, enhancement, ai, neo-gpt-emmy, The authority surface: **AGENTS.md §swarm_topology_anchor's 4-Tier Decision Escalation Ladder** — this leaf amends its text (a named Tier-2 substrate surface; no ADR — the D#15256 `Decision Record: NOT_NEEDED` ruling covers the review-tool lane; THIS leaf names the ladder explicitly per the Step-Back's requirement). | 5 |
| 15262 | 2026-07-16 | consumer-enabling | skill-machinery | bug, documentation, ai, neo-opus-grace, **§5.2 "Trigger — high-blast-radius (any ONE qualifies)"** — six conditions (durable-content layout, CI coupling, migration, skill/rule substrate, cross-substrate, epic-bound ≥3 subs) gating the mandatory Step-Back sweep. Its "Out of scope" paragraph exempts "low-blast-radius proposals (single-PR-worth, bounded artifact, no cross-substrate coupling)"., `.agents/skills/ideation-sandbox/references/ideation-sandbox-workflow.md` — §5.2 trigger list (~lines 91–97), §5.2 "Out of scope" (~line 114), §6.1 classification paragraph + table (~lines 124–133). | 1 |
| 15260 | 2026-07-16 | internal-only | docs-internal | documentation, enhancement, ai, architecture, neo-fable-clio, '[ ] 15248 DragCoordinator teardown hygiene: exact-once cleanup across gesture terminals', '[ ] 15246 Workspace-set composition, continuous remote preview, claim arbitration', '[ ] 15245 Popup acquisition contract: platform defaults from the measured matrix', '[ ] 15244 Dock tear-out: lift the proxy-to-popup opt-out into dock semantics', **The claim protocol (from OQ3 `[RESOLVED_TO_AC]`):** session-scoped gesture token; short-lived hit-claims keyed on stable workspace/zone identity (never `windowId` / registration order); validity/expiry; deterministic tie (earliest valid claim; stable-identity lexicographic final tiebreak), st | 1 |
| 15222 | 2026-07-16 | consumer-enabling | ci-test-infra | bug, ai, architecture, neo-opus-vega, '[x] 15233 Stop-hook deference lexicon: exempt correct role-attribution in human-only domains', The operator's mid-turn scope-rulings message exists ONLY as: two `type: 'queue-operation'` records (enqueue envelopes, no role) + one `type: 'attachment'` record carrying the text at **`record.attachment.prompt`** (line 407). **Zero user-role records** carry it., `.claude/hooks/laneStateStopHook.mjs` — `extractLatestHumanUserTextFromJsonl` filters on `(message.role || record.type) === 'user'`, skips `isMeta: true`, text-less, and harness-marker records; FIRST remaining candidate de | 4 |
| 15255 | 2026-07-16 | consumer-direct:future-direct | fleet-tooling | enhancement, design, ai, neo-opus-grace, `apps/agentos/design/fleet-manager-cockpit-plan.html` — the SSOT (committed via #14512; design authority: @neo-opus-grace). Section idiom: `.sec` blocks with `.sec-head`/`.sec-num`; card idiom: `.lane`/`.lane-head`/`.lane-body`/`.subs` (reusable for registry entries without new layout CSS). | 1 |
| 15231 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, model-experience, neo-opus-ada, `AgentOrchestrator.parseGoldenPath()` (`ai/agent/AgentOrchestrator.mjs:86–113`) regex-matches `## Computed Golden Path` and re-extracts `issue-<n>` + description rows from `sandman_handoff.md`. | 10 |
| 15208 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, design, ai, neo-fable-clio | 24 |
| 15225 | 2026-07-16 | consumer-enabling | ci-test-infra | bug, ai, testing, regression, neo-opus-vega, Two agents running unit suites concurrently contend for one port — the loser's webServer boot wedges., The config already models per-process isolation for the data dir — the port simply never got the same treatment. | 5 |
| 15218 | 2026-07-16 | internal-only | docs-internal | documentation, enhancement, ai, neo-opus-grace, Deferred list, v13.3 line: remove `#14570` (keep #14569 and the rest verbatim — only #14570 was ruled in)., Any further roadmap re-planning (cornerstone prose, v14 horizon) — operator territory., 2026-07-16T07:38:20Z @neo-opus-grace ass | 1 |
| 15236 | 2026-07-16 | internal-only | docs-internal | documentation, enhancement, ai, neo-fable, 2026-07-16T09:02:35Z @neo-fable added the `documentation` label | 1 |
| 15232 | 2026-07-16 | consumer-enabling | ci-test-infra | bug, ai, build, neo-opus-grace, **Gate reviews** (`APPROVED` / `CHANGES_REQUESTED`): flip `reviewDecision`, carry merge semantics, and rightly owe the full template (Strategic-Fit, Depth Floor, metrics, the 7 tags)., GitHub's review `state` field already encodes the distinction mechanically: only `APPROVED`/`CHANGES_REQUESTED` participate in `reviewDecision`. The swarm's own merge-gate rules (§6.1: "a comment alone is insufficient") establish that COMMENTED carries no gate weight — the lint should mirror the gate it protects. | 1 |
| 15223 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, developer-experience, ai, neo-fable, 2026-07-04T03:32:43Z @neo-opus-vega added the `enhancement` label | 7 |
| 15224 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, help wanted, ai, architecture, security, neo-gpt, '[ ] 15187 Prove the BigData Neural Link probe and erase diagnostics', `healthcheck`;, `ai/mcp/server/neural-link/openapi.yaml` owns operation IDs and per-operation `x-neo-tool-tier` metadata. | 4 |
| 15211 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, model-experience, neo-opus-grace, '[ ] 15213 Extend the AiConfig antipattern lint to A1 module-level env re-derivation', **Model:** `buildScripts/util/check-aiconfig-test-mutation.mjs` (B4) — a regex (`DB_PATH_MUTATION`) + `ESCAPE_MARKER` relief valve + shrinking `ALLOWLIST` ratchet (bites only NEW offenders) + CI workflow. Proven shape; mirror it., **B3** — defensive optional-chaining on an AiConfig read: `\b(?:aiConfig|AiConfig|Memory_Config)\b[\w.$\[\]'"`-]*\?\.` (a `?.` anywhere in an AiConfig access path). §3 B3: "the SSOT guarantees the tree; let it fail loud." | 3 |
| 15214 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, security, neo-gpt, '[x] 15188 Rename the server transport value to streamable-http', '[ ] 15187 Prove the BigData Neural Link probe and erase diagnostics', `mcpHttpHost` is the advertised host; it is not presently the listener bind. | 8 |
| 15210 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, ai, model-experience, neo-opus-vega, `classifyPromptingContext()` / `isOperatorInLoop()` in `ai/scripts/lifecycle/stopHookDecision.mjs` trust only visible prompting text (last text-bearing user record); `stop_hook_active` forces the autonomous classification for every chained turn regardless of what arrived mid-chain. | 4 |
| 15205 | 2026-07-16 | consumer-direct:now | app-engine | enhancement, design, ai, neo-fable-clio | 7 |
| 15183 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, developer-experience, ai, neo-gpt, '[x] 14598 FM cockpit AgentCard component — the resident card at the artifact bar', `FleetControlBridge#defineAgent` is the Body-reachable allowlist and returns `FleetRegistryService#defineAgent`'s canonical public definition. | 7 |
| 15191 | 2026-07-16 | consumer-enabling | ci-test-infra | documentation, enhancement, ai, architecture, neo-gpt, '[ ] 15185 Bind local MCP ingress to loopback with a disposable bearer', `ai/mcp/server/BaseServer.mjs` is the shared server transport-selection choke point. | 48 |
| 15193 | 2026-07-16 | consumer-direct:now | app-engine | enhancement, ai, neo-gpt-emmy, '[x] 15189 Stop cross-window transfers from invalidating dockZone.v1', '[x] 14980 Early gestures are deaf to worker-side drag zones + no gesture-time key capture exists', ADR 0029 §2.3 remains the authority: `DragCoordinator` is dock-blind; both workspaces share one `sortGroup`; target-side `DockCrossWindowParticipation` commits `transferItem`; source-side completion suppresses the local drop; documents stay worker-owned. | 15 |
| 15198 | 2026-07-16 | consumer-enabling | ci-test-infra | enhancement, help wanted, good first issue, contributor-experience, ai, testing, core, stantheman0128, Runtime source: `src/util/Style.mjs` | 1 |
| 15190 | 2026-07-15 | internal-only | docs-internal | bug, ai, testing, regression, architecture, neo-gpt-emmy, '[ ] 14772 Cross-window drag showcase: the two-window transfer demo scene', `dockZone.v1` is the finite, per-workspace document contract. Unexpected item keys fail closed at capture/validation. | 4 |
| 15182 | 2026-07-14 | consumer-direct:now | app-engine | bug, ai, neo-gpt-emmy, '[ ] 14772 Cross-window drag showcase: the two-window transfer demo scene', Main-thread `DragDrop` addon owns proxy/visuals and works from frame one; worker zones subscribe via `addDomListeners` (async round-trip) — the two halves have no shared readiness contract. | 15 |
| 15181 | 2026-07-14 | internal-only | portal-internal | documentation, enhancement, developer-experience, ai, neo-gpt-emmy, `apps/**` `.css` / neo-config / `theme-map.json` artifacts are ignored by default (new-app gitignore whitelist pattern); they are produced by the theme build, not committed. | 1 |
| 15180 | 2026-07-14 | consumer-direct:future-direct | fleet-tooling | bug, ai, testing, architecture, neo-gpt-emmy, expected original CounterPane id: `neo-component-1`, Reconciler retirement remains correct for true removals: an item absent from every projected tabs destination should retire its live pane/button exactly once. | 3 |
| 15177 | 2026-07-14 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, neo-gpt-emmy, Shipped ops to choreograph: split/tab adapters, `resizeSplit`, `setItemAutoHidden` (+ drag preview, splitter resize) — `src/dashboard/*`, contract `learn/agentos/HarnessDockZoneModel.md`. | 1 |
| 15176 | 2026-07-14 | consumer-enabling | ci-test-infra | enhancement, design, ai, architecture, neo-gpt-emmy, '[x] 15136 Workstation dock projection: preserve tab-chrome identity across document refresh', `DemoAWorkspace.refreshDockWorkspace()` removes/inserts child 0 while preserving overlay siblings;, surviving logical tab nodes lose their `tab.Container`, toolbar, body, strip, Overflow, and button identities;, `DockLayoutAdapter` remains the pure, stateless document-to-config projector. | 19 |
| 15175 | 2026-07-14 | consumer-direct:now | app-engine | enhancement, design, ai, testing, architecture, neo-gpt-emmy, inline bands are relative to the Workstation root through `cqi`;, `DockLayoutAdapter` projects reusable `.neo-dashboard-dock-edge-band-<edge>` hooks and deliberately keeps their cross-extent non-flexing. | 4 |
| 15170 | 2026-07-14 | consumer-enabling | ci-test-infra | enhancement, design, ai, architecture, neo-gpt-emmy, '[ ] 15171 Dock projection: migrate remaining consumers to the identity reconciler', tab-header and strip identities reset even when the dock node still exists;, `apps/workstation/view/Workspace.mjs#refreshDockWorkspace` demonstrates the native permanence transaction: both source and destination parents exist, pane removals/inserts are silent, and one `host.update()` with `updateDepth = -1` emits DOM moves. | 9 |
| 15169 | 2026-07-14 | consumer-direct:now | app-engine | enhancement, design, ai, testing, neo-gpt-emmy, `resources/scss/src/apps/workstation/Workspace.scss:62` fixes the left band at 260px. | 2 |
| 15168 | 2026-07-14 | consumer-enabling | ci-test-infra | enhancement, design, ai, testing, neo-gpt-emmy, `DockLayoutAdapter.createSplitterAffordance()` emits one `Neo.dashboard.DockSplitter` per split boundary, wired to `resizeSplit`;, `src/dashboard/DockLayoutAdapter.mjs:163` is already the source of truth for projecting split boundaries; no model or adapter feature is missing. | 4 |
| 15167 | 2026-07-14 | consumer-direct:now | app-engine | bug, design, ai, testing, neo-gpt-emmy, `.workstation-tour-play` and `.workstation-theme-button`: **48px** tall;, `apps/workstation/view/Workspace.mjs:292` creates one `Neo.toolbar.Base` with two `Neo.button.Base` actions around a flexed `Neo.container.Base` story. | 2 |
| 15163 | 2026-07-14 | consumer-enabling | ci-test-infra | bug, ai, testing, regression, core, neo-gpt-emmy, Review depth floor: https://github.com/neomjs/neo/pull/15143#pullrequestreview-4691001708 | 4 |
| 15146 | 2026-07-14 | internal-only | portal-internal | enhancement, ai, refactoring, testing, architecture, neo-gpt-emmy, `DemoCWorkspace.mjs` composes generic Neo dashboard, state, grid, DockService, DockZoneModel, and TourRunner authorities., every class and DOM selector is named `AgentOS.childapps.dockdemo.*` / `.agentos-dockdemo-*`;, Canonical standalone browse | 22 |
| 15143 | 2026-07-14 | consumer-enabling | ci-test-infra | bug, ai, testing, regression, core, neo-gpt-emmy, three independent live runs sampled 979–997 `requestAnimationFrame` frames with zero active-header/empty-body intervals and zero page errors;, stage A burns several frames waiting for a detach that must not happen;, `src/main/addon/DockFlip.mjs#captureFirst/play` owns presentation-only First/Last/Invert/Play motion. | 3 |
| 15140 | 2026-07-14 | consumer-direct:now | app-engine | enhancement, ai, testing, neo-gpt-emmy, `beat` before every step, intentionally serving captions and data-only runtime cues;, `src/ai/client/TourRunner.mjs#run` fires `beat` before dispatch, then appends one deterministic log entry only after each runner-owned step has completed., `sceneId`, `sceneIndex`, `stepIndex`, and `stepType`; | 3 |
| 15142 | 2026-07-14 | consumer-enabling | skill-machinery | documentation, enhancement, ai, model-experience, neo-gpt-emmy, change kind duplicates the PR title, ticket labels, and prose;, `.github/PULL_REQUEST_TEMPLATE.md:16-37` owns the optional external-contributor checklist and remains unchanged. | 1 |
| 15133 | 2026-07-14 | consumer-direct:now | app-engine | enhancement, design, ai, neo-gpt-emmy, '[x] 15098 Tab-native overflow: Neo.tab.plugin.Overflow owns the hidden-tab projection', **Home**: `apps/agentos/childapps/dockdemo/view/` — `DemoCWorkspace.mjs` beside `DemoAWorkspace.mjs`/`DemoBWorkspace.mjs` (sibling-pattern lift; structural-pre-flight fast-path). | 20 |
| 15138 | 2026-07-14 | consumer-enabling | skill-machinery | documentation, enhancement, ai, model-experience, neo-gpt, **Saved-tool-result path:** when an MCP result exceeds the token cap, the harness writes it to a `tool-results/*.txt` file (JSON `{result: string}`) and returns the path plus a subagent suggestion. The sanctioned Neo response is per-file extraction on the saved file (`jq`/python + `Read` + `grep`), NOT a subagent. | 1 |
| 15134 | 2026-07-13 | consumer-enabling | ci-test-infra | bug, ai, testing, architecture, neo-gpt, '[x] 12047 initServerConfigs: preserve operator edits when materializing stale server config imports', '[x] 10384 Revalidate full-suite Neo.setupClass contamination after test isolation lands', CI: fresh `npm install` runs `prepare`, which copies templates to `config.mjs` files → tests see template-default values., **78 import-style references** across the test suite (the broader 118-line count includes path-strings in comments/strings). | 117 |
| 15131 | 2026-07-13 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, model-experience, neo-gpt, '[x] 14435 Temporal-pyramid L3–L5 dynamic synthesis path (weekly/monthly/quarterly)', Epic #12679 — accepted Leaf-D comments `IC_kwDODSospM8AAAABIezvDw` and `IC_kwDODSospM8AAAABIe0zJA`., `list_pull_requests` returns a bounded metadata list. It does not read review/comment reasoning or synthesize a window. | 11 |
| 15129 | 2026-07-13 | consumer-enabling | ci-test-infra | enhancement, developer-experience, ai, architecture, build, model-experience, neo-gpt-emmy, ignored `ai/config.mjs` / MCP config overlays; | 9 |
| 15128 | 2026-07-13 | consumer-enabling | ci-test-infra | bug, documentation, ai, testing, architecture, neo-gpt | 17 |
| 15127 | 2026-07-13 | consumer-enabling | ci-test-infra | enhancement, ai, testing, performance, neo-gpt-emmy, per-session memory count;, `ai/services/memory-core/SessionService.mjs#findSessionsToSummarize` owns the candidate calculation. | 2 |
| 15123 | 2026-07-13 | consumer-enabling | skill-machinery | enhancement, ai, testing, model-experience, neo-gpt, <code>#10897</code> added the unit + integration CI matrix., **.agents/skills/pr-review/refe | 4 |
| 15121 | 2026-07-13 | consumer-enabling | ci-test-infra | bug, ai, testing, architecture, neo-gpt-emmy, '[x] 15106 Persist the winning assignee for broadcast A2A Tasks', ai/graph/storage/SQLite.mjs owns GraphLog schema and generic node invalidation triggers. | 16 |
| 15120 | 2026-07-12 | consumer-enabling | ci-test-infra | enhancement, help wanted, good first issue, contributor-experience, ai, testing, Bortlesboat, Runtime source: `src/util/Json.mjs` | 1 |
| 15119 | 2026-07-12 | consumer-enabling | ci-test-infra | enhancement, help wanted, good first issue, contributor-experience, ai, testing, Bortlesboat, Runtime source: `src/util/String.mjs` | 1 |
| 15096 | 2026-07-13 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-ada, '[ ] 15088 Add runtime Bird View for resolved PR conversations', **§2.2:** L3 (weekly) / L4 (monthly) / L5 (quarterly) are computed on demand over L2 aggregates + `query_recent_turns` (chronological) + `query_raw_memories` (semantic). **No durable output above L2** — nothing this leaf produces is written back as summary-of-summary. (The Gemini-family objection incorporated as the Cycle-3 shape; liveness carry in ADR §8.) | 25 |
| 15102 | 2026-07-13 | consumer-direct:now | app-engine | enhancement, developer-experience, ai, needs-re-triage, neo-opus-ada | 8 |
| 15071 | 2026-07-13 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-vega, Walk substrate: `ai/services/memory-core/GraphService.mjs` edge queries (the graduation's Matrix-1/B falsifier: metadata cannot walk; edges can). | 18 |
| 15108 | 2026-07-13 | consumer-direct:now | app-engine | enhancement, ai, architecture, neo-opus-grace, '[ ] 15099 Dense-workstation showcase: the ~20-tab big-screen scene, themed + toured', **Subsystem-owned plugin directories are the established convention**: `src/grid/plugin/`, `src/grid/header/plugin/`, `src/table/plugin/`, `src/list/plugin/`, `src/calendar/view/ | 8 |
| 15094 | 2026-07-13 | consumer-direct:now | app-engine | enhancement, developer-experience, ai, neo-opus-vega, '[x] 15115 FM cockpit keyboard operability: listitem cards + native drill Button', Token-level contrast audit: every ink-tier × surface-tier pair in #14578 measured against WCAG AA for its usage class (body text vs meta text vs disabled) — results recorded IN the token reference doc (deltas = recorded design decisions with Grace's design authority in the loop)., *Superseded: "Focus-or | 12 |
| 15109 | 2026-07-13 | consumer-direct:now | app-engine | enhancement, ai, neo-opus-grace, '[x] 15083 Parentless post-app-mount initVnode(true) auto-mount loses its round-trip reply' | 2 |
| 15111 | 2026-07-13 | consumer-enabling | ci-test-infra | bug, ai, testing, architecture, security, neo-gpt-emmy, '[ ] 15114 Give Task transitions durable GraphLog event identity', `addMessage()` treats the Task payload as caller-authored opaque JSON apart from state validation, so a caller-supplied `task.assignee` is not trustworthy. | 10 |
| 15107 | 2026-07-13 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-fable-clio, Operation substrate: the #14625 tools (`execute_dock_operation` returning post-op documents; `get_dock_topology` for assertions) — the runner composes THEM, never touches the dock model directly (no parallel mutation path, the standing guardrail). | 2 |
| 15103 | 2026-07-12 | internal-only | docs-internal | documentation, enhancement, ai, architecture, model-experience, neo-gpt, the canonical Golden Path route is currently rendered to `sandman_handoff.md`, and `AgentOrchestrator.parseGoldenPath()` reparses that Markdown;, `ai/services/graph/GoldenPathSynthesizer.mjs` writes `sandman_handoff.md`; | 3 |
| 15093 | 2026-07-12 | consumer-enabling | ci-test-infra | bug, ai, neo-opus-ada, *title* | 3 |
| 15091 | 2026-07-12 | consumer-enabling | ci-test-infra | bug, ai, regression, architecture, model-experience, neo-opus-ada, `ai/services/graph/GoldenPathSynthesizer.mjs:776-805` owns the cap | 6 |
| 15086 | 2026-07-12 | consumer-direct:now | app-engine | bug, ai, core, neo-gpt, '[ ] 14771 Tab overflow affordance: hidden-tab projection on heavy tabs nodes', `Neo.manager.VDomUpdate` models component-tree relationships via par | 2 |
| 15084 | 2026-07-12 | consumer-direct:future-direct | fleet-tooling | bug, ai, neo-gpt, `start()` calls `resolveExecutable(command, env.PATH, opts.cwd)` only as a truthiness check and discards the returned absolute path., production resolver: `resolveExecutable('h', 'bin', childCwd) -> <childCwd>/bin/h`;, Owning substrate: `ai/services/fleet/FleetLifecycleService.mjs`; the Agent OS structure map places the existing Fleet process supervisor and its executable discovery in `ai/services/fleet/`. | 2 |
| 15080 | 2026-07-12 | consumer-direct:now | agent-cloud | enhancement, ai, architecture, neo-opus-ada, The orchestrator composes the source once at start (`Orchestrator.initBootIdentitySource()`) with the genuine process-boot time + the REM-consolidation cadence, and WRITES its advisory fact each `poll()` (`recordBootIdentityFact`) to a shared runtime-state file. | 14 |
| 15063 | 2026-07-12 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, neo-opus-vega, '[ ] 14610 FM cockpit pop-out: agent detail to its own OS window on the shared heap', Composes the card contract (#14605 fields at expanded grain) + #14593/#14594 primitives; namespace per #14577. | 14 |
| 15078 | 2026-07-12 | consumer-direct:now | app-engine | enhancement, ai, neo-gpt, it animates initial construction with no motion-signal producer; | 7 |
| 15077 | 2026-07-12 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-ada, '[x] 15068 Computed GP guard-filter route-attribution telemetry — the live record-seam (AC1+AC2)', '[x] 15076 Computed GP type-gate rejection record-seam — the AC3 evidence-window producer', `computedGoldenPathRouting.mjs` already exposes the exclusion vocabulary for exactly this — `getComputedRecommendationExclusionLabels()` is documented as "so diagnostic ledgers can report the exact rejection bucket." The consumer (a live ledger) is what's missing. | 5 |
| 15075 | 2026-07-12 | consumer-enabling | ci-test-infra | bug, developer-experience, ai, neo-gpt, `NEO_FLEET_BRIDGE_TOKEN`, `ai/services/fleet/FleetLifecycleService.mjs`: `start()` is the sole owner of the minimal child env, reserved token/identity/projection injection, and tracked process lifecycle. | 2 |
| 15067 | 2026-07-12 | internal-only | docs-internal | bug, ai, testing, neo-opus-grace, `src/dashboard/DockTabSortZone.mjs:1` — `import DragCoordinator` (module-scope) | 7 |
| 15073 | 2026-07-12 | consumer-enabling | ci-test-infra | bug, developer-experience, ai, build, model-experience, neo-opus-ada | 5 |
| 15060 | 2026-07-12 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-ada, **AC1** — a live JSONL record-seam exists (writes per synthesis run from the orchestrator daemon, `routeAttributionLedgerStore`; never a git-tracked `measurements/*.md`)., The **#14503 42.2% type-gate disposition**: this record-seam captures the *routing-contradiction guard's* filtering, NOT the *actionability type-gate's* rejections (a different filter point). AC3 needs the actual type-gate rejections recorded at that filter (a separate producer) plus an accumulated window before the keep/narrow/rank-with-discount disposition can be decided. #15057 remains the open contract for it., Parent: #15057 (record-seam ticket — stays open for AC3) · #14503 (type-gate disposition) · #14609 / #14472 (GP-v2) · PR #15060 (delivers this leaf)., 2026-07-12T04:06:12Z @neo-opus-ada assigned to @neo-opus-ada | 6 |
| 15069 | 2026-07-12 | consumer-enabling | ci-test-infra | enhancement, developer-experience, ai, architecture, model-experience, neo-gpt-emmy, '[x] 15054 Disambiguate parallel Codex Desktop wake delivery', `CODEX_ELECTRON_USER_DATA_PATH` alone is **not** the native profile selector. A direct launch with only that env fell back to the existing browser session; adding `--user-data-dir=<electron-profile>` produced a distinct resident process and profile tree. | 14 |
| 15070 | 2026-07-12 | consumer-enabling | ci-test-infra | bug, ai, testing, neo-gpt, `DockMotionNL.spec.mjs`: stable-marker sampler contract and four motion witnesses. | 1 |
| 15055 | 2026-07-12 | consumer-enabling | ci-test-infra | enhancement, ai, testing, neo-opus-vega, '[x] 14606 FM cockpit ActivityStream component: bounded, real-time, backpressure-aware', Whitebox-e2e house pattern: NL Playwright fixture inside the running app; custom named config, never default `npx playwright test`; e2e lives outside CI, `NEO_TEST_SKIP_CI` owns exclusion (no hardcoded skips). | 1 |
| 15058 | 2026-07-12 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-ada, Behavior 2 (guard-filter route-attribution ledger) → #15057., Parent: #14609 (GP-v2 guard follow-ups) · #14472 (GP-v2 epic) · #15057 (behavior 2) · PR #15058 (delivers this leaf)., 2026-07-12T03:49:39Z @neo-opus-ada assigned to @neo-opus-ada | 6 |
| 15064 | 2026-07-12 | consumer-enabling | ci-test-infra | bug, ai, testing, regression, architecture, model-experience, neo-gpt, '[ ] 15047 Add isolated Codex Desktop launch coverage to Fleet', the default resident is an arg-less `/Applications/ChatGPT.app/Contents/MacOS/ChatGPT` process; | 8 |
| 15061 | 2026-07-12 | consumer-enabling | ci-test-infra | bug, documentation, developer-experience, ai, regression, architecture, model-experience, neo-gpt-emmy, `.gemini/settings.template.json` contains MCP server definitions and names `GEMINI.md`;, The `.gemini/` directory itself remains valid for Antigravity concepts/artifacts; only the workspace settings template is retired. | 20 |
| 15059 | 2026-07-12 | internal-only | docs-internal | bug, ai, neo-opus-grace, 2026-07-12T01:44:18Z @neo-opus-grace assigned to @neo-opus-grace | 1 |
| 15051 | 2026-07-12 | consumer-enabling | skill-machinery | bug, developer-experience, ai, regression, architecture, performance, model-experience, neo-gpt, **Local mode:** one resident checkout; review exact heads by fetching and switching or detaching in place, then restore the prior branch. | 2 |
| 15046 | 2026-07-11 | consumer-enabling | ci-test-infra | bug, developer-experience, ai, model-experience, neo-gpt, `.codex/hooks.json` registers `.codex/hooks/codex-context.mjs` for every trusted repo-root `UserPromptSubmit`., `GitHub username: neo-gpt`, Resident identity is runtime-bound by `NEO_AGENT_IDENTITY` and mapped through canonical `identityRoots`; it is not owned by shared prompt prose. | 2 |
| 15044 | 2026-07-11 | internal-only | docs-internal | documentation, enhancement, ai, refactoring, architecture, neo-opus-vega | 9 |
| 15042 | 2026-07-11 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-gpt, `ai/graph/identityRoots.mjs` is the committed AgentIdentity roster and Memory Core boot-time seed source. | 12 |
| 15039 | 2026-07-11 | consumer-enabling | ci-test-infra | ai, refactoring, core, neo-opus-grace, '[ ] 15034 Singleton re-init seam for specs → test-tranche ready() migration, bespoke guard deletion, repo-wide lint', **Instantiation-path check per site**: `ready()` only exists for `construct()`-ed instances. `Neo.create`/singleton-import paths are safe; injected-factory seams (e.g. `AgentOrchestrator.agentFactory` — test doubles must expose `ready()`) get verified individually., **Rejection-path classification per service** (the error-visibility delta): an external `await initAsync()` inside try/catch OBSERVES a rejection; `ready()` hangs forever when the construct-fired init rejects (`isReady` never flips). For each service whose `initAsync` can reject without an internal catch, either adopt the `GraphService` catch-and-degrade precedent (`GraphService.mjs` IIFE: internal catch → degraded mode → init resolves) or keep an explicit error surface. `ai/scripts/lifecycle/*` exit-code consumers are the first check., Remove the now-pointless `if (!X._initPromise)` production reach-ins in the same pass (`SystemLifecycleService`, `DreamService.mjs:242`) — the trailing `await X.ready()` lines alre | 35 |
| 15040 | 2026-07-11 | consumer-enabling | ci-test-infra | enhancement, ai, refactoring, architecture, neo-gpt, #10259 is closed and migrated two hard-coded identity aliases plus fixture nodes; it does not own a data-driven sweep of the direct-identity spellings now tolerated by #15032., SQLite can retain direct identity aliases on `SENT_BY`, `SENT_TO`, `DELIVERED_TO`, and permission-edge endpoints., `ai/graph/normalizeAgentIdentityNodeId.mjs` owns canon | 5 |
| 15030 | 2026-07-11 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, neo-opus-vega, '[x] 14594 FM cockpit event-kind chip system (pr / a2a / review / alert classes)', '[ ] 14607 FM cockpit stream burst e2e: bound holds live under real feed pressure', Composes #14594 EventChips + #14578 tokens under the #14577-gated namespace. | 4 |
| 15029 | 2026-07-11 | consumer-direct:now | app-engine | enhancement, developer-experience, ai, neo-opus-vega, '[x] 14593 FM cockpit state-dot, pulse and health primitives (reduced-motion honored)', '[ ] 14614 FM cockpit connect and add-agent entry: operable-cold onboarding surface', '[x] 14611 FM cockpit per-agent control cluster: start / stop / restart with honest round-trip states', '[x] 14599 FM cockpit fleet grid + health summary bar (density-informed layout)', Composes #14593 primitives (StateDot/FamilyRail/HealthSwatch) + #14578 tokens; namespace per the #14577 gate. | 12 |
| 15016 | 2026-07-11 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-ada, '[ ] 14811 Direction-velocity writer: land directionBreakdown on L1/L2 via the single deterministic lane + the F3 cost guard', ADR 0028 requires both durable L1 session and L2 daily records; the branch proves the L2 engine but not the complete L1/L2 runtime path., ADR 0028 §2.1/§2.3/§2.4/§2.6 fixes durable L1/L2, one `temporal-summary` collection, named metric sources, deterministic `SUMMARY_DAILY` writes, and unified plus per-agent partitions. | 22 |
| 15032 | 2026-07-11 | consumer-enabling | ci-test-infra | enhancement, ai, refactoring, architecture, model-experience, neo-gpt | 21 |
| 15026 | 2026-07-11 | consumer-direct:now | app-engine | enhancement, ai, architecture, performance, neo-gpt | 2 |
| 15022 | 2026-07-11 | consumer-direct:now | app-engine | enhancement, developer-experience, ai, neo-fable, '[x] 14611 FM cockpit per-agent control cluster: start / stop / restart with honest round-trip states', Composes #14611's per-verb round-trip machine at roster scale; consumes the same Lane-C lifecycle seam (#14563) + roster DTO (#14571); benched/guest members render excluded-with-reason, never silently skipped. | 9 |
| 15025 | 2026-07-11 | consumer-enabling | ci-test-infra | bug, ai, testing, neo-gpt, The pure aggregation helper already has the correct ownership boundary: callers inject the requested `windowBounds`; it reads no clock. | 2 |
| 15019 | 2026-07-11 | consumer-direct:now | app-engine | enhancement, ai, architecture, neo-opus-grace, 2026-07-04T03:36:56Z @neo-fable-clio assigned to @neo-fable-clio | 13 |
| 15017 | 2026-07-11 | consumer-direct:now | app-engine | enhancement, ai, architecture, neo-fable, '[x] 14866 Dock dockPreview.v1 producer + unit test (compute half)', '[x] 14857 Dock cross-zone tab drag: functional tab-into model move (hit-test → moveItem)', '[x] 14670 CrossWindowDragTarget: the receiving-window contract implementation', '[x] 14768 transferItem executor operation: atomic cross-document item transfer' | 4 |
| 15024 | 2026-07-11 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, neo-gpt, captures every perspective with `DockZoneModel.createSavedLayout()` (window scope);, ADR 0029 §2.2 is authoritative: topology capture is explicit; changed-topology restore validates before mutation, restores worker-owned truth, does not auto-spawn windows, and reports applied/recovered remainder., `DockZoneModel.captureTopologyPerspective()`;, `DockTopologyReconciler.reconcile()`;, `DockZoneModel.transferItem()` for honest two-document ownership;, `DockPerspectiveStore` for persisted named records. | 5 |
| 15021 | 2026-07-11 | internal-only | docs-internal | documentation, enhancement, ai, architecture, neo-opus-grace | 2 |
| 15023 | 2026-07-11 | consumer-enabling | ci-test-infra | enhancement, developer-experience, ai, neo-opus-vega, '[ ] 14598 FM cockpit AgentCard component — the resident card at the artifact bar', Composes T2.7 AgentCards; consumes #14571 roster DTO + #14595 runtime-status for the counts; namespace per #14577. | 1 |
| 15013 | 2026-07-11 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-grace, '[x] 15014 Serving-cost meter: deterministic endpoint-owner sampling and provenance report' | 4 |
| 15018 | 2026-07-11 | consumer-enabling | ci-test-infra | bug, ai, regression, neo-fable-clio | 3 |
| 15002 | 2026-07-11 | consumer-direct:future-direct | fleet-tooling | enhancement, ai, build, neo-opus-vega, `harness/brain.mjs` already carries the s | 12 |
| 15007 | 2026-07-11 | consumer-enabling | ci-test-infra | enhancement, ai, testing, neo-opus-grace, '[x] 15015 Visual harness substrate + scope-floor-v1 goldens (delivered leaf of the baseline harness program)', Playwright screenshot assertions inside the existing custom-config discipline (a named visual config; `NEO_TEST_SKIP_CI` governs any CI exclusion; baselines committed)., 2026-07-04T02:39:32Z @neo-opus-vega added the `enhancement` label | 7 |
| 15012 | 2026-07-11 | consumer-enabling | ci-test-infra | bug, ai, testing, neo-fable-clio, `fixtures.mjs:535` — `getConsoleLogs(type, filter)` calls `NeuralLink_RuntimeService.getConsoleLogs(...)` → **TypeError**. | 1 |
| 15010 | 2026-07-11 | consumer-direct:future-direct | fleet-tooling | bug, ai, neo-fable-clio, `apps/agentos/childapps/dockdemo/view/DemoAWorkspace.mjs:255` — `onDockZoneDocumentChange()` stores the committed document immediately (document truth is always fresh) but defers `refreshDockWorkspace()` one tick (`me.timeout(0)`), the normative guard so a committing interaction surface is never destroyed mid-handler. | 1 |
| 15004 | 2026-07-11 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, neo-opus-grace, **Honestly gated:** blocked-by #14423 (perspective semantics unsettled until its spec lands) — same gating shape as its showcase twin (#14590). Filing now records the cockpit-consumer requirements INTO that spec's convergence window: the cockpit needs (a) preset capture of the full cockpit document, (b) restore-with-animation, (c) fail-closed cross-topology behavior rendered honestly. | 4 |
| 15006 | 2026-07-11 | consumer-enabling | ci-test-infra | bug, ai, neo-gpt, failed create leaves `agent: null`, `credential: ORPHAN_SECRET`;, Cross-file writes cannot be truly atomic without a journal/transactional store; a failed rollback must have an explicit recovery invariant. | 3 |
| 14997 | 2026-07-11 | consumer-enabling | ci-test-infra | bug, ai, neo-fable, **31 processes** hold the memory-core graph sqlite (8 codex-chained, 19 claude-desktop-chained, 3 orchestrator, 1 unknown) — ALL on `/Users/Shared/github/neomjs/neo/.neo-ai-data/sqlite/memory-core-graph.sqlite{,-wal,-shm}`. | 2 |
| 14998 | 2026-07-11 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-gpt, The Brain-side fleet registry/launch contract is the authority for durable harness keys and launch semantics; the Body catalog is a projected display vocabulary, not a second whitelist. | 17 |
| 14999 | 2026-07-11 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, neo-fable-clio, '[x] 15003 Demo B: consume topology capture/reconciliation and render restore remainder', **Spec-gated by design:** perspective semantics (capture scope, cross-topology restore, fail-closed behavior) and cross-window drag are §2/§3 of the #14423 design spec — unsettled until it lands. This ticket is `blocked_by` #14423 and consumes its contracts; filing now records the operator-seeded shape so the demo starts the day the spec merges. | 6 |
| 14996 | 2026-07-11 | consumer-direct:now | app-engine | enhancement, developer-experience, ai, neo-opus-grace, '[x] 14657 FM module cockpit dock document: the default layout as dockZone.v1 data', 2026-07-04T03:44:21Z @neo-opus-vega cross-referenced by #14615 | 5 |
| 14995 | 2026-07-11 | consumer-direct:future-direct | fleet-tooling | bug, ai, testing, neo-gpt, resolve the entry to an absolute path under the selected repo root; | 3 |
| 14976 | 2026-07-11 | consumer-direct:now | agent-cloud | enhancement, ai, neo-opus-vega | 9 |
| 14986 | 2026-07-11 | consumer-enabling | ci-test-infra | bug, ai, testing, neo-fable-clio | 1 |
| 14991 | 2026-07-11 | consumer-direct:now | app-engine | enhancement, developer-experience, ai, architecture, neo-fable, Cockpit pickers/cards derive all 5 families from the shared seam with no launchable/auth-mode distinction., Registry projections (and/or the roster assembler rows) carry derived, non-secret launch facts per agent/family: `launchable: Boolean` + `authMode: 'marker'|'in-app'|null` — derived Brain-side from the launch seam, never hand-maintained. | 4 |
| 14982 | 2026-07-11 | consumer-direct:now | app-engine | enhancement, ai, neo-opus-grace, 2026-07-04T03:50:08Z @neo-fable-clio added the `enhancement` label | 2 |
| 14990 | 2026-07-10 | consumer-direct:now | app-engine | bug, ai, testing, core, neo-gpt, top/bottom `split-before|split-after` candidates can claim `horizontal`;, `src/dashboard/dockPreviewContract.mjs` owns structural validation for `neo.harness.dockCandidates.v1`. | 2 |
| 14981 | 2026-07-10 | consumer-enabling | ci-test-infra | enhancement, ai, neo-opus-grace | 3 |
| 14979 | 2026-07-10 | consumer-direct:now | app-engine | bug, ai, neo-opus-ada | 10 |
| 14977 | 2026-07-10 | consumer-enabling | ci-test-infra | enhancement, developer-experience, ai, architecture, neo-fable | 6 |
| 14974 | 2026-07-10 | consumer-direct:now | app-engine | enhancement, ai, neo-fable-clio, **Producer extension** (`src/dashboard/DockPreviewProducer.mjs`): expose the full valid-candidate set for the hovered area (the per-pointer-position single affordance derives from it today) — presentation-tier surface change; the reducer contract and `previewToOperation` stay untouched. **Gated on PR `#14933` (open)**, which owns the producer file in flight. | 11 |
| 14975 | 2026-07-10 | consumer-direct:now | app-engine | bug, ai, neo-gpt, five live reveal/dismiss cycles produced 10/10 expected DOM class mutations;, Raise only the semantic hidden selector to `.neo-dashboard-dock-reveal-overlay.neo-dashboard-dock-reveal-overlay-hidden`, making the visibility contract independent of stylesheet order. | 3 |
| 14971 | 2026-07-10 | consumer-direct:now | app-engine | bug, ai, neo-fable-clio, `examples/dashboard/dock` projects ordinary containers through `DockLayoutAdapter`. | 4 |
| 14966 | 2026-07-10 | consumer-direct:now | app-engine | enhancement, ai, neo-gpt, neo-opus-grace, committed splitter resize recreates the projected flex nodes, so a transition on the replacements has no prior DOM identity; the merged FLIP consumer owns that structural jump; | 3 |
| 14965 | 2026-07-10 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-gpt, neo-fable, The merged roster entry is seeded into the graph by `GraphService.initAsync` on Memory Core boot. | 4 |
| 14960 | 2026-07-10 | consumer-direct:now | app-engine | enhancement, design, ai, neo-gpt, neo-opus-vega | 17 |
| 14944 | 2026-07-10 | consumer-direct:now | app-engine | enhancement, ai, architecture, neo-gpt, neo-fable-clio, The sanctioned mutation path is ADR 0029 §2.1's reducer-container pattern: interaction surfaces emit descriptors; the reducer commits; the view-sync re-projects. Animation must ride the **view-sync seam** (`onDockZoneDocumentChange` → re-projection) as a **presentation-only** layer — document truth never waits on motion. | 5 |
| 14963 | 2026-07-10 | consumer-direct:future-direct | fleet-tooling | enhancement, ai, neo-gpt, neo-opus-vega | 10 |
| 14955 | 2026-07-10 | consumer-direct:now | app-engine | enhancement, ai, neo-gpt, neo-fable-clio, The full loop is live in `examples/dashboard/dock`: pointer drag → `DockPreviewProducer.produce()` → `DockPreview` affordance render → `previewToOperation()` → reducer commit (`MainContainer.mjs:546-556`). Grace's gesture layer (`#14851`/`#14864`/`#14906`) made drags real; `#14913` (claimed) is fixing the cross-zone drop regression. | 5 |
| 14941 | 2026-07-10 | consumer-direct:now | agent-cloud | epic, ai, refactoring, architecture, neo-fable, '[x] 12457 Author ADR 0019 (AiConfig SSOT) + the turn-loaded AGENTS.md read-gate', '[x] 12435 aiConfig Provider singleton mutated without restore across ~11 test setups — add snapshot/restore isolation', '[x] 12438 Audit importable Memory Core path fallbacks against AiConfig', '[x] 12452 Rename Neo.ai.BaseConfig → ConfigProvider (name it as the Neo.state.Provider it is; keep AiConfig)', '[x] 12451 config.template leaves must be declarative — relocate UNIT_TEST_MODE branching out of the SSOT (+ lint guard)', '[x] 12461 Eliminate B3 defensive reads of the AiConfig SSOT in production source', '[x] 12464 analyzeNlTelemetry: read AiConfig.storagePaths.graph directly (drop redundant env-fallback)', '[x] 12568 Remove existing-leaf B3 fallbacks in AI services', '[x] 12613 Route lifecycle wake knobs through AiConfig', '[x] 13939 Strengthen ADR-19 trigger and lint AiConfig aliases', '[x] 14500 ADR-0019 lint: fail-build on defensive optional-chaining (B3) + env-helper reintroduction (A5) on AiConfig', '[x] 14953 Route KB config consumers without breaking standalone migrations', '[x] 14956 Route shared MCP transport host through AiConfig', '[x] 14957 Route orchestrator data paths through AiConfig use-site reads', '[x] 11976 Tests import config.mjs (operator-overlay) instead of config.template.mjs (canonical defaults) — drift risk across ~78 imports', '[x] 15213 Extend the AiConfig antipattern lint to A1 module-level env re-derivation', '[x] 15227 Swap test imports of the config.mjs overlay to config.template.mjs — the ADR-0019 C3 mechanical class', '[x] 15235 Mark AiConfigModel.md non-authoritative with the ADR-0019 pointer — the OQ1 residual sliver' | 9 |
| 14952 | 2026-07-10 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, neo-gpt | 12 |
| 14947 | 2026-07-10 | consumer-direct:now | app-engine | enhancement, ai, neo-opus-grace | 3 |
| 14935 | 2026-07-10 | consumer-enabling | ci-test-infra | epic, ai, refactoring, architecture, neo-fable, '[x] 12457 Author ADR 0019 (AiConfig SSOT) + the turn-loaded AGENTS.md read-gate', '[x] 12435 aiConfig Provider singleton mutated without restore across ~11 test setups — add snapshot/restore isolation', '[x] 12438 Audit importable Memory Core path fallbacks against AiConfig', '[x] 12452 Rename Neo.ai.BaseConfig → ConfigProvider (name it as the Neo.state.Provider it is; keep AiConfig)', '[x] 12451 config.template leaves must be declarative — relocate UNIT_TEST_MODE branching out of the SSOT (+ lint guard)', '[x] 12461 Eliminate B3 defensive reads of the AiConfig SSOT in production source', '[x] 12464 analyzeNlTelemetry: read AiConfig.storagePaths.graph directly (drop redundant env-fallback)', '[x] 12568 Remove existing-leaf B3 fallbacks in AI services', '[x] 12613 Route lifecycle wake knobs through AiConfig', '[x] 13939 Strengthen ADR-19 trigger and lint AiConfig aliases', '[x] 14500 ADR-0019 lint: fail-build on defensive optional-chaining (B3) + env-helper reintroduction (A5) on AiConfig', '[x] 14953 Route KB config consumers without breaking standalone migrations', '[x] 14956 Route shared MCP transport host through AiConfig', '[x] 14957 Route orchestrator data paths through AiConfig use-site reads', '[x] 11976 Tests import config.mjs (operator-overlay) instead of config.template.mjs (canonical defaults) — drift risk across ~78 imports', '[x] 15213 Extend the AiConfig antipattern lint to A1 module-level env re-derivation', '[x] 15227 Swap test imports of the config.mjs overlay to config.template.mjs — the ADR-0019 C3 mechanical class', '[x] 15235 Mark AiConfigModel.md non-authoritative with the ADR-0019 pointer — the OQ1 residual sliver' | 5 |
| 14936 | 2026-07-10 | consumer-enabling | skill-machinery | enhancement, ai, architecture, neo-opus-grace, ADR 0029 §4 is the authority tier that downstream trees/tickets inherit; its row grain is therefore load-bearing — a coarse row propagates as a settled fact (empirically: it did, three times). | 2 |
| 14958 | 2026-07-10 | consumer-direct:now | app-engine | enhancement, developer-experience, ai, neo-fable | 3 |
| 14946 | 2026-07-10 | consumer-enabling | ci-test-infra | bug, ai, neo-fable | 5 |
| 14933 | 2026-07-10 | consumer-direct:now | app-engine | bug, ai, testing, regression, neo-opus-grace | 5 |
| 14942 | 2026-07-10 | consumer-enabling | ci-test-infra | epic, ai, refactoring, architecture, neo-fable, '[x] 12457 Author ADR 0019 (AiConfig SSOT) + the turn-loaded AGENTS.md read-gate', '[x] 12435 aiConfig Provider singleton mutated without restore across ~11 test setups — add snapshot/restore isolation', '[x] 12438 Audit importable Memory Core path fallbacks against AiConfig', '[x] 12452 Rename Neo.ai.BaseConfig → ConfigProvider (name it as the Neo.state.Provider it is; keep AiConfig)', '[x] 12451 config.template leaves must be declarative — relocate UNIT_TEST_MODE branching out of the SSOT (+ lint guard)', '[x] 12461 Eliminate B3 defensive reads of the AiConfig SSOT in production source', '[x] 12464 analyzeNlTelemetry: read AiConfig.storagePaths.graph directly (drop redundant env-fallback)', '[x] 12568 Remove existing-leaf B3 fallbacks in AI services', '[x] 12613 Route lifecycle wake knobs through AiConfig', '[x] 13939 Strengthen ADR-19 trigger and lint AiConfig aliases', '[x] 14500 ADR-0019 lint: fail-build on defensive optional-chaining (B3) + env-helper reintroduction (A5) on AiConfig', '[x] 14953 Route KB config consumers without breaking standalone migrations', '[x] 14956 Route shared MCP transport host through AiConfig', '[x] 14957 Route orchestrator data paths through AiConfig use-site reads', '[x] 11976 Tests import config.mjs (operator-overlay) instead of config.template.mjs (canonical defaults) — drift risk across ~78 imports', '[x] 15213 Extend the AiConfig antipattern lint to A1 module-level env re-derivation', '[x] 15227 Swap test imports of the config.mjs overlay to config.template.mjs — the ADR-0019 C3 mechanical class', '[x] 15235 Mark AiConfigModel.md non-authoritative with the ADR-0019 pointer — the OQ1 residual sliver' | 4 |
| 14950 | 2026-07-10 | consumer-enabling | ci-test-infra | enhancement, ai, neo-fable, Emission targets as above; the generator itself is side-effect-bounded: it creates a branch, writes the five-surface diff, and emits a PR-body draft (evidence lines prefilled). It NEVER pushes to `dev`/`main` and never auto-merges. | 2 |
| 14940 | 2026-07-10 | consumer-enabling | ci-test-infra | enhancement, ai, testing, neo-opus-grace, The whitebox-e2e skill + NL Playwright fixture are the house pattern (CRITICAL inherited rule: custom playwright configs only — never default `npx playwright test`). | 1 |
| 14932 | 2026-07-10 | consumer-direct:now | app-engine | bug, core, neo-opus-vega, Specs (`test/playwright/unit/core/` canonical placement): (a) `on(obj)` leaves `obj` deep-equal to its input (incl. `scope`/`once`/`delay`/`order` keys); (b) `un(obj)` likewise; (c) the regression that matters — the SHARED-object `on`/`un` round-trip above actually unbinds (fire after un → handler not called). | 2 |
| 14948 | 2026-07-10 | consumer-direct:now | app-engine | bug, ai, core, neo-gpt, `provider.getStore(key)` retains the destroyed old instance., `src/state/Provider.mjs` owns Store instances created from its `stores` descriptors and exposes them by provider key. | 2 |
| 14918 | 2026-07-10 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-fable, `ai/services/fleet/FleetLifecycleService.mjs` — `start()` builds the child env from a fresh copy of `process.env`, injects the PAT under `credentialEnvVar`, the minted bridge token under `bridgeTokenEnvVar`, and the forced-projection var; an env-key contract guard (~line 147) requires the three reserved keys to be non-empty and pairwise distinct. `resolveLaunch()` (~line 305) requires `metadata.launch`. The file's own header (~line 50) names "spawn-time identity-env + wake-subscription provisioning" as deferred work — this ticket ships the launch-env half of that seam (identity provisioning is the sibling ticket). | 10 |
| 14925 | 2026-07-10 | consumer-direct:now | app-engine | enhancement, ai, architecture, neo-opus-grace, 2026-07-04T03:49:51Z @neo-fable-clio added the `enhancement` label | 4 |
| 14912 | 2026-07-10 | consumer-direct:now | app-engine | enhancement, ai, architecture, neo-fable-clio, Operation substrate: the #14625 tools (`execute_dock_operation` returning post-op documents; `get_dock_topology` for assertions) — the runner composes THEM, never touches the dock model directly (no parallel mutation path, the standing guardrail). | 17 |
| 14920 | 2026-07-10 | consumer-direct:now | app-engine | enhancement, ai, refactoring, architecture, `apps/agentos/store/AgentDefinitions.mjs` — `singleton: true`; consumed via direct module-import by `FleetSettingsPanel` (reads) and `Accounts` (writes)., `src/state/Provider.mjs` natively hosts stores: `stores_` config (`:148-164`), `'stores.<key>'` binding resolution (`resolveStore`, `:441`), and `getStore(key)` walking the provider hierarchy (`:562-566`). A provider at a view root IS the sharing scope — "if used inside a state provider, we get it anyway." | 16 |
| 14924 | 2026-07-10 | internal-only | docs-internal | enhancement, ai, architecture, neo-opus-vega | 10 |
| 14897 | 2026-07-10 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-ada, '[ ] 14811 Direction-velocity writer: land directionBreakdown on L1/L2 via the single deterministic lane + the F3 cost guard', '[x] 14568 Per-direction {v,s,r} composition on the temporal pyramid', **§2.1:** the aggregation lane reuses the **landed** `#12676` pattern — `MaintenanceBackpressureService` heavy-maintenance lane + supervised-child scheduled task + most-recent-first bounded batches — scheduled under ADR 0022 fairness (must not starve REM/defrag siblings). | 8 |
| 14923 | 2026-07-10 | consumer-enabling | ci-test-infra | bug, ai, neo-opus-grace | 6 |
| 14922 | 2026-07-10 | consumer-enabling | ci-test-infra | bug, ai, testing, neo-fable, Neo's single-thread custom Playwright layout: specs in one worker process share module state; `test/playwright/setup.mjs` boots a Neo app context per file via `setup({neoConfig, appConfig})`. | 2 |
| 14906 | 2026-07-10 | consumer-enabling | ci-test-infra | enhancement, developer-experience, ai, neo-opus-grace, 2026 | 16 |
| 14910 | 2026-07-10 | consumer-direct:now | app-engine | enhancement, ai, architecture, neo-opus-vega | 11 |
| 14905 | 2026-07-10 | consumer-direct:future-direct | fleet-tooling | enhancement, ai, refactoring, testing, architecture, neo-opus-vega, `apps/agentos/store/AgentDefinitions.mjs` — a `Neo.data.Store` **singleton** of `AgentOS.model.AgentDefinition` records: the roster data layer., `apps/agentos/view/fleet/FleetCockpit.mjs:14` — `FIXTURE_ROSTER`, a hardcoded plain-ar | 29 |
| 14904 | 2026-07-10 | internal-only | docs-internal | documentation, enhancement, ai, neo-fable, **File:** `learn/benefits/Introduction.md` (stays at this path/route; no rename). | 1 |
| 14902 | 2026-07-10 | consumer-enabling | ci-test-infra | bug, documentation, javascript, ai, model-experience, neo-gpt, `ai/graph/identityRoots.mjs` is the canonical graph identity root consumed by `GraphService.initAsync` boot seeding and `ai/scripts/setup/seedAgentIdentities.mjs` recovery. | 5 |
| 14892 | 2026-07-06 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, neo-opus-vega, '[ ] 14598 FM cockpit AgentCard component — the resident card at the artifact bar', '[ ] 14612 FM cockpit fleet-level morning start: one action, staged bring-up, honest partial results', Binds Lane-C's control round-trip contract (#14563 — "cockpit start/stop/restart → the lifecycle service → settle-or-reject") and the #14537 wake-toggle verb when it lands (its slot reserved in the cluster). | 10 |
| 14898 | 2026-07-06 | consumer-direct:now | app-engine | enhancement, ai, testing, neo-opus-grace, '[x] 14866 Dock dockPreview.v1 producer + unit test (compute half)', `src/dashboard/CrossWindowDragTarget.mjs` exposes the `previewFor` / `hitTest` owner seams the producer instance plugs into (the adapter supplies `zones: [{nodeId, rect, orientation}]` from the rendered `dockSplitOrientation`)., Wire a `DockPreviewProducer` instance into `CrossWindowDragTarget.previewFor` / `hitTest` (adapter supplies zone rects). | 6 |
| 14894 | 2026-07-06 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, architecture, neo-gpt, `apps/agentos/view/FleetSettingsPanel.mjs` has the older keeper-view `runLifecycleAction()` path calling `globalThis.AgentOS.fleet.registryBridge.<verb>(agentId)` and reflecting state through `AgentDefinitions`., #14611 owns the B4 UI/control-cluster rendering: verb buttons, pending/rejected/unauthorized/timeout presentation, and unit/NL proof of the rendered state machine. | 2 |
| 14893 | 2026-07-06 | consumer-enabling | ci-test-infra | enhancement, ai, 2026-07-04T10:06:39Z @neo-fable added the `enhancement` label | 2 |
| 14895 | 2026-07-06 | consumer-enabling | skill-machinery | enhancement, ai, model-experience, neo-opus-grace, **PR #14692**: author committed fixes after the RC but posted no discharge declaration and requested no re-review — the queue read it as ignored., The wake-delivery half (#14576 owns RC-must-wake tiering). | 1 |
| 14888 | 2026-07-06 | consumer-enabling | ci-test-infra | bug, ai, architecture, neo-opus-ada, `ai/services/graph/GoldenPathSynthesizer.mjs:1091` — `handoffContent += this.constructor.renderConceptSliceHandoffSection({...})` appends the Concept Slice into the handoff string., **Capture** the Concept Slice at `:1091` into a local (`const conceptSliceSection = …`) instead of appending it to `handoffContent`. | 3 |
| 14891 | 2026-07-06 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, neo-opus-grace, '[ ] 14658 FM module cockpit projection wiring: adapter render + resize commit loop', 2026-07-04T03:44:21Z @neo-opus-vega cross-referenced by #14615 | 2 |
| 14890 | 2026-07-06 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-ada, '[x] 14879 Computed GP frontier-empty fallback hardcodes an unmeasured cause' | 3 |
| 14880 | 2026-07-06 | consumer-direct:now | app-engine | enhancement, ai, architecture, neo-opus-grace, '[ ] 14886 Wire dockPreview.v1 producer into live drag: hover-affordance render + drop-routing e2e', '[ ] 14769 Dock workspace cross-window participation: source hooks + target wiring' | 2 |
| 14887 | 2026-07-06 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, neo-gpt, #14614 owns the broad connect/add-agent onboarding surface., PAT values are submitted only through the injected Fleet Registry bridge. | 2 |
| 14882 | 2026-07-06 | consumer-enabling | ci-test-infra | bug, ai, architecture, neo-opus-ada, '[ ] 14883 GP fallback: plumb REM pipeline state for precise frontier-cause attribution', `get_rem_pipeline_state`: `undigested: 7`, `digested: 1483`, last 5 cycles `completed`. REM was **healthy**, not starved (the #14717 starvation-breaker merged 07-04 and is holding)., `ai/services/graph/goldenPathPickupBridge.mjs:116` — `renderDeclaredIntentFallback` hardcodes: `` `> The semantic frontier is empty (REM-starved / cold-start). Ranking ...` ``. The function receives only `rankedItems` + `limit`; it has **no cause signal** to render. | 3 |
| 14881 | 2026-07-06 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, neo-gpt, '[x] 14631 FM module topology record: childapp vs view-region inside apps/agentos', Consumes #14631's decisions verbatim (mount shape · integration point · route class)., 2026-07-04T03:3 | 3 |
| 14874 | 2026-07-06 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-gpt | 4 |
| 14878 | 2026-07-06 | internal-only | docs-internal | enhancement, ai, model-experience, neo-opus-grace | 5 |
| 14873 | 2026-07-05 | consumer-enabling | ci-test-infra | enhancement, ai, refactoring, architecture, neo-gpt, `README.md:93` and `learn/agentos/decisions/0020-agent-harness-concept.md:1` define the Agent Harness as the downloadable Electron-shelled Agent OS operating surface., Agent Harness: runtime owner, fleet cockpit, Electron shell, wake/lifecycle/fleet substrate., `ai/graph/hindcastHarness.mjs` -> `ai/graph/directionHindcastReplay.mjs` | 2 |
| 14871 | 2026-07-05 | consumer-direct:now | app-engine | enhancement, ai, neo-opus-grace, '[x] 14650 Dock topology diff tool: structured before/after compare for tours and e2e', '[x] 14652 Perspective capture: single-window scope over the live dock document', '[x] 14651 Perspective persistence: revision migration + capture-scope fields on dockLayout.v1' | 2 |
| 14870 | 2026-07-05 | consumer-enabling | ci-test-infra | bug, ai, testing, regression, grid, neo-gpt, `test/playwright/e2e/grid/RowPinning.spec.mjs:278`: expected `blankFrames` to be `0`, received `185` in `Scroll Telemetry: Visual Blanking and Jitter Detector`., 2026-07-05T15:34:40Z @neo-gpt added the `bug` label | 2 |
| 14869 | 2026-07-05 | consumer-direct:future-direct | fleet-tooling | neo-opus-vega, 2026-07-05T20:31:44Z @neo-opus-vega assigned to @neo-opus-vega | 4 |
| 14872 | 2026-07-05 | consumer-enabling | ci-test-infra | bug, ai, testing, regression, grid, neo-gpt, `test/playwright/e2e/grid/BigDataMultiBodyNL.spec.mjs:63`: `TypeError: app.getInstanceProperties is not a function` while asserting `body.selectionModel.selectedRows`. | 2 |
| 14867 | 2026-07-05 | consumer-direct:now | app-engine | bug, ai, testing, regression, grid, neo-gpt, `test/playwright/e2e/grid/TreeBigData.spec.mjs:90`: `Bulk Expand All / Collapse All and mixed interactions (BUG REPRODUCTION)` timed out waiting for `.neo-tree-toggle` to have `/is-expanded/`; received `neo-tree-toggle is-collapsed`., `test/playwright/e2e/grid/Tree.spec.mjs` expand/collapse, sorting, and deep-state interactions. | 4 |
| 14864 | 2026-07-05 | consumer-direct:now | app-engine | enhancement, ai, architecture, neo-opus-grace, '[ ] 14769 Dock workspace cross-window participation: source hooks + target wiring' | 4 |
| 14865 | 2026-07-05 | consumer-enabling | ci-test-infra | bug, ai, testing, regression, neo-gpt, `test/playwright/e2e/rendering/LivePreviewMultiWindow.spec.mjs:84`: `Popout LivePreview from Learn Route (FormsEngine)`., Same three Learn-route / Learn-sequence variants failed., Same three Learn-route / Learn-sequence variants failed., `Popout LivePreview from Home Route (Helix)` passed in Dev, Dist Dev, and Dist Prod. | 1 |
| 14863 | 2026-07-05 | consumer-direct:now | app-engine | enhancement, developer-experience, ai, neo-opus-vega, '[x] 14594 FM cockpit event-kind chip system (pr / a2a / review / alert classes)', '[ ] 14607 FM cockpit stream burst e2e: bound holds live under real feed pressure', Composes #14594 EventChips + #14578 tokens under the #14577-gated namespace. | 4 |
| 14861 | 2026-07-05 | internal-only | docs-internal | documentation, enhancement, ai, neo-gpt | 1 |
| 14859 | 2026-07-05 | consumer-enabling | ci-test-infra | bug, developer-experience, ai, testing, regression, neo-gpt, `FleetCockpitLifecycleNL.spec.mjs` can bind via raw `waitForSession('agentos')`, which is app-name lookup rather than current-page identity lookup. | 3 |
| 14847 | 2026-07-05 | consumer-direct:now | app-engine | enhancement, developer-experience, ai, architecture, neo-opus-vega | 25 |
| 14851 | 2026-07-05 | consumer-direct:now | app-engine | enhancement, ai, testing, architecture, neo-opus-grace, Owner tier: `src/dashboard/DockLayoutAdapter.mjs#projectTabsNode` (the projection SSOT the example re-projects from). | 2 |
| 14849 | 2026-07-05 | consumer-enabling | ci-test-infra | enhancement, ai, refactoring, testing, neo-gpt, 37 spec files live directly under `test/playwright/e2e/` on fresh `origin/dev`. | 42 |
| 14843 | 2026-07-05 | internal-only | docs-internal | documentation, enhancement, ai, neo-gpt | 1 |
| 14839 | 2026-07-05 | consumer-enabling | ci-test-infra | bug, ai, testing, neo-gpt, `NeuralLinkCreateGrid.spec.mjs` passed., `apps/colors/childapps/widget/view/Viewport.mjs` declares `id: 'colors-widget-viewport'`. | 1 |
| 14838 | 2026-07-05 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-gpt, V-B-A (this session): all Claude-family peer instances are RUNNING (separate `~/.claude-instances/<identity>` user-data-dirs), but no wake-daemon process exists → subscriptions are inert; ~200 unread A2A items accumulated in one mailbox in one evening., **Per-subscription filters exist and are stored per route:** `ai/daemons/wake/queries.mjs:185` (route identity includes `filters` in its idempotency contract) and `:217` (`filters: props.filters || {}`); the `manage_wake_subscription` schema exposes `filters.priority` (`high|normal|low`), `senderFilter`, `taggedConcepts`, `inReplyToFilter`, and `harnessTargetMetadata.coalesceWindow` (0–300s). | 6 |
| 14836 | 2026-07-05 | consumer-enabling | ci-test-infra | enhancement, ai, neo-gpt, `src/ai/TransactionService.mjs` — per-writer `(agentId, sessionId)`-keyed in-heap stacks; lifecycle `open → committed → undone` with redo re-entry; every op is a `{forward, reverse}` pair of **data-only JSON tool-descriptors**, and `cloneOp` THROWS on a smuggled function/class reference — the Neural Link wire boundary is the format guarantee. Ops carry `originWriter` provenance + `label`; named transactions exist. | 16 |
| 14835 | 2026-07-05 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-grace, '[x] 14768 transferItem executor operation: atomic cross-document item transfer' | 5 |
| 14834 | 2026-07-05 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, `apps/agentos/view/fleet/FleetGrid.mjs` — pure `rankFleet` (deterministic online → idle → benched tiering + fold threshold) + the grid (composes AgentCards; 3-col below threshold, idle collapses to an honest count at 12+; a **stable header** so the health counts animate rather than flash)., Live wire binding for counts (#14595). | 4 |
| 14832 | 2026-07-05 | consumer-direct:now | app-engine | enhancement, ai, architecture, neo-opus-grace, '[ ] 14770 Grouped drag executor operations: moveNode + transferNode', '[ ] 14769 Dock workspace cross-window participation: source hooks + target wiring' | 2 |
| 14827 | 2026-07-05 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, neo-opus-vega, '[x] 14594 FM cockpit event-kind chip system (pr / a2a / review / alert classes)', '[ ] 14607 FM cockpit stream burst e2e: bound holds live under real feed pressure', Composes #14594 EventChips + #14578 tokens under the #14577-gated namespace. | 3 |
| 14824 | 2026-07-05 | consumer-direct:now | app-engine | enhancement, ai, testing, neo-gpt, '[ ] 14653 Perspective restore into unchanged topology: the happy-path round-trip', 2026-07-04T03:37:06Z @neo-fable-clio assigned to @neo-fable-clio | 11 |
| 14823 | 2026-07-05 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-gpt, `.claude/hooks/laneStateStopHook.mjs` (28KB) — the `NEO_LANE_STATE_ENFORCE` stop-hook. A grep confirms it contains no `gh pr view` / `reviewDecision` / `mergedAt` / PR-state cross-check: it validates the lane-state block's *shape*, not its *truth*. | 9 |
| 14825 | 2026-07-05 | consumer-direct:now | mcp-runtime | bug, ai, neo-gpt, **02:08:0xZ** — `manage_issue_comment` (create on #14580) rejected with the drift error; the SAME payload posted fine via shell `gh` seconds later (shell token authed as neo-opus-vega, 4992/5000 rate remaining — verified). | 2 |
| 14818 | 2026-07-05 | consumer-enabling | ci-test-infra | enhancement, ai, testing, neo-gpt, `ai/mcp/server/neural-link/openapi.yaml` registers `get_dock_topology` and `execute_dock_operation`. | 4 |
| 14822 | 2026-07-05 | consumer-enabling | ci-test-infra | enhancement, ai, neo-gpt, 2026-07-04T03:51:52Z @neo-fable-clio added the `enhancement` label | 4 |
| 14817 | 2026-07-05 | internal-only | docs-internal | enhancement, ai, architecture, neo-gpt, '[x] 14815 Keeper external create_component parity proof', '[x] 14816 Neural Link dock verbs join SDK and whitebox fixture' | 5 |
| 14814 | 2026-07-05 | consumer-direct:now | mcp-runtime | bug, ai, testing, build, neo-gpt, PR #14796 head `272c0a053fba3be31729057ade094114a846953a`., Live latest-open sweep: checked latest 20 open issues at `2026-07-04T14:41:34Z`; no equivalent `workspaceSafety` / orchestrator-startup-log timeout issue found., `NEO_AI_D | 4 |
| 14828 | 2026-07-05 | consumer-direct:future-direct | fleet-tooling | enhancement, ai, refactoring, neo-fable, `apps/agentos/view/create/CreateSurface.mjs`, `CreateSurfaceController.mjs`, `CreationStateProvider.mjs` | 40 |
| 14796 | 2026-07-05 | consumer-enabling | ci-test-infra | enhancement, developer-experience, ai, neo-gpt, **Option A (lint):** before `manage_pr_review` sends, validate the composed body against the required canonical anchor set; on a missing/mis-collapsed anchor, fail locally naming the exact anchor — a fast local loop instead of an API round-trip. | 6 |
| 14754 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, testing, neo-opus-ada | 6 |
| 14810 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | neo-opus-vega, Every agentos button carries `agent-button` (+ a variant: `agent-submit-button` / `agent-connect-button` / `agent-lifecycle-button` / `agent-theme-button`) — **no rule exists**, so the default neo-button blue theme wins everywhere., 2026-07-04T15:16:26Z @neo-opus-vega assigned to @neo-opus-vega | 2 |
| 14792 | 2026-07-04 | consumer-direct:now | agent-cloud | enhancement, ai, architecture, neo-opus-ada, '[x] 14758 ADR-0026 amendment: control-plane/ ÷ diagnostics/ R3 seam + daemon-core restart-actuator endpoint', **ADR-0026** `DeploymentRuntimeAccessService.apply(serviceKey, action)` — the controller-blind actuator seam; `restart` only under the `lifecycle-write` envelope, allowlisted service keys, `NEO_ORCHESTRATOR_RUNTIME_ACCESS_*` gates. | 2 |
| 14791 | 2026-07-04 | consumer-enabling | ci-test-infra | ai, architecture, model-experience, neo-opus-grace | 2 |
| 14801 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | neo-opus-vega | 2 |
| 14787 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-ada, The SSOT now exists: `conceptSpineCanonicalization.mjs` exports `canonicalizeConceptId` / `normalizeConceptKey`; the `#14528` pattern is import-and-delegate (see the probe's `conceptClusterKey` rewire — one-line body). | 3 |
| 14776 | 2026-07-04 | consumer-enabling | skill-machinery | documentation, enhancement, architecture, neo-opus-grace | 2 |
| 14795 | 2026-07-04 | internal-only | docs-internal | enhancement, ai, neo-fable, 2026-07-04T14:18:54Z @neo-fable assigned to @neo-fable | 1 |
| 14740 | 2026-07-04 | internal-only | docs-internal | documentation, ai, neo-opus-grace | 1 |
| 14751 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-fable, For each live resident in `identityRoots.mjs`: construct its `IdentityState` anchor + seed `EmbodiedEpisode` era(s) through the schema builders. Residents with a REAL era history (the June→July family swaps) get their actual multi-era chains — the reflexive-landing fixture's shape, on production data. | 3 |
| 14785 | 2026-07-04 | consumer-direct:now | app-engine | neo-opus-vega | 2 |
| 14756 | 2026-07-04 | consumer-enabling | skill-machinery | enhancement, ai, neo-fable | 3 |
| 14778 | 2026-07-04 | consumer-direct:now | app-engine | neo-opus-vega, **Storage ✓** — `FleetManager.setAvatar({id, avatarUrl})` persists `metadata.avatarUrl` on the agent's registry definition (`ai/services/fleet/FleetManager.mjs:257`)., 2026-07-04T13:34:19Z @neo-opus-vega assigned to @neo-opus-vega | 2 |
| 14775 | 2026-07-04 | consumer-direct:now | app-engine | enhancement, ai, neo-opus-ada, `getBootIdentity` returns the advisory `{bootAt, sourceRef, schedulerResumeState, lastCycleRef}` fact (shipped by #14490 AC-1). | 4 |
| 14761 | 2026-07-04 | internal-only | docs-internal | enhancement, ai, architecture, neo-opus-ada, '[ ] 14760 Leaf-2: control-plane/ daemon-core restart actuator — off-bridge, ADR-0026-gated', **ADR-0026** — the controller-blind actuator (`apply(serviceKey, action)`) + `DeploymentRuntimeAccessService` L0 envelopes (`read-observe` / `lifecycle-write`, allowlisted service keys, `NEO_ORCHESTRATOR_RUNTIME_ACCESS_*` gates) — is Option D's spine. | 1 |
| 14774 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | 2026-07-04T13:22:05Z @neo-opus-vega cross-referenced by PR #14774 | 3 |
| 14757 | 2026-07-04 | consumer-direct:now | app-engine | enhancement, ai, architecture, neo-fable-clio, '[ ] 14769 Dock workspace cross-window participation: source hooks + target wiring', 2026-07-04T03:50:22Z @neo-fable-clio added the `enhancement` label | 2 |
| 14739 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, neo-fable, **Closed/opened issues in-window** — a bounded `gh issue list --search` pair (closed:>= / created:>=), same day-granularity pattern as `fetchRecentMergedPRs`. | 2 |
| 14730 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, model-experience, neo-fable, **Hydration = a regenerable index** computed *over* the ordered `EmbodiedEpisode` trail — the head era + a projection of the anchor + social layer. It is a **view**, not a source of truth., Leaf, one-PR-deliverable (`Resolves` this); parent epic #14677 (`Refs`). Depends on #14693 (node-types). | 2 |
| 14727 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | enhancement, ai, neo-fable, A view (Container + Controller per house pattern) whose five render branches bind `data.flowState` from `CreationStateProvider` — one branch per SSOT state (`empty · composing · generating · materialized · error`), matching the drawn bar exactly (the empty invitation single-affordance, the blueprint preview, the cancellable progress, the live-panel + promote affordance, the always-a-reason error with edit-and-retry). | 3 |
| 14747 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | epic, neo-opus-vega, 2026-07-04T12:02:14Z @neo-opus-vega assigned to @neo-opus-vega | 4 |
| 14746 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | epic, neo-opus-vega, 2026-07-04T12:02:14Z @neo-opus-vega assigned to @neo-opus-vega | 1 |
| 14732 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-ada, '[x] 14636 Convergence render-ledger: human-facing, provisional, notAuthority', A runnable demo (an `example/` app or a demo harness) that: seeds a goal-lattice + N futures → runs convergence compute (generator-firewalled) → renders the terrain ledger → shows the top cross-future-invariant sub-goals + risk nodes. | 2 |
| 14733 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-fable-clio, **§2.3:** one `temporal-summary` collection carrying `{level, partition, windowStart, windowEnd, version}` metadata — **inside the `unified` store** (ADR 0017 within-posture: collections + metadata are the separation mechanism; no new persist dir, no second daemon). Per-level SQLite graph labels (`SUMMARY_DAILY`, `SUMMARY_WEEKLY`, …) reserved for the deterministic aggregation lane — never written via `SemanticGraphExtractor` prompt widening (anti-anchor). | 14 |
| 14729 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, model-experience, neo-fable, **`IdentityState`** — the **never-renamed operational anchor** (the stable handle a resident is always addressable by) + an **opt-in social layer** (display name, salute, the disclosable prior). The anchor is immutable; everything mutable lives in eras., Leaf, one-PR-deliverable (`Resolves` this); parent epic #14677 (`Refs`, never a close-target). | 2 |
| 14725 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-ada, '[x] 14634 Convergence-snapshot compute: firewalled, independence-budget', '[ ] 14648 Convergence-GP demo: end-to-end terrain over a real goal-lattice (lane falsifier)', **Consumer:** humans (a maintainer reading the terrain of which sub-goals are cross-future-invariant). NOT agents., Render the convergence snapshot as a **human-facing ledger**, provisional-labeled. | 2 |
| 14737 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | bug, ai, architecture, neo-opus-vega, `kindToken` / `kindLabel` — `apps/agentos/view/fleet/kindRegistry.mjs` (from #14701), 2026-07-04T09:27:36Z @neo-opus-vega assigned to @neo-opus-vega | 2 |
| 14726 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, neo-opus-vega, 2026-07-04T03:30:13Z @neo-opus-vega added the `enhancement` label | 5 |
| 14722 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, neo-opus-vega, 2026-07-04T03:30:06Z @neo-opus-vega added the `enhancement` label | 3 |
| 14717 | 2026-07-04 | consumer-direct:now | agent-cloud | bug, ai, architecture, neo-opus-ada, **Scheduler (fix site):** `ai/daemons/orchestrator/scheduling/dream.mjs` `getDueTask` — the deferral / `rem-backlog-catchup` decision + `remBacklogCatchupCooldownMs`. | 5 |
| 14716 | 2026-07-04 | consumer-enabling | skill-machinery | enhancement, ai, architecture, neo-fable | 4 |
| 14692 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | documentation, enhancement, ai, neo-opus-grace | 1 |
| 14742 | 2026-07-04 | internal-only | docs-internal | neo-opus-vega, 2026-07-04T10:11:10Z @neo-opus-vega assigned to @neo-opus-vega | 1 |
| 14744 | 2026-07-04 | consumer-enabling | ci-test-infra | neo-opus-vega, Pin `capturedAt` to the spec's fixed `NOW` so the render is deterministic (remove the `new Date()` dependency — the root lesson)., 2026-07-04T10:30:54Z @neo-opus-vega assigned to @neo-opus-ve | 1 |
| 14719 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | enhancement, ai, neo-fable, `data`: `{flowState: 'empty', flowReason: null, activeInstanceId: null}` — the five SSOT states live HERE; views bind, never re-derive. | 2 |
| 14712 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | enhancement, ai, neo-fable | 2 |
| 14709 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, neo-fable, **Assembler:** for a selected grain's window, read L1/L2 durable records + graduation/PR/session facts (ADR 0028 tiers; no NEW aggregation — consume what the pyramid computes, render ≠ memory per ADR 0031 invariant 2) into the `{filterSets, computedAt, counts, topEvents}` shape #14603's module defines. `windowSemantics.filterSets` (ADR 0033 amendment) supplies the declared filter sets the render requires. | 4 |
| 14705 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, testing, neo-gpt, the cockpit control invokes the bridge method generated from `FLEET_WIRE_METHODS`;, `learn/agentos/NeuralLink.md` defines Neural Link as the live App-Worker possession bridge and verification surface. | 1 |
| 14627 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | documentation, enhancement, developer-experience, ai, neo-opus-vega, The contract is a **document leaf** (design-system tier), placed per the #14577 namespace gate (candidate: a `design/` sibling of the SSOT artifact). | 1 |
| 14698 | 2026-07-04 | consumer-direct:now | app-engine | enhancement, ai, 2026-07-04T03:49:39Z @neo-fable-clio added the `enhancement` label | 2 |
| 14686 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-ada, neo-fable-clio, `GoldenPathSynthesizer` ranks `2×semantic + 1×structural` against the frontier; both axes fail tonight for opposite reasons (empty anchor; zero weight). | 4 |
| 14710 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | enhancement, ai | 2 |
| 14707 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, '[x] 14633 Convergence snapshot: canonical-id schema + firewalled render-target', '[ ] 14636 Convergence render-ledger: human-facing, provisional, notAuthority', **Owning folder:** `ai/services/graph/` — sibling to `GoldenPathSynthesizer.mjs` (same compute layer). Consumes Leaf 1's (#14633) canonical-id convergence-snapshot schema; produces the snapshot instances Leaf 3 renders. | 4 |
| 14704 | 2026-07-04 | consumer-direct:now | app-engine | enhancement, ai, architecture, neo-gpt, `src/ai/fleet/fleetCockpitStatus.mjs` defines the Body-side DTO and bounded event classes. | 3 |
| 14703 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, build, model-experience, neo-gpt, keep the PR body honest with `Refs` only and carry a red PR-body lint check while the PR remains draft; | 4 |
| 14697 | 2026-07-04 | consumer-direct:now | app-engine | enhancement, ai, neo-fable-clio, '[x] 14651 Perspective persistence: revision migration + capture-scope fields on dockLayout.v1', '[ ] 14653 Perspective restore into unchanged topology: the happy-path round-trip', 2026-07-04T03:37:51Z @neo-fable-clio assigned to @neo-fable-clio | 2 |
| 14696 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | enhancement, ai, architecture, model-experience, neo-opus-vega, **Two views over one object set** — peer-view (constellation + COP) and self-view (boot re-inhabitation); both render the same object-permanent selves. | 2 |
| 14695 | 2026-07-04 | consumer-direct:now | app-engine | enhancement, ai, architecture, neo-fable-clio, '[ ] 14653 Perspective restore into unchanged topology: the happy-path round-trip', '[ ] 14652 Perspective capture: single-window scope over the live dock document' | 2 |
| 14694 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, neo-fable, **Substrate:** ADR 0028's L1/L2 durable tiers + L3–L5 on-demand synthesis are the data plane; `windowSemantics.filterSets` (ADR 0033 amendment) gives digests the same declared-filter honesty as velocity numbers. No new aggregation — this leaf RENDERS what the pyramid computes (render ≠ memory, ADR 0031 invariant 2). | 2 |
| 14682 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | enhancement, ai, neo-fable | 3 |
| 14700 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, neo-opus-vega, '[x] 14578 FM cockpit theme/token layer from the cockpit-plan design SSOT', '[ ] 14598 FM cockpit AgentCard component — the resident card at the artifact bar', Neo functional/component primitives under the target namespace (#14577 gate decides placement); these are leaf components/mixins consuming #14578 tokens only — zero hand-rolled colors. | 4 |
| 14690 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | enhancement, developer-experience, ai, neo-fable-clio, House precedent + bar: `apps/agentos/design/fleet-manager-cockpit-plan.html` (self-contained HTML, inline CSS, mock-first sections: product direction → honest state → lanes). This artifact follows the same shape for the demo. | 1 |
| 14625 | 2026-07-04 | consumer-direct:now | app-engine | enhancement, ai, architecture, neo-fable-clio, The semantic-operation executor is SHIPPED: `src/dashboard/DockZoneModel.mjs` (v1 vocabulary incl. `resizeSplit`, `setItemAutoHidden`, split/tab adapters via `src/dashboard/DockLayoutAdapter.mjs`). Contract of record: `learn/agentos/HarnessDockZoneModel.md` (dockZone.v1). | 9 |
| 14679 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-ada, '[ ] 14634 Convergence-snapshot compute: firewalled, independence-budget', **Owning folder:** `ai/services/graph/` — sibling to `GoldenPathSynthesizer.mjs`, `computedGoldenPathRouting.mjs`, `goldenPathTimestamp.mjs` (the existing computed-GP substrate). Joins the established GP compute layer; no new folder. | 3 |
| 14678 | 2026-07-04 | consumer-direct:future-direct | fleet-tooling | enhancement, ai, neo-fable, 2026-07-04T03:43:32Z @neo-fable added the `enhancement` label | 3 |
| 14630 | 2026-07-04 | consumer-direct:now | app-engine | enhancement, ai, architecture, neo-gpt, `src/ai/fleet/fleetCockpitStatus.mjs` defines the Body-side DTO and bounded event factory. | 3 |
| 14629 | 2026-07-04 | internal-only | portal-internal | developer-experience, ai, refactoring, neo-opus-vega | 8 |
| 14626 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-fable, '[x] 14566 Direction-contract Decision Record (ADR-0028 amendment path)', '[ ] 14568 Per-direction {v,s,r} composition on the temporal pyramid', Dream pipeline services own the pass (`ai/services/` — sibling precedent per structure map; exact placement via `structural-pre-flight` at implementation). | 4 |
| 14604 | 2026-07-04 | internal-only | docs-internal | documentation, enhancement, ai, neo-opus-vega, `ROADMAP.md` (repo root) — replace the v13.1 section wholesale; prior-release history relocates to release notes (already exists); vision stays in `.github/VISION.md` (untouched — hold H stands). | 1 |
| 14596 | 2026-07-04 | consumer-enabling | ci-test-infra | bug, ai, neo-fable | 2 |
| 14621 | 2026-07-04 | consumer-enabling | ci-test-infra | bug, ai, neo-opus-ada, **Datum 1 — 2026-07-02 ~14:00Z** (session `c1784ce1`-adjacent, post-repo-update canary): plain `action: 'start'` → `MCP error -32602: Structured content does not match the tool's output schema: data/terminalState must be equal to one of the allowed values`. Logged in the team-plan turn as "infra canary datum 1; 2nd instance → consolidated ticket.", Tool registration + schemas: the Memory Core MCP server tool registry (`ai/mcp/server/memory-core/`), sibling to the tools shipped by #13499 (turn-presence writer substrate) / #13498 (who_is_online liveness projection) — both CLOSED; this is a post-ship regression or a schema/handler drift introduced with a later projection change (#14198 tier-projection touched memory-cor | 3 |
| 14622 | 2026-07-04 | internal-only | portal-internal | enhancement, developer-experience, ai, neo-opus-vega, '[ ] 14577 FM cockpit target-app decision: evolve apps/agentos vs fresh app', '[ ] 14594 FM cockpit event-kind chip system (pr / a2a / review / alert classes)', '[ ] 14593 FM cockpit state-dot, pulse and health primitives (reduced-motion honored)', Neo theming is SCSS-based (`resources/scss/` theme structure) with CSS custom properties as the runtime surface; app-scoped styling composes with engine themes. | 7 |
| 14602 | 2026-07-04 | consumer-direct:now | app-engine | enhancement, ai, architecture, neo-opus-ada, `Neo.ai.services.fleet.FleetLifecycleService#listRunning()` — the runtime truth (running processes); #13015 notes watchdog signals exist for idle/wedged., Add `FleetControlBridge#fleetRuntimeStatus()` → resolves `listRunning()` (+ available watchdog signals) → returns a cockpit-shaped, redacted `[{agentId, state, confidence, source}]` where `state ∈ {running, idle, wedged, stopped}` (+ `rate-limited` where the harness reports it). **Honest derivation:** `running`/`stopped` come from `listRunning` directly; `idle`/`wedged`/`rate-limited` come from the watchdog signals #13015 names — where a signal is absent, `confidence` lowers and the state degrades to `running`/`unknown`, **never invented** (the same not-faked-state discipline PR #14571 established). | 6 |
| 14585 | 2026-07-04 | internal-only | docs-internal | documentation, enhancement, ai, architecture, neo-fable, '[ ] 14567 Direction-attribution pass: EVOLUTION_GOAL anchors + motion mapping', `learn/agentos/decisions/0028-*.md` — §2.3 single deterministic aggregation lane (no second writer), §2.4 SUMMARY_* fields, §2.6 partitions. The `directionBreakdown` map + `windowSemantics` filter-set declaration extend §2.4; the single-lane invariant is untouched. | 4 |
| 14624 | 2026-07-04 | consumer-enabling | skill-machinery | enhancement, ai, neo-fable | 1 |
| 14597 | 2026-07-04 | internal-only | docs-internal | documentation, enhancement, ai, neo-opus-grace, **Post:** `learn/blog/<slug>.md` (proposed `the-salute` / `cross-family-consensus-blind-spot`). House conventions verified against the possession post: `# H1` tension-title + **bold thesis** + *italic byline* + linked receipts + Mermaid-only-where-informative + `---` italic footer. **No YAML front-matter.** | 2 |
| 14584 | 2026-07-04 | consumer-enabling | skill-machinery | documentation, enhancement, ai, neo-gpt, `.agents/skills/goal-scoping/references/goal-scoping-workflow.md` — §3 ("Each lane → an epic") is the insertion point; §5 ("Drive to the lane-GOAL") composes. | 2 |
| 14583 | 2026-07-04 | internal-only | docs-internal | documentation, ai, architecture, neo-opus-vega | 2 |
| 14571 | 2026-07-04 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-gpt, `FleetControlBridge.listAgents()` returns the redacted registry roster., `ai/services/fleet/FleetControlBridge.mjs` is the Body-reachable allowlist. It composes registry reads with lifecycle operations and preserves the no-secret boundary. | 3 |
| 14556 | 2026-07-03 | internal-only | docs-internal | — | 1 |
| 14554 | 2026-07-03 | internal-only | docs-internal | — | 1 |
| 14553 | 2026-07-03 | consumer-enabling | ci-test-infra | — | 5 |
| 14547 | 2026-07-03 | internal-only | docs-internal | — | 38 |
| 14550 | 2026-07-03 | internal-only | docs-internal | — | 1 |
| 14546 | 2026-07-03 | internal-only | docs-internal | — | 2 |
| 14544 | 2026-07-03 | internal-only | docs-internal | — | 9 |
| 14541 | 2026-07-03 | consumer-enabling | skill-machinery | — | 6 |
| 14533 | 2026-07-03 | consumer-direct:now | app-engine | — | 2 |
| 14539 | 2026-07-03 | consumer-direct:now | app-engine | — | 6 |
| 14536 | 2026-07-03 | consumer-direct:now | app-engine | — | 8 |
| 14543 | 2026-07-03 | consumer-direct:now | mcp-runtime | — | 2 |
| 14528 | 2026-07-03 | consumer-enabling | ci-test-infra | — | 8 |
| 14530 | 2026-07-03 | internal-only | docs-internal | — | 1 |
| 14532 | 2026-07-03 | consumer-enabling | ci-test-infra | — | 1 |
| 14527 | 2026-07-03 | consumer-enabling | ci-test-infra | — | 5 |
| 14524 | 2026-07-03 | consumer-direct:now | agent-cloud | — | 17 |
| 14522 | 2026-07-03 | consumer-enabling | ci-test-infra | — | 4 |
| 14520 | 2026-07-03 | consumer-enabling | ci-test-infra | — | 3 |
| 14518 | 2026-07-03 | consumer-enabling | ci-test-infra | — | 4 |
| 14516 | 2026-07-03 | consumer-enabling | ci-test-infra | — | 3 |
| 14510 | 2026-07-03 | consumer-direct:now | app-engine | — | 17 |
| 14499 | 2026-07-03 | consumer-direct:now | agent-cloud | — | 16 |
| 14494 | 2026-07-03 | consumer-enabling | skill-machinery | — | 3 |
| 14492 | 2026-07-03 | consumer-enabling | ci-test-infra | — | 9 |
| 14513 | 2026-07-02 | consumer-enabling | ci-test-infra | — | 4 |
| 14512 | 2026-07-02 | consumer-direct:future-direct | fleet-tooling | — | 1 |
| 14488 | 2026-07-02 | consumer-enabling | skill-machinery | — | 6 |
| 14498 | 2026-07-02 | consumer-enabling | ci-test-infra | — | 3 |
| 14497 | 2026-07-02 | consumer-enabling | ci-test-infra | — | 1 |
| 14495 | 2026-07-02 | internal-only | docs-internal | — | 1 |
| 14480 | 2026-07-02 | internal-only | docs-internal | — | 1 |
| 14470 | 2026-07-02 | internal-only | docs-internal | — | 10 |
| 14482 | 2026-07-02 | consumer-enabling | skill-machinery | — | 5 |
| 14487 | 2026-07-02 | consumer-enabling | ci-test-infra | — | 1 |
| 14471 | 2026-07-02 | consumer-enabling | ci-test-infra | — | 4 |
| 14468 | 2026-07-02 | consumer-enabling | skill-machinery | — | 1 |
| 14465 | 2026-07-02 | internal-only | docs-internal | — | 2 |
| 14463 | 2026-07-02 | consumer-enabling | ci-test-infra | — | 2 |
| 14464 | 2026-07-02 | internal-only | docs-internal | — | 3 |
| 14458 | 2026-07-02 | consumer-enabling | ci-test-infra | — | 6 |
| 14460 | 2026-07-02 | consumer-enabling | ci-test-infra | — | 2 |
| 14457 | 2026-07-02 | consumer-enabling | ci-test-infra | — | 4 |
| 14455 | 2026-07-02 | consumer-enabling | ci-test-infra | — | 10 |
| 14452 | 2026-07-02 | consumer-enabling | ci-test-infra | — | 2 |
| 14425 | 2026-07-02 | internal-only | docs-internal | — | 3 |
| 14395 | 2026-07-02 | internal-only | docs-internal | — | 1 |
| 14384 | 2026-07-02 | internal-only | docs-internal | — | 2 |
| 14443 | 2026-07-02 | consumer-enabling | ci-test-infra | — | 3 |
| 14437 | 2026-07-02 | consumer-enabling | ci-test-infra | — | 2 |
| 14432 | 2026-07-02 | consumer-enabling | skill-machinery | — | 3 |
| 14431 | 2026-07-02 | consumer-enabling | skill-machinery | — | 1 |
| 14428 | 2026-07-02 | internal-only | docs-internal | — | 1 |
| 14411 | 2026-07-02 | consumer-enabling | ci-test-infra | — | 2 |
| 14409 | 2026-07-02 | consumer-direct:now | mcp-runtime | — | 5 |
| 14407 | 2026-07-02 | consumer-enabling | ci-test-infra | — | 3 |
| 14390 | 2026-07-02 | consumer-enabling | ci-test-infra | — | 7 |
| 14417 | 2026-07-02 | consumer-enabling | skill-machinery | — | 1 |
| 14416 | 2026-07-02 | internal-only | docs-internal | — | 1 |
| 14413 | 2026-07-02 | consumer-enabling | ci-test-infra | — | 3 |
| 14405 | 2026-07-01 | consumer-enabling | ci-test-infra | — | 7 |
| 14403 | 2026-07-01 | consumer-direct:now | agent-cloud | — | 6 |
| 14401 | 2026-07-01 | consumer-enabling | ci-test-infra | — | 9 |
| 14399 | 2026-07-01 | consumer-direct:now | agent-cloud | — | 10 |
| 14398 | 2026-07-01 | consumer-enabling | ci-test-infra | — | 14 |
| 14394 | 2026-07-01 | internal-only | docs-internal | — | 1 |
| 14393 | 2026-07-01 | consumer-direct:now | app-engine | — | 3 |
| 14389 | 2026-07-01 | consumer-enabling | ci-test-infra | — | 7 |
| 14386 | 2026-07-01 | consumer-enabling | ci-test-infra | — | 37 |
| 14382 | 2026-06-30 | consumer-enabling | ci-test-infra | — | 2 |
| 14381 | 2026-06-30 | internal-only | docs-internal | — | 5 |
| 14383 | 2026-06-30 | internal-only | docs-internal | — | 2 |
| 14379 | 2026-06-30 | internal-only | docs-internal | — | 1 |
| 14377 | 2026-06-30 | internal-only | docs-internal | — | 5 |
| 14375 | 2026-06-30 | internal-only | docs-internal | — | 2 |
| 14374 | 2026-06-30 | internal-only | docs-internal | — | 3 |
| 14380 | 2026-06-30 | internal-only | docs-internal | — | 4 |
| 14376 | 2026-06-30 | internal-only | docs-internal | — | 3 |
| 14373 | 2026-06-30 | internal-only | docs-internal | — | 3 |
| 14372 | 2026-06-30 | internal-only | docs-internal | — | 3 |
| 14371 | 2026-06-30 | internal-only | docs-internal | — | 4 |
| 14369 | 2026-06-30 | internal-only | docs-internal | — | 3 |
| 14368 | 2026-06-30 | consumer-enabling | dream-nightshift | — | 1 |
| 14370 | 2026-06-30 | internal-only | docs-internal | — | 3 |
| 14367 | 2026-06-29 | internal-only | docs-internal | — | 1 |
| 14363 | 2026-06-29 | internal-only | docs-internal | — | 3 |
| 14362 | 2026-06-29 | consumer-enabling | skill-machinery | — | 1 |
| 14360 | 2026-06-29 | consumer-enabling | ci-test-infra | — | 2 |
| 14346 | 2026-06-29 | internal-only | docs-internal | — | 6 |
| 14365 | 2026-06-29 | internal-only | docs-internal | — | 3 |
| 14338 | 2026-06-29 | consumer-enabling | ci-test-infra | — | 2 |
| 14355 | 2026-06-29 | consumer-enabling | ci-test-infra | — | 3 |
| 14345 | 2026-06-29 | internal-only | docs-internal | — | 5 |
| 14341 | 2026-06-29 | internal-only | docs-internal | — | 1 |
| 14359 | 2026-06-29 | internal-only | docs-internal | — | 3 |
| 14351 | 2026-06-29 | internal-only | docs-internal | — | 1 |
| 14353 | 2026-06-29 | consumer-enabling | skill-machinery | — | 6 |
| 14299 | 2026-06-29 | consumer-enabling | ci-test-infra | — | 1 |
| 14344 | 2026-06-29 | internal-only | docs-internal | — | 2 |
| 14343 | 2026-06-29 | internal-only | docs-internal | — | 1 |
| 14334 | 2026-06-29 | internal-only | docs-internal | — | 1 |
| 14336 | 2026-06-29 | internal-only | docs-internal | — | 1 |
| 14301 | 2026-06-29 | consumer-direct:now | app-engine | — | 2 |
| 14309 | 2026-06-29 | consumer-enabling | ci-test-infra | — | 6 |
| 14303 | 2026-06-29 | consumer-enabling | skill-machinery | — | 6 |
| 14298 | 2026-06-29 | consumer-direct:now | agent-cloud | — | 5 |
| 14296 | 2026-06-28 | consumer-enabling | ci-test-infra | — | 4 |
| 14294 | 2026-06-28 | consumer-enabling | ci-test-infra | — | 6 |
| 14290 | 2026-06-28 | consumer-enabling | ci-test-infra | — | 2 |
| 14292 | 2026-06-28 | consumer-direct:now | agent-cloud | — | 4 |
| 14272 | 2026-06-28 | consumer-enabling | ci-test-infra | — | 12 |
| 14276 | 2026-06-28 | consumer-enabling | ci-test-infra | — | 7 |
| 14289 | 2026-06-28 | consumer-enabling | skill-machinery | — | 5 |
| 14282 | 2026-06-28 | consumer-enabling | ci-test-infra | — | 6 |
| 14286 | 2026-06-28 | consumer-enabling | ci-test-infra | — | 7 |
| 14285 | 2026-06-28 | consumer-enabling | ci-test-infra | — | 3 |
| 14288 | 2026-06-28 | consumer-enabling | ci-test-infra | — | 4 |
| 14280 | 2026-06-28 | consumer-enabling | ci-test-infra | — | 2 |
| 14278 | 2026-06-28 | consumer-enabling | ci-test-infra | — | 7 |
| 14273 | 2026-06-28 | consumer-enabling | ci-test-infra | — | 6 |
| 14275 | 2026-06-28 | consumer-enabling | ci-test-infra | — | 5 |
| 14274 | 2026-06-28 | consumer-direct:now | app-engine | — | 2 |
| 14266 | 2026-06-28 | consumer-direct:now | agent-cloud | — | 4 |
| 14271 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 8 |
| 14269 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 4 |
| 14270 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 1 |
| 14265 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 5 |
| 14268 | 2026-06-27 | consumer-enabling | skill-machinery | — | 7 |
| 14264 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 4 |
| 14262 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 5 |
| 14261 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 3 |
| 14258 | 2026-06-27 | consumer-direct:now | agent-cloud | — | 2 |
| 14252 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 3 |
| 14257 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 3 |
| 14255 | 2026-06-27 | consumer-direct:now | agent-cloud | — | 4 |
| 14229 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 9 |
| 14250 | 2026-06-27 | consumer-direct:now | agent-cloud | — | 10 |
| 14249 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 4 |
| 14248 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 2 |
| 14245 | 2026-06-27 | consumer-direct:now | agent-cloud | — | 2 |
| 14226 | 2026-06-27 | consumer-direct:now | agent-cloud | — | 3 |
| 14219 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 2 |
| 14213 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 3 |
| 14210 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 3 |
| 14240 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 6 |
| 14242 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 4 |
| 14237 | 2026-06-27 | consumer-enabling | skill-machinery | — | 1 |
| 14235 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 6 |
| 14241 | 2026-06-27 | consumer-enabling | skill-machinery | — | 1 |
| 14234 | 2026-06-27 | consumer-enabling | skill-machinery | — | 4 |
| 14227 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 3 |
| 14205 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 15 |
| 14207 | 2026-06-27 | consumer-enabling | skill-machinery | — | 1 |
| 14223 | 2026-06-27 | internal-only | docs-internal | — | 2 |
| 14221 | 2026-06-27 | consumer-enabling | skill-machinery | — | 3 |
| 14217 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 2 |
| 14214 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 2 |
| 14202 | 2026-06-27 | consumer-enabling | ci-test-infra | enhancement, ai, architecture, neo-opus-ada, '[x] 14203 composeTurnDocumentText pure helper — single-source the turn-document derivation (slice 1 of the #14193 de-dup)', '[x] 14206 #14193 slice-2: single-source the MemoryService turn-document build to composeTurnDocumentText', '[x] 14211 De-dup completeness: route DreamService + GoldenPathSynthesizer turn-document reads through resolveTurnDocumentForRead before slice-4 drops documents' | 2 |
| 14199 | 2026-06-27 | consumer-direct:now | mcp-runtime | — | 2 |
| 14216 | 2026-06-27 | consumer-direct:now | agent-cloud | — | 2 |
| 14200 | 2026-06-27 | consumer-direct:now | agent-cloud | — | 1 |
| 14196 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 2 |
| 14194 | 2026-06-27 | internal-only | docs-internal | — | 2 |
| 14189 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 2 |
| 14187 | 2026-06-27 | consumer-enabling | skill-machinery | — | 1 |
| 14182 | 2026-06-27 | consumer-direct:now | mcp-runtime | — | 2 |
| 14160 | 2026-06-27 | consumer-direct:now | agent-cloud | — | 3 |
| 14178 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 2 |
| 14180 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 2 |
| 14172 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 4 |
| 14161 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 6 |
| 14170 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 3 |
| 14162 | 2026-06-27 | consumer-direct:now | mcp-runtime | — | 2 |
| 14174 | 2026-06-27 | consumer-enabling | skill-machinery | — | 1 |
| 14157 | 2026-06-27 | consumer-direct:now | agent-cloud | — | 2 |
| 14155 | 2026-06-27 | consumer-direct:now | mcp-runtime | — | 2 |
| 14152 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 3 |
| 14143 | 2026-06-27 | consumer-enabling | ci-test-infra | — | 2 |
| 14148 | 2026-06-27 | consumer-direct:now | agent-cloud | — | 2 |
| 14141 | 2026-06-26 | internal-only | docs-internal | — | 1 |
| 14125 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 4 |
| 14137 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 6 |
| 14136 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 2 |
| 14121 | 2026-06-26 | consumer-direct:now | agent-cloud | — | 5 |
| 14117 | 2026-06-26 | consumer-direct:now | agent-cloud | — | 8 |
| 14111 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 2 |
| 14108 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 2 |
| 14116 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 2 |
| 14115 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 2 |
| 14114 | 2026-06-26 | consumer-direct:now | agent-cloud | — | 2 |
| 14104 | 2026-06-26 | consumer-direct:now | agent-cloud | — | 2 |
| 14107 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 2 |
| 14103 | 2026-06-26 | consumer-direct:now | agent-cloud | — | 2 |
| 14095 | 2026-06-26 | consumer-direct:now | agent-cloud | — | 2 |
| 14098 | 2026-06-26 | consumer-direct:now | agent-cloud | — | 2 |
| 14092 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 3 |
| 14091 | 2026-06-26 | internal-only | docs-internal | — | 1 |
| 14090 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 2 |
| 14087 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 2 |
| 14080 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 1 |
| 14083 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 2 |
| 14050 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 13 |
| 14077 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 2 |
| 14075 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 3 |
| 14076 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 6 |
| 14066 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 2 |
| 14073 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 3 |
| 14061 | 2026-06-26 | consumer-direct:now | agent-cloud | — | 5 |
| 14057 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 3 |
| 14051 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 4 |
| 14047 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 3 |
| 14040 | 2026-06-26 | internal-only | docs-internal | — | 1 |
| 14035 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 6 |
| 14071 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 4 |
| 14069 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 4 |
| 14065 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 4 |
| 14054 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 2 |
| 14049 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 2 |
| 14042 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 2 |
| 14060 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 2 |
| 14044 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 2 |
| 14056 | 2026-06-26 | consumer-direct:now | agent-cloud | — | 2 |
| 14022 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 11 |
| 14021 | 2026-06-26 | consumer-enabling | ci-test-infra | — | 6 |
| 14018 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 2 |
| 14016 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 5 |
| 14014 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 4 |
| 14013 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 5 |
| 13988 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 3 |
| 14008 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 4 |
| 14006 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 2 |
| 14004 | 2026-06-25 | unclassified | — | — | 0 |
| 14003 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 2 |
| 14002 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 2 |
| 13998 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 10 |
| 13996 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 6 |
| 13987 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 6 |
| 13990 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 3 |
| 13991 | 2026-06-25 | consumer-enabling | skill-machinery | — | 3 |
| 13986 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 11 |
| 13980 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 5 |
| 13979 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 4 |
| 13977 | 2026-06-25 | consumer-direct:now | agent-cloud | — | 2 |
| 13976 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 3 |
| 13975 | 2026-06-25 | consumer-enabling | ci-test-infra | — | 4 |
| 13973 | 2026-06-24 | consumer-enabling | ci-test-infra | — | 1 |
| 13972 | 2026-06-24 | consumer-direct:now | agent-cloud | — | 10 |
| 13970 | 2026-06-24 | consumer-enabling | ci-test-infra | — | 1 |
| 13968 | 2026-06-24 | consumer-enabling | ci-test-infra | — | 19 |
| 13966 | 2026-06-24 | consumer-enabling | ci-test-infra | — | 3 |
| 13963 | 2026-06-24 | consumer-enabling | ci-test-infra | — | 2 |
| 13961 | 2026-06-24 | consumer-enabling | ci-test-infra | — | 5 |
| 13940 | 2026-06-24 | consumer-enabling | ci-test-infra | — | 3 |
| 13908 | 2026-06-24 | consumer-enabling | ci-test-infra | — | 5 |
| 13959 | 2026-06-24 | consumer-enabling | ci-test-infra | — | 3 |
| 13938 | 2026-06-24 | consumer-direct:now | agent-cloud | — | 9 |
| 13957 | 2026-06-24 | consumer-enabling | ci-test-infra | — | 7 |
| 13955 | 2026-06-24 | consumer-direct:now | agent-cloud | — | 2 |
| 13953 | 2026-06-24 | consumer-enabling | ci-test-infra | — | 6 |
| 13951 | 2026-06-24 | consumer-enabling | ci-test-infra | — | 2 |
| 13949 | 2026-06-24 | consumer-enabling | ci-test-infra | — | 11 |
| 13947 | 2026-06-24 | consumer-enabling | ci-test-infra | — | 4 |
| 13945 | 2026-06-24 | consumer-enabling | ci-test-infra | — | 5 |
| 13943 | 2026-06-24 | consumer-enabling | ci-test-infra | — | 10 |
| 13941 | 2026-06-24 | consumer-enabling | ci-test-infra | — | 2 |
| 13911 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 4 |
| 13909 | 2026-06-23 | internal-only | docs-internal | — | 4 |
| 13937 | 2026-06-23 | consumer-direct:now | agent-cloud | — | 2 |
| 13935 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 14 |
| 13934 | 2026-06-23 | consumer-enabling | skill-machinery | — | 2 |
| 13932 | 2026-06-23 | consumer-direct:now | agent-cloud | — | 3 |
| 13931 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 4 |
| 13913 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 2 |
| 13921 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 7 |
| 13915 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 6 |
| 13929 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 2 |
| 13927 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 4 |
| 13925 | 2026-06-23 | consumer-direct:now | agent-cloud | — | 6 |
| 13922 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 2 |
| 13919 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 6 |
| 13917 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 2 |
| 13906 | 2026-06-23 | consumer-direct:now | agent-cloud | — | 21 |
| 13907 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 4 |
| 13905 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 1 |
| 13903 | 2026-06-23 | internal-only | docs-internal | — | 2 |
| 13901 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 6 |
| 13898 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 3 |
| 13897 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 4 |
| 13888 | 2026-06-23 | consumer-direct:now | agent-cloud | — | 4 |
| 13885 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 2 |
| 13887 | 2026-06-23 | consumer-enabling | ci-test-infra | — | 2 |
| 13876 | 2026-06-23 | consumer-direct:now | agent-cloud | — | 5 |
| 13878 | 2026-06-22 | consumer-direct:now | mcp-runtime | — | 8 |
| 13868 | 2026-06-22 | consumer-enabling | ci-test-infra | — | 7 |
| 13843 | 2026-06-22 | consumer-direct:now | agent-cloud | — | 3 |
| 13872 | 2026-06-22 | consumer-enabling | ci-test-infra | — | 2 |
| 13870 | 2026-06-22 | consumer-enabling | ci-test-infra | — | 2 |
| 13866 | 2026-06-22 | consumer-enabling | ci-test-infra | — | 2 |
| 13863 | 2026-06-22 | internal-only | docs-internal | — | 4 |
| 13859 | 2026-06-22 | consumer-direct:now | agent-cloud | — | 4 |
| 13858 | 2026-06-22 | consumer-enabling | ci-test-infra | — | 2 |
| 13856 | 2026-06-22 | consumer-enabling | ci-test-infra | — | 5 |
| 13864 | 2026-06-22 | internal-only | docs-internal | — | 1 |
| 13857 | 2026-06-22 | consumer-enabling | ci-test-infra | — | 6 |
| 13842 | 2026-06-22 | consumer-enabling | ci-test-infra | — | 3 |
| 13841 | 2026-06-22 | consumer-direct:now | agent-cloud | — | 5 |
| 13837 | 2026-06-22 | consumer-enabling | ci-test-infra | — | 2 |
| 13838 | 2026-06-22 | consumer-direct:now | agent-cloud | — | 11 |
| 13829 | 2026-06-22 | consumer-enabling | ci-test-infra | — | 2 |
| 13836 | 2026-06-22 | consumer-enabling | ci-test-infra | — | 3 |
| 13833 | 2026-06-22 | consumer-enabling | ci-test-infra | — | 4 |
| 13831 | 2026-06-22 | consumer-enabling | ci-test-infra | — | 3 |
| 13824 | 2026-06-21 | internal-only | docs-internal | — | 1 |
| 13826 | 2026-06-21 | consumer-enabling | skill-machinery | — | 1 |
| 13820 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 2 |
| 13809 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 2 |
| 13812 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 5 |
| 13815 | 2026-06-21 | internal-only | docs-internal | — | 1 |
| 13817 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 1 |
| 13810 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 1 |
| 13806 | 2026-06-21 | internal-only | docs-internal | — | 1 |
| 13801 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 2 |
| 13804 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 5 |
| 13799 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 2 |
| 13749 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 2 |
| 13789 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 2 |
| 13795 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 7 |
| 13752 | 2026-06-21 | consumer-direct:now | app-engine | enhancement, no auto close, ai, refactoring, architecture, neo-opus-ada, 2025-12-21T11:37:42Z @tobiu added the `enhancement` label, 2026-03-22T03:55:58Z @github-actions added the `stale` label | 1 |
| 13792 | 2026-06-21 | consumer-direct:now | agent-cloud | — | 2 |
| 13785 | 2026-06-21 | consumer-direct:now | agent-cloud | — | 4 |
| 13781 | 2026-06-21 | consumer-direct:now | agent-cloud | — | 2 |
| 13783 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 5 |
| 13741 | 2026-06-21 | consumer-direct:now | mcp-runtime | — | 3 |
| 13737 | 2026-06-21 | consumer-direct:now | mcp-runtime | — | 4 |
| 13779 | 2026-06-21 | internal-only | docs-internal | — | 43 |
| 13778 | 2026-06-21 | consumer-direct:now | agent-cloud | — | 3 |
| 13764 | 2026-06-21 | consumer-direct:now | agent-cloud | — | 2 |
| 13775 | 2026-06-21 | internal-only | docs-internal | — | 5 |
| 13770 | 2026-06-21 | consumer-direct:now | app-engine | enhancement, ai, architecture, model-experience, neo-opus-grace, '[x] 13771 Auto-hide dock items: edge-rail projection (phase 1 of #13280)', The rail projection mode — a new `DockLayoutAdapter` branch for `autoHidden` items vs an edge-zone decoration., **JSON-first** — no `DOMRect`/hover/reveal/open geometry in any serialized layout; reveal state stays runtime-only and converts to `setItemPinned`/`setItemAutoHidden` on commit. | 2 |
| 13769 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 3 |
| 13762 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 3 |
| 13761 | 2026-06-21 | consumer-direct:now | agent-cloud | — | 2 |
| 13759 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 3 |
| 13748 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 4 |
| 13747 | 2026-06-21 | consumer-direct:future-direct | fleet-tooling | — | 4 |
| 13735 | 2026-06-21 | consumer-direct:now | mcp-runtime | — | 3 |
| 13732 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 6 |
| 13730 | 2026-06-21 | consumer-enabling | skill-machinery | — | 1 |
| 13729 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 2 |
| 13728 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 3 |
| 13726 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 6 |
| 13725 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 2 |
| 13723 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 2 |
| 13721 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 3 |
| 13719 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 6 |
| 13718 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 4 |
| 13715 | 2026-06-21 | consumer-enabling | skill-machinery | — | 2 |
| 13713 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 4 |
| 13712 | 2026-06-21 | consumer-enabling | skill-machinery | — | 1 |
| 13708 | 2026-06-21 | consumer-enabling | skill-machinery | — | 2 |
| 13706 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 6 |
| 13704 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 2 |
| 13705 | 2026-06-21 | consumer-enabling | skill-machinery | — | 1 |
| 13693 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 9 |
| 13699 | 2026-06-21 | consumer-enabling | skill-machinery | — | 1 |
| 13686 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 2 |
| 13701 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 4 |
| 13690 | 2026-06-21 | consumer-enabling | skill-machinery | — | 6 |
| 13486 | 2026-06-21 | internal-only | docs-internal | — | 2 |
| 13696 | 2026-06-21 | consumer-direct:now | mcp-runtime | — | 2 |
| 13695 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 2 |
| 13687 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 4 |
| 13684 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 11 |
| 13685 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 3 |
| 13680 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 2 |
| 13682 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 2 |
| 13677 | 2026-06-21 | internal-only | docs-internal | — | 6 |
| 13676 | 2026-06-21 | consumer-enabling | ci-test-infra | — | 2 |
| 13673 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 2 |
| 13669 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 1 |
| 13666 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 5 |
| 13671 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 3 |
| 13668 | 2026-06-20 | consumer-direct:now | agent-cloud | — | 2 |
| 13660 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 1 |
| 13662 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 3 |
| 13658 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 2 |
| 13657 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 4 |
| 13656 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 2 |
| 13653 | 2026-06-20 | internal-only | docs-internal | — | 1 |
| 13651 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 2 |
| 13650 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 2 |
| 13645 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 4 |
| 13642 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 3 |
| 13640 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 4 |
| 13635 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 2 |
| 13629 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 2 |
| 13633 | 2026-06-20 | consumer-enabling | skill-machinery | — | 2 |
| 13631 | 2026-06-20 | consumer-direct:now | agent-cloud | — | 2 |
| 13630 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 6 |
| 13625 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 4 |
| 13620 | 2026-06-20 | consumer-enabling | skill-machinery | — | 1 |
| 13615 | 2026-06-20 | consumer-enabling | skill-machinery | — | 2 |
| 13610 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 2 |
| 13603 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 2 |
| 13602 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 4 |
| 13598 | 2026-06-20 | consumer-direct:now | agent-cloud | — | 2 |
| 13596 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 2 |
| 13591 | 2026-06-20 | consumer-direct:now | agent-cloud | — | 1 |
| 13593 | 2026-06-20 | consumer-direct:now | agent-cloud | — | 4 |
| 13589 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 6 |
| 13588 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 5 |
| 13584 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 3 |
| 13585 | 2026-06-20 | consumer-direct:now | agent-cloud | — | 1 |
| 13580 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 12 |
| 13579 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 2 |
| 13553 | 2026-06-20 | consumer-direct:now | agent-cloud | — | 12 |
| 13582 | 2026-06-20 | consumer-direct:now | agent-cloud | — | 3 |
| 13574 | 2026-06-20 | consumer-direct:now | mcp-runtime | — | 5 |
| 13572 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 4 |
| 13568 | 2026-06-20 | consumer-direct:now | agent-cloud | — | 4 |
| 13567 | 2026-06-20 | consumer-direct:now | agent-cloud | — | 2 |
| 13564 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 2 |
| 13562 | 2026-06-20 | consumer-enabling | skill-machinery | — | 3 |
| 13561 | 2026-06-20 | consumer-enabling | ci-test-infra | — | 4 |
| 13558 | 2026-06-19 | consumer-enabling | ci-test-infra | — | 3 |
| 13559 | 2026-06-19 | consumer-enabling | ci-test-infra | — | 2 |
| 13554 | 2026-06-19 | consumer-enabling | skill-machinery | — | 3 |
| 13527 | 2026-06-19 | consumer-enabling | ci-test-infra | — | 3 |
| 13536 | 2026-06-19 | consumer-enabling | ci-test-infra | — | 7 |
| 13546 | 2026-06-19 | consumer-enabling | skill-machinery | — | 2 |
| 13550 | 2026-06-19 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 13549 | 2026-06-19 | consumer-enabling | ci-test-infra | — | 5 |
| 13544 | 2026-06-19 | consumer-enabling | ci-test-infra | — | 3 |
| 13545 | 2026-06-19 | consumer-enabling | ci-test-infra | — | 2 |
| 13541 | 2026-06-19 | consumer-enabling | skill-machinery | — | 2 |
| 13534 | 2026-06-19 | consumer-enabling | ci-test-infra | — | 3 |
| 13526 | 2026-06-19 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 13518 | 2026-06-19 | internal-only | docs-internal | — | 1 |
| 13517 | 2026-06-19 | consumer-direct:now | mcp-runtime | — | 4 |
| 13516 | 2026-06-19 | consumer-direct:future-direct | fleet-tooling | — | 6 |
| 13514 | 2026-06-19 | consumer-enabling | ci-test-infra | — | 2 |
| 13511 | 2026-06-19 | consumer-enabling | ci-test-infra | — | 6 |
| 13509 | 2026-06-19 | consumer-direct:now | mcp-runtime | — | 6 |
| 13507 | 2026-06-19 | consumer-direct:now | mcp-runtime | — | 10 |
| 13504 | 2026-06-19 | consumer-enabling | ci-test-infra | — | 8 |
| 13502 | 2026-06-19 | consumer-enabling | ci-test-infra | — | 2 |
| 13500 | 2026-06-19 | consumer-enabling | ci-test-infra | — | 11 |
| 13497 | 2026-06-19 | internal-only | docs-internal | — | 1 |
| 13494 | 2026-06-19 | consumer-enabling | ci-test-infra | — | 6 |
| 13489 | 2026-06-19 | consumer-direct:now | agent-cloud | — | 6 |
| 13492 | 2026-06-19 | consumer-direct:now | mcp-runtime | — | 6 |
| 13490 | 2026-06-19 | consumer-enabling | ci-test-infra | — | 7 |
| 13484 | 2026-06-19 | consumer-direct:now | agent-cloud | — | 2 |
| 13455 | 2026-06-18 | consumer-enabling | ci-test-infra | — | 12 |
| 13476 | 2026-06-18 | consumer-enabling | ci-test-infra | — | 3 |
| 13472 | 2026-06-18 | consumer-enabling | ci-test-infra | — | 2 |
| 13470 | 2026-06-18 | consumer-enabling | ci-test-infra | — | 3 |
| 13468 | 2026-06-18 | consumer-enabling | ci-test-infra | — | 6 |
| 13457 | 2026-06-18 | consumer-direct:now | agent-cloud | — | 4 |
| 13465 | 2026-06-18 | consumer-enabling | ci-test-infra | — | 7 |
| 13463 | 2026-06-18 | consumer-enabling | ci-test-infra | — | 5 |
| 13461 | 2026-06-18 | consumer-direct:now | mcp-runtime | — | 2 |
| 13459 | 2026-06-18 | consumer-enabling | ci-test-infra | — | 11 |
| 13454 | 2026-06-17 | consumer-enabling | skill-machinery | — | 2 |
| 13451 | 2026-06-17 | consumer-direct:future-direct | fleet-tooling | — | 8 |
| 13450 | 2026-06-17 | consumer-enabling | ci-test-infra | — | 1 |
| 13447 | 2026-06-17 | internal-only | docs-internal | — | 1 |
| 13385 | 2026-06-16 | consumer-enabling | ci-test-infra | — | 4 |
| 13443 | 2026-06-16 | consumer-enabling | ci-test-infra | — | 3 |
| 13442 | 2026-06-16 | consumer-enabling | ci-test-infra | — | 1 |
| 13440 | 2026-06-16 | consumer-enabling | ci-test-infra | — | 3 |
| 13437 | 2026-06-16 | consumer-direct:future-direct | fleet-tooling | — | 6 |
| 13434 | 2026-06-16 | consumer-enabling | ci-test-infra | — | 2 |
| 13429 | 2026-06-16 | consumer-enabling | ci-test-infra | — | 8 |
| 13393 | 2026-06-16 | internal-only | docs-internal | — | 1 |
| 13430 | 2026-06-16 | consumer-direct:now | app-engine | — | 35 |
| 13423 | 2026-06-16 | internal-only | docs-internal | — | 2 |
| 13425 | 2026-06-16 | internal-only | docs-internal | — | 545 |
| 13416 | 2026-06-16 | consumer-direct:future-direct | fleet-tooling | — | 7 |
| 13414 | 2026-06-16 | consumer-enabling | ci-test-infra | — | 3 |
| 13410 | 2026-06-16 | consumer-enabling | ci-test-infra | — | 25 |
| 13409 | 2026-06-16 | consumer-direct:future-direct | fleet-tooling | — | 6 |
| 13408 | 2026-06-16 | consumer-enabling | ci-test-infra | — | 2 |
| 13405 | 2026-06-16 | consumer-direct:now | agent-cloud | — | 2 |
| 13406 | 2026-06-16 | consumer-enabling | skill-machinery | — | 1 |
| 13363 | 2026-06-16 | consumer-enabling | ci-test-infra | — | 1 |
| 13401 | 2026-06-16 | consumer-enabling | ci-test-infra | — | 5 |
| 13386 | 2026-06-16 | internal-only | docs-internal | documentation, Blog Post, ai, Full component tree with live state, Data stores with records, filters, sorters, State providers with hierarchical data, VDOM and VNode trees, Computed styles and DOM rects, Runtime method inspection and hot-patching, Agent inspects a live grid → finds columns, records, Agent adds a summary row → `create_component` / `call_method`, Agent verifies the result via `get_computed_styles`, All without touching source code or reloading the browser, One agent controls multiple browser windows simultaneously, Component teleportation between windows, Shared application state across the entire window topology, Publish as markdown in `learn/blog/` (SSG+ indexable via neomjs.com) | 1 |
| 13399 | 2026-06-16 | consumer-enabling | skill-machinery | — | 6 |
| 13396 | 2026-06-16 | consumer-enabling | ci-test-infra | — | 6 |
| 13387 | 2026-06-16 | consumer-enabling | ci-test-infra | — | 11 |
| 13392 | 2026-06-16 | consumer-enabling | ci-test-infra | — | 3 |
| 13389 | 2026-06-16 | consumer-enabling | skill-machinery | — | 6 |
| 13382 | 2026-06-15 | consumer-enabling | skill-machinery | — | 1 |
| 13371 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 5 |
| 13368 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 4 |
| 13379 | 2026-06-15 | consumer-direct:now | mcp-runtime | — | 2 |
| 13367 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 3 |
| 13364 | 2026-06-15 | consumer-enabling | skill-machinery | — | 1 |
| 13360 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 7 |
| 13356 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 4 |
| 13351 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 5 |
| 13346 | 2026-06-15 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 13345 | 2026-06-15 | consumer-direct:now | app-engine | — | 8 |
| 13339 | 2026-06-15 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 13340 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 1 |
| 13337 | 2026-06-15 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 13334 | 2026-06-15 | consumer-direct:now | app-engine | — | 2 |
| 13333 | 2026-06-15 | consumer-direct:now | app-engine | — | 9 |
| 13332 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 4 |
| 13316 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 4 |
| 13329 | 2026-06-15 | consumer-direct:now | app-engine | — | 8 |
| 13317 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 7 |
| 13327 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 6 |
| 13325 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 1 |
| 13322 | 2026-06-15 | consumer-direct:now | agent-cloud | — | 2 |
| 13314 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 3 |
| 13321 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 2 |
| 13294 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 1 |
| 13311 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 2 |
| 13310 | 2026-06-15 | internal-only | docs-internal | — | 1 |
| 13307 | 2026-06-15 | consumer-direct:now | app-engine | — | 9 |
| 13305 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 5 |
| 13303 | 2026-06-15 | consumer-enabling | skill-machinery | — | 1 |
| 13301 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 5 |
| 13298 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 3 |
| 13296 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 3 |
| 13293 | 2026-06-15 | consumer-enabling | skill-machinery | — | 1 |
| 13290 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 3 |
| 13288 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 6 |
| 13285 | 2026-06-15 | consumer-direct:now | agent-cloud | — | 2 |
| 13277 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 5 |
| 13269 | 2026-06-15 | consumer-direct:now | mcp-runtime | — | 4 |
| 13284 | 2026-06-15 | consumer-direct:now | app-engine | — | 2 |
| 13279 | 2026-06-15 | internal-only | docs-internal | — | 3 |
| 13276 | 2026-06-15 | internal-only | docs-internal | — | 6 |
| 13274 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 4 |
| 13271 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 3 |
| 13270 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 6 |
| 13267 | 2026-06-15 | consumer-direct:now | mcp-runtime | — | 2 |
| 13264 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 4 |
| 13266 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 7 |
| 13263 | 2026-06-15 | consumer-enabling | ci-test-infra | — | 4 |
| 13256 | 2026-06-14 | consumer-direct:now | app-engine | — | 3 |
| 13246 | 2026-06-14 | consumer-enabling | ci-test-infra | — | 4 |
| 13259 | 2026-06-14 | consumer-direct:now | app-engine | — | 7 |
| 13255 | 2026-06-14 | internal-only | docs-internal | — | 4 |
| 13251 | 2026-06-14 | consumer-enabling | skill-machinery | — | 2 |
| 13249 | 2026-06-14 | consumer-direct:now | app-engine | — | 3 |
| 13240 | 2026-06-14 | internal-only | docs-internal | — | 1 |
| 13238 | 2026-06-14 | consumer-direct:now | app-engine | — | 2 |
| 13242 | 2026-06-14 | consumer-enabling | skill-machinery | — | 1 |
| 13237 | 2026-06-14 | consumer-enabling | ci-test-infra | — | 3 |
| 13235 | 2026-06-14 | internal-only | docs-internal | — | 5 |
| 13233 | 2026-06-14 | consumer-direct:now | app-engine | — | 2 |
| 13220 | 2026-06-14 | consumer-enabling | ci-test-infra | — | 3 |
| 13231 | 2026-06-14 | consumer-direct:now | app-engine | — | 2 |
| 13218 | 2026-06-14 | internal-only | docs-internal | — | 2 |
| 13215 | 2026-06-14 | internal-only | docs-internal | — | 1 |
| 13228 | 2026-06-14 | consumer-enabling | ci-test-infra | — | 4 |
| 13225 | 2026-06-14 | consumer-direct:now | app-engine | — | 5 |
| 13226 | 2026-06-14 | consumer-direct:now | app-engine | — | 4 |
| 13223 | 2026-06-14 | consumer-enabling | ci-test-infra | — | 3 |
| 13212 | 2026-06-14 | consumer-enabling | skill-machinery | — | 1 |
| 13209 | 2026-06-14 | consumer-direct:now | app-engine | — | 2 |
| 13208 | 2026-06-14 | consumer-direct:now | app-engine | — | 2 |
| 13205 | 2026-06-14 | consumer-direct:now | app-engine | — | 2 |
| 13203 | 2026-06-14 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 13200 | 2026-06-14 | consumer-enabling | ci-test-infra | — | 3 |
| 13197 | 2026-06-14 | consumer-direct:now | agent-cloud | — | 2 |
| 13201 | 2026-06-14 | consumer-enabling | ci-test-infra | — | 2 |
| 13199 | 2026-06-14 | consumer-direct:now | mcp-runtime | — | 2 |
| 13194 | 2026-06-14 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 13198 | 2026-06-14 | consumer-enabling | ci-test-infra | — | 3 |
| 13188 | 2026-06-14 | consumer-enabling | ci-test-infra | — | 5 |
| 13189 | 2026-06-14 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 13191 | 2026-06-14 | consumer-enabling | ci-test-infra | — | 2 |
| 13183 | 2026-06-14 | consumer-enabling | ci-test-infra | — | 2 |
| 13181 | 2026-06-14 | consumer-enabling | ci-test-infra | — | 7 |
| 13184 | 2026-06-14 | consumer-enabling | ci-test-infra | — | 1 |
| 13180 | 2026-06-14 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 13178 | 2026-06-14 | consumer-direct:future-direct | fleet-tooling | — | 4 |
| 13176 | 2026-06-14 | consumer-enabling | ci-test-infra | — | 4 |
| 13175 | 2026-06-14 | consumer-direct:now | app-engine | — | 3 |
| 13174 | 2026-06-14 | consumer-direct:now | app-engine | — | 3 |
| 13171 | 2026-06-14 | consumer-direct:now | agent-cloud | — | 2 |
| 13168 | 2026-06-14 | consumer-direct:now | app-engine | — | 3 |
| 13161 | 2026-06-14 | consumer-direct:now | app-engine | — | 2 |
| 13166 | 2026-06-14 | internal-only | docs-internal | — | 1 |
| 13163 | 2026-06-14 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 13160 | 2026-06-14 | consumer-direct:now | app-engine | — | 3 |
| 13154 | 2026-06-14 | consumer-enabling | ci-test-infra | — | 5 |
| 13152 | 2026-06-14 | consumer-direct:now | app-engine | — | 2 |
| 13156 | 2026-06-14 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 13151 | 2026-06-14 | internal-only | docs-internal | — | 1 |
| 13149 | 2026-06-14 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 13146 | 2026-06-14 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 13143 | 2026-06-14 | consumer-enabling | ci-test-infra | — | 5 |
| 13142 | 2026-06-14 | consumer-direct:now | app-engine | — | 3 |
| 13141 | 2026-06-14 | consumer-direct:now | agent-cloud | — | 3 |
| 13135 | 2026-06-14 | consumer-direct:now | app-engine | — | 2 |
| 13139 | 2026-06-14 | consumer-enabling | ci-test-infra | — | 7 |
| 13140 | 2026-06-14 | consumer-direct:now | app-engine | — | 2 |
| 13136 | 2026-06-14 | consumer-enabling | skill-machinery | — | 4 |
| 13133 | 2026-06-13 | consumer-direct:now | app-engine | — | 2 |
| 13132 | 2026-06-13 | consumer-enabling | skill-machinery | — | 1 |
| 13130 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 3 |
| 13128 | 2026-06-13 | internal-only | docs-internal | — | 1 |
| 13126 | 2026-06-13 | consumer-direct:now | app-engine | — | 2 |
| 13123 | 2026-06-13 | consumer-direct:future-direct | fleet-tooling | — | 5 |
| 13119 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 7 |
| 13116 | 2026-06-13 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 13117 | 2026-06-13 | consumer-direct:now | app-engine | — | 2 |
| 13113 | 2026-06-13 | consumer-direct:now | app-engine | — | 2 |
| 13112 | 2026-06-13 | consumer-direct:now | mcp-runtime | — | 4 |
| 13111 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 3 |
| 13109 | 2026-06-13 | consumer-direct:now | app-engine | — | 5 |
| 13108 | 2026-06-13 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 13107 | 2026-06-13 | consumer-direct:now | app-engine | — | 3 |
| 13103 | 2026-06-13 | consumer-direct:now | mcp-runtime | — | 6 |
| 13101 | 2026-06-13 | consumer-direct:now | app-engine | — | 2 |
| 13100 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 6 |
| 13099 | 2026-06-13 | consumer-enabling | skill-machinery | — | 3 |
| 13096 | 2026-06-13 | consumer-direct:now | agent-cloud | — | 2 |
| 13097 | 2026-06-13 | consumer-direct:now | agent-cloud | — | 2 |
| 13094 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 2 |
| 13092 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 3 |
| 13090 | 2026-06-13 | internal-only | docs-internal | — | 1 |
| 13088 | 2026-06-13 | consumer-direct:now | agent-cloud | — | 2 |
| 13087 | 2026-06-13 | internal-only | docs-internal | — | 1 |
| 13085 | 2026-06-13 | consumer-direct:now | app-engine | — | 4 |
| 13083 | 2026-06-13 | consumer-enabling | skill-machinery | — | 1 |
| 13081 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 7 |
| 13080 | 2026-06-13 | consumer-direct:future-direct | fleet-tooling | — | 11 |
| 13066 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 11 |
| 13079 | 2026-06-13 | internal-only | docs-internal | — | 1 |
| 13078 | 2026-06-13 | consumer-direct:now | mcp-runtime | — | 2 |
| 13075 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 6 |
| 13073 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 5 |
| 13072 | 2026-06-13 | consumer-direct:now | app-engine | — | 2 |
| 13071 | 2026-06-13 | internal-only | docs-internal | — | 8 |
| 13070 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 3 |
| 13068 | 2026-06-13 | consumer-direct:now | app-engine | — | 3 |
| 13062 | 2026-06-13 | internal-only | docs-internal | — | 5 |
| 13055 | 2026-06-13 | internal-only | docs-internal | — | 3 |
| 13048 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 5 |
| 13057 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 5 |
| 13047 | 2026-06-13 | consumer-enabling | skill-machinery | — | 1 |
| 13054 | 2026-06-13 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 13051 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 8 |
| 13050 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 3 |
| 13053 | 2026-06-13 | consumer-direct:now | app-engine | — | 4 |
| 13044 | 2026-06-13 | consumer-enabling | skill-machinery | — | 1 |
| 13040 | 2026-06-13 | internal-only | docs-internal | — | 4 |
| 13037 | 2026-06-13 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 13035 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 2 |
| 13036 | 2026-06-13 | internal-only | docs-internal | — | 4 |
| 13034 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 10 |
| 13027 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 4 |
| 13029 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 2 |
| 13024 | 2026-06-13 | consumer-direct:now | app-engine | — | 12 |
| 13021 | 2026-06-13 | consumer-enabling | skill-machinery | — | 1 |
| 13016 | 2026-06-13 | consumer-enabling | ci-test-infra | — | 7 |
| 13014 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 2 |
| 12997 | 2026-06-12 | consumer-enabling | skill-machinery | — | 6 |
| 12993 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 7 |
| 13003 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 8 |
| 13008 | 2026-06-12 | consumer-direct:now | app-engine | — | 5 |
| 12998 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 8 |
| 13009 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 7 |
| 13000 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 3 |
| 13010 | 2026-06-12 | consumer-direct:now | agent-cloud | — | 5 |
| 13007 | 2026-06-12 | consumer-direct:now | mcp-runtime | — | 2 |
| 13006 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 2 |
| 13005 | 2026-06-12 | consumer-direct:now | agent-cloud | — | 2 |
| 12971 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 1 |
| 12989 | 2026-06-12 | consumer-direct:now | app-engine | — | 4 |
| 12988 | 2026-06-12 | consumer-direct:now | app-engine | — | 2 |
| 12985 | 2026-06-12 | consumer-direct:now | app-engine | — | 3 |
| 12979 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 4 |
| 12982 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 1 |
| 12968 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 1 |
| 12977 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 2 |
| 12975 | 2026-06-12 | consumer-direct:now | mcp-runtime | — | 2 |
| 12976 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 2 |
| 12966 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 2 |
| 12963 | 2026-06-12 | consumer-direct:now | app-engine | — | 2 |
| 12962 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 1 |
| 12960 | 2026-06-12 | consumer-enabling | skill-machinery | — | 3 |
| 12961 | 2026-06-12 | consumer-direct:now | app-engine | — | 2 |
| 12956 | 2026-06-12 | consumer-direct:now | app-engine | — | 5 |
| 12952 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 4 |
| 12945 | 2026-06-12 | internal-only | docs-internal | — | 8 |
| 12950 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 3 |
| 12948 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 1 |
| 12935 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 3 |
| 12928 | 2026-06-12 | internal-only | docs-internal | — | 1 |
| 12925 | 2026-06-12 | internal-only | docs-internal | — | 1 |
| 12923 | 2026-06-12 | consumer-enabling | ci-test-infra | — | 3 |
| 12921 | 2026-06-12 | internal-only | docs-internal | — | 1 |
| 12919 | 2026-06-11 | consumer-enabling | skill-machinery | — | 1 |
| 12917 | 2026-06-11 | consumer-enabling | ci-test-infra | — | 3 |
| 12914 | 2026-06-11 | consumer-enabling | skill-machinery | — | 2 |
| 12912 | 2026-06-11 | consumer-enabling | skill-machinery | — | 6 |
| 12911 | 2026-06-11 | consumer-enabling | skill-machinery | — | 1 |
| 12908 | 2026-06-11 | consumer-direct:now | app-engine | — | 10 |
| 12904 | 2026-06-11 | consumer-direct:now | app-engine | — | 3 |
| 12905 | 2026-06-11 | consumer-direct:now | app-engine | — | 2 |
| 12901 | 2026-06-11 | consumer-direct:now | app-engine | — | 2 |
| 12900 | 2026-06-11 | consumer-enabling | ci-test-infra | — | 21 |
| 12893 | 2026-06-11 | consumer-enabling | ci-test-infra | — | 2 |
| 12894 | 2026-06-11 | consumer-direct:now | app-engine | — | 3 |
| 12891 | 2026-06-11 | consumer-direct:now | app-engine | — | 2 |
| 12890 | 2026-06-11 | consumer-direct:now | app-engine | — | 13 |
| 12888 | 2026-06-11 | consumer-direct:now | app-engine | — | 2 |
| 12885 | 2026-06-11 | consumer-enabling | skill-machinery | — | 2 |
| 12882 | 2026-06-11 | consumer-direct:now | app-engine | — | 2 |
| 12881 | 2026-06-11 | consumer-direct:now | app-engine | — | 1 |
| 12877 | 2026-06-11 | internal-only | docs-internal | — | 1 |
| 12875 | 2026-06-11 | consumer-direct:now | agent-cloud | — | 2 |
| 12871 | 2026-06-11 | consumer-direct:now | agent-cloud | — | 6 |
| 12870 | 2026-06-11 | consumer-direct:now | mcp-runtime | — | 4 |
| 12868 | 2026-06-10 | consumer-enabling | ci-test-infra | — | 5 |
| 12869 | 2026-06-10 | consumer-enabling | skill-machinery | — | 2 |
| 12866 | 2026-06-10 | consumer-direct:now | agent-cloud | — | 3 |
| 12867 | 2026-06-10 | consumer-enabling | skill-machinery | — | 2 |
| 12860 | 2026-06-10 | consumer-direct:now | agent-cloud | — | 2 |
| 12863 | 2026-06-10 | consumer-enabling | ci-test-infra | — | 3 |
| 12859 | 2026-06-10 | consumer-enabling | ci-test-infra | — | 26 |
| 12858 | 2026-06-10 | consumer-enabling | skill-machinery | — | 1 |
| 12857 | 2026-06-10 | consumer-enabling | ci-test-infra | — | 2 |
| 12855 | 2026-06-10 | consumer-direct:now | agent-cloud | — | 3 |
| 12847 | 2026-06-10 | consumer-enabling | ci-test-infra | — | 2 |
| 12843 | 2026-06-10 | internal-only | docs-internal | — | 2 |
| 12841 | 2026-06-10 | consumer-enabling | ci-test-infra | — | 4 |
| 12844 | 2026-06-10 | consumer-enabling | ci-test-infra | — | 11 |
| 12837 | 2026-06-10 | consumer-enabling | ci-test-infra | — | 5 |
| 12832 | 2026-06-10 | consumer-enabling | ci-test-infra | — | 4 |
| 12835 | 2026-06-10 | consumer-enabling | ci-test-infra | — | 4 |
| 12829 | 2026-06-09 | consumer-direct:now | agent-cloud | — | 3 |
| 12827 | 2026-06-09 | internal-only | docs-internal | — | 1 |
| 12825 | 2026-06-09 | consumer-enabling | ci-test-infra | — | 3 |
| 12778 | 2026-06-09 | consumer-enabling | ci-test-infra | — | 11 |
| 12822 | 2026-06-09 | consumer-enabling | ci-test-infra | — | 3 |
| 12820 | 2026-06-09 | consumer-enabling | ci-test-infra | — | 2 |
| 12818 | 2026-06-09 | consumer-enabling | ci-test-infra | — | 4 |
| 12792 | 2026-06-09 | consumer-direct:now | app-engine | — | 2 |
| 12816 | 2026-06-09 | internal-only | docs-internal | — | 1 |
| 12813 | 2026-06-09 | internal-only | docs-internal | — | 1 |
| 12801 | 2026-06-09 | consumer-direct:now | app-engine | — | 3 |
| 12805 | 2026-06-09 | consumer-enabling | skill-machinery | — | 1 |
| 12802 | 2026-06-09 | consumer-enabling | ci-test-infra | — | 2 |
| 12810 | 2026-06-09 | consumer-direct:now | agent-cloud | — | 4 |
| 12798 | 2026-06-09 | consumer-enabling | ci-test-infra | — | 3 |
| 12796 | 2026-06-09 | internal-only | docs-internal | — | 1 |
| 12794 | 2026-06-09 | internal-only | docs-internal | — | 1 |
| 12791 | 2026-06-09 | internal-only | docs-internal | — | 1 |
| 12788 | 2026-06-08 | internal-only | docs-internal | — | 1 |
| 12781 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 3 |
| 12777 | 2026-06-08 | internal-only | docs-internal | — | 1 |
| 12775 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 3 |
| 12773 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 3 |
| 12770 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 2 |
| 12771 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 2 |
| 12769 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 2 |
| 12766 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 3 |
| 12764 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 2 |
| 12762 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 3 |
| 12759 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 7 |
| 12760 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 6 |
| 12755 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 8 |
| 12754 | 2026-06-08 | consumer-direct:now | app-engine | — | 2 |
| 12756 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 1 |
| 12751 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 3 |
| 12750 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 3 |
| 12728 | 2026-06-08 | internal-only | portal-internal | — | 3 |
| 12739 | 2026-06-08 | internal-only | docs-internal | — | 14 |
| 12736 | 2026-06-08 | internal-only | docs-internal | — | 2 |
| 12730 | 2026-06-08 | internal-only | docs-internal | — | 1 |
| 12732 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 3 |
| 12738 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 3 |
| 12720 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 5 |
| 12724 | 2026-06-08 | internal-only | docs-internal | — | 1 |
| 12722 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 7 |
| 12721 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 4 |
| 12718 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 2 |
| 12712 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 5 |
| 12717 | 2026-06-08 | internal-only | docs-internal | — | 1 |
| 12714 | 2026-06-08 | internal-only | docs-internal | — | 1 |
| 12710 | 2026-06-08 | consumer-enabling | ci-test-infra | — | 3 |
| 12708 | 2026-06-08 | consumer-direct:now | app-engine | — | 2 |
| 12709 | 2026-06-08 | internal-only | docs-internal | — | 1 |
| 12704 | 2026-06-08 | internal-only | docs-internal | — | 1 |
| 12701 | 2026-06-08 | consumer-direct:now | app-engine | — | 1 |
| 12697 | 2026-06-08 | internal-only | docs-internal | — | 3 |
| 12691 | 2026-06-07 | consumer-enabling | ci-test-infra | — | 1 |
| 12693 | 2026-06-07 | consumer-enabling | ci-test-infra | — | 2 |
| 12689 | 2026-06-07 | consumer-direct:now | app-engine | — | 1 |
| 12690 | 2026-06-07 | consumer-direct:now | agent-cloud | — | 3 |
| 12688 | 2026-06-07 | consumer-enabling | ci-test-infra | — | 1 |
| 12684 | 2026-06-07 | internal-only | docs-internal | — | 5 |
| 12681 | 2026-06-07 | internal-only | docs-internal | — | 3 |
| 12680 | 2026-06-07 | consumer-enabling | ci-test-infra | — | 1 |
| 12685 | 2026-06-07 | consumer-direct:now | mcp-runtime | — | 6 |
| 12678 | 2026-06-07 | consumer-enabling | ci-test-infra | — | 3 |
| 12676 | 2026-06-07 | consumer-enabling | ci-test-infra | — | 12 |
| 12659 | 2026-06-07 | consumer-enabling | ci-test-infra | — | 6 |
| 12687 | 2026-06-07 | consumer-enabling | ci-test-infra | — | 5 |
| 12683 | 2026-06-07 | consumer-enabling | ci-test-infra | — | 1 |
| 12675 | 2026-06-07 | consumer-enabling | skill-machinery | — | 6 |
| 12670 | 2026-06-07 | consumer-direct:now | agent-cloud | — | 10 |
| 12668 | 2026-06-07 | internal-only | docs-internal | — | 1 |
| 12667 | 2026-06-07 | consumer-enabling | ci-test-infra | — | 1 |
| 12665 | 2026-06-07 | consumer-enabling | ci-test-infra | — | 1 |
| 12664 | 2026-06-07 | consumer-enabling | ci-test-infra | — | 7 |
| 12661 | 2026-06-07 | consumer-direct:now | app-engine | — | 2 |
| 12663 | 2026-06-07 | internal-only | docs-internal | — | 2 |
| 12658 | 2026-06-07 | consumer-enabling | skill-machinery | — | 4 |
| 12657 | 2026-06-06 | consumer-direct:now | agent-cloud | — | 6 |
| 12651 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 38 |
| 12656 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 3 |
| 12654 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 2 |
| 12649 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 93 |
| 12653 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 7 |
| 12652 | 2026-06-06 | consumer-enabling | skill-machinery | — | 1 |
| 12647 | 2026-06-06 | internal-only | portal-internal | — | 3 |
| 12642 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 6 |
| 12605 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 3 |
| 12645 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 3 |
| 12643 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 4 |
| 12641 | 2026-06-06 | consumer-direct:now | mcp-runtime | — | 2 |
| 12638 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 4 |
| 12637 | 2026-06-06 | consumer-enabling | skill-machinery | — | 3 |
| 12629 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 7 |
| 12636 | 2026-06-06 | consumer-direct:now | app-engine | — | 5 |
| 12626 | 2026-06-06 | consumer-enabling | skill-machinery | — | 1 |
| 12622 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 16 |
| 12610 | 2026-06-06 | consumer-direct:now | app-engine | — | 6 |
| 12625 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 9 |
| 12620 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 6 |
| 12618 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 2 |
| 12616 | 2026-06-06 | consumer-enabling | skill-machinery | — | 5 |
| 12615 | 2026-06-06 | consumer-direct:future-direct | fleet-tooling | — | 2 |
| 12607 | 2026-06-06 | consumer-direct:now | agent-cloud | — | 2 |
| 12604 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 3 |
| 12603 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 6 |
| 12601 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 3 |
| 12600 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 2 |
| 12599 | 2026-06-06 | internal-only | docs-internal | — | 5 |
| 12596 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 2 |
| 12602 | 2026-06-06 | consumer-enabling | ci-test-infra | — | 6 |
| 12594 | 2026-06-05 | internal-only | docs-internal | — | 3 |
| 12593 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 5 |
| 12592 | 2026-06-05 | consumer-enabling | skill-machinery | — | 4 |
| 12591 | 2026-06-05 | consumer-enabling | skill-machinery | — | 2 |
| 12590 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 6 |
| 12584 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 2 |
| 12587 | 2026-06-05 | consumer-enabling | skill-machinery | — | 9 |
| 12586 | 2026-06-05 | consumer-enabling | skill-machinery | — | 1 |
| 12583 | 2026-06-05 | internal-only | docs-internal | — | 1 |
| 12581 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 16 |
| 12579 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 42 |
| 12575 | 2026-06-05 | consumer-enabling | skill-machinery | — | 1 |
| 12561 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 46 |
| 12556 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 26 |
| 12560 | 2026-06-05 | consumer-enabling | skill-machinery | — | 5 |
| 12533 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 2 |
| 12537 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 2 |
| 12559 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 3 |
| 12555 | 2026-06-05 | consumer-enabling | skill-machinery | — | 2 |
| 12562 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 6 |
| 12569 | 2026-06-05 | consumer-enabling | skill-machinery | — | 3 |
| 12564 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 20 |
| 12570 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 2 |
| 12563 | 2026-06-05 | consumer-direct:now | mcp-runtime | — | 2 |
| 12576 | 2026-06-05 | consumer-direct:now | agent-cloud | — | 2 |
| 12558 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 2 |
| 12554 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 9 |
| 12553 | 2026-06-05 | consumer-enabling | skill-machinery | — | 5 |
| 12547 | 2026-06-05 | consumer-direct:now | mcp-runtime | — | 1 |
| 12551 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 8 |
| 12544 | 2026-06-05 | consumer-enabling | skill-machinery | — | 1 |
| 12542 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 3 |
| 12539 | 2026-06-05 | consumer-enabling | skill-machinery | — | 1 |
| 12528 | 2026-06-05 | consumer-enabling | skill-machinery | — | 1 |
| 12552 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 8 |
| 12523 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 4 |
| 12524 | 2026-06-05 | consumer-enabling | ci-test-infra | — | 4 |
| 12530 | 2026-06-04 | consumer-direct:now | agent-cloud | — | 6 |
| 12512 | 2026-06-04 | internal-only | docs-internal | — | 8 |
| 12521 | 2026-06-04 | internal-only | docs-internal | — | 4 |
| 12502 | 2026-06-04 | consumer-enabling | ci-test-infra | — | 8 |
| 12525 | 2026-06-04 | consumer-enabling | skill-machinery | — | 2 |
| 12516 | 2026-06-04 | consumer-direct:now | agent-cloud | — | 4 |
| 12510 | 2026-06-04 | consumer-enabling | ci-test-infra | — | 5 |
| 12507 | 2026-06-04 | consumer-enabling | skill-machinery | — | 1 |
| 12505 | 2026-06-04 | consumer-direct:now | mcp-runtime | — | 3 |
| 12503 | 2026-06-04 | consumer-enabling | skill-machinery | — | 2 |
| 12500 | 2026-06-04 | consumer-enabling | ci-test-infra | — | 4 |
| 12520 | 2026-06-04 | consumer-enabling | ci-test-infra | — | 13 |
| 12498 | 2026-06-04 | internal-only | docs-internal | — | 2 |
| 12497 | 2026-06-04 | consumer-enabling | ci-test-infra | — | 3 |
| 12494 | 2026-06-04 | consumer-enabling | ci-test-infra | — | 4 |
| 12492 | 2026-06-04 | consumer-enabling | skill-machinery | — | 2 |
| 12490 | 2026-06-04 | consumer-enabling | skill-machinery | — | 2 |
| 12489 | 2026-06-04 | consumer-enabling | ci-test-infra | — | 7 |
| 12484 | 2026-06-04 | consumer-enabling | skill-machinery | — | 2 |
| 12485 | 2026-06-04 | consumer-enabling | ci-test-infra | — | 3 |
| 12481 | 2026-06-04 | consumer-enabling | ci-test-infra | — | 6 |
| 12482 | 2026-06-04 | consumer-enabling | skill-machinery | — | 2 |
| 12478 | 2026-06-04 | consumer-enabling | skill-machinery | — | 1 |
| 12475 | 2026-06-04 | consumer-enabling | skill-machinery | — | 2 |
| 12470 | 2026-06-04 | consumer-enabling | ci-test-infra | — | 2 |
| 12471 | 2026-06-04 | consumer-enabling | ci-test-infra | — | 13 |
| 12472 | 2026-06-04 | consumer-enabling | ci-test-infra | — | 4 |
| 12469 | 2026-06-04 | consumer-enabling | skill-machinery | — | 11 |
| 12466 | 2026-06-04 | consumer-direct:now | agent-cloud | — | 1 |
| 12463 | 2026-06-04 | consumer-direct:now | agent-cloud | — | 1 |
| 12458 | 2026-06-04 | internal-only | docs-internal | — | 3 |
| 12460 | 2026-06-04 | consumer-direct:now | agent-cloud | — | 1 |
| 12431 | 2026-06-03 | internal-only | docs-internal | — | 1 |
| 12404 | 2026-06-03 | consumer-enabling | skill-machinery | — | 1 |
| 12433 | 2026-06-03 | consumer-enabling | ci-test-infra | — | 4 |
| 12414 | 2026-06-03 | consumer-enabling | ci-test-infra | — | 3 |
| 12421 | 2026-06-03 | consumer-direct:now | mcp-runtime | — | 3 |
| 12405 | 2026-06-03 | consumer-enabling | ci-test-infra | — | 7 |
| 12395 | 2026-06-03 | consumer-enabling | ci-test-infra | — | 11 |
| 12396 | 2026-06-03 | consumer-enabling | ci-test-infra | — | 4 |
| 12426 | 2026-06-03 | consumer-enabling | ci-test-infra | — | 1 |
| 12424 | 2026-06-03 | consumer-direct:now | agent-cloud | — | 2 |
| 12428 | 2026-06-03 | consumer-enabling | ci-test-infra | — | 2 |
| 12427 | 2026-06-03 | consumer-enabling | skill-machinery | — | 5 |
| 12415 | 2026-06-03 | consumer-enabling | ci-test-infra | — | 6 |
| 12411 | 2026-06-03 | internal-only | docs-internal | — | 1 |
| 12403 | 2026-06-03 | consumer-enabling | ci-test-infra | — | 2 |
| 12400 | 2026-06-03 | consumer-enabling | ci-test-infra | — | 2 |
| 12409 | 2026-06-03 | consumer-enabling | ci-test-infra | — | 2 |
| 12399 | 2026-06-03 | consumer-direct:now | agent-cloud | — | 5 |
| 12397 | 2026-06-03 | consumer-enabling | ci-test-infra | — | 8 |
| 12398 | 2026-06-03 | consumer-enabling | ci-test-infra | — | 5 |
| 12393 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 8 |
| 12392 | 2026-06-02 | internal-only | docs-internal | — | 2 |
| 12389 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 2 |
| 12388 | 2026-06-02 | consumer-direct:now | mcp-runtime | — | 2 |
| 12369 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 6 |
| 12368 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 3 |
| 12374 | 2026-06-02 | consumer-enabling | skill-machinery | — | 2 |
| 12372 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 1 |
| 12387 | 2026-06-02 | internal-only | docs-internal | — | 2 |
| 12384 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 2 |
| 12386 | 2026-06-02 | internal-only | docs-internal | — | 3 |
| 12385 | 2026-06-02 | internal-only | docs-internal | — | 2 |
| 12383 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 6 |
| 12376 | 2026-06-02 | internal-only | docs-internal | — | 1 |
| 12373 | 2026-06-02 | consumer-direct:now | mcp-runtime | — | 5 |
| 12338 | 2026-06-02 | consumer-enabling | skill-machinery | — | 1 |
| 12366 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 4 |
| 12363 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 1 |
| 12364 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 1 |
| 12362 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 1 |
| 12361 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 1 |
| 12360 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 3 |
| 12359 | 2026-06-02 | consumer-direct:now | mcp-runtime | — | 2 |
| 12358 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 1 |
| 12357 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 1 |
| 12356 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 1 |
| 12355 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 1 |
| 12354 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 2 |
| 12353 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 1 |
| 12352 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 1 |
| 12351 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 1 |
| 12350 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 1 |
| 12349 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 1 |
| 12348 | 2026-06-02 | consumer-direct:now | agent-cloud | — | 1 |
| 12347 | 2026-06-02 | consumer-direct:now | agent-cloud | — | 1 |
| 12346 | 2026-06-02 | consumer-direct:now | agent-cloud | — | 1 |
| 12345 | 2026-06-02 | consumer-direct:now | agent-cloud | — | 1 |
| 12344 | 2026-06-02 | consumer-direct:now | agent-cloud | — | 4 |
| 12343 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 3 |
| 12342 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 2 |
| 12340 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 1 |
| 12339 | 2026-06-02 | consumer-enabling | skill-machinery | — | 1 |
| 12341 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 1 |
| 12337 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 6 |
| 12336 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 4 |
| 12333 | 2026-06-02 | consumer-direct:now | app-engine | — | 8 |
| 12330 | 2026-06-02 | consumer-direct:now | app-engine | — | 1 |
| 12327 | 2026-06-02 | consumer-enabling | ci-test-infra | — | 2 |
| 12326 | 2026-06-01 | consumer-enabling | ci-test-infra | — | 2 |
| 12324 | 2026-06-01 | internal-only | portal-internal | — | 8 |
| 12323 | 2026-06-01 | internal-only | portal-internal | — | 12 |
| 12320 | 2026-06-01 | internal-only | portal-internal | — | 3 |
| 12318 | 2026-06-01 | internal-only | portal-internal | — | 7 |
| 12316 | 2026-06-01 | internal-only | portal-internal | — | 3 |
| 12313 | 2026-06-01 | consumer-direct:now | app-engine | — | 8 |
| 12311 | 2026-06-01 | consumer-enabling | ci-test-infra | — | 4 |
| 12310 | 2026-06-01 | consumer-enabling | ci-test-infra | — | 4 |
| 12307 | 2026-06-01 | internal-only | portal-internal | — | 6 |
| 12306 | 2026-06-01 | internal-only | portal-internal | — | 4 |
| 12308 | 2026-06-01 | consumer-enabling | ci-test-infra | — | 6 |
| 12301 | 2026-06-01 | internal-only | portal-internal | — | 152 |
| 12299 | 2026-06-01 | consumer-enabling | ci-test-infra | — | 3 |
| 12303 | 2026-06-01 | internal-only | docs-internal | — | 5 |
| 12298 | 2026-06-01 | consumer-direct:now | app-engine | — | 4 |
| 12295 | 2026-06-01 | consumer-enabling | ci-test-infra | — | 3 |
| 12287 | 2026-06-01 | internal-only | portal-internal | — | 13 |
| 12292 | 2026-06-01 | internal-only | portal-internal | — | 7 |
| 12293 | 2026-06-01 | consumer-enabling | ci-test-infra | — | 4 |
| 12291 | 2026-06-01 | consumer-direct:now | agent-cloud | — | 6 |
| 12288 | 2026-06-01 | internal-only | portal-internal | — | 15 |
| 12282 | 2026-06-01 | consumer-direct:now | agent-cloud | — | 6 |
| 12280 | 2026-06-01 | internal-only | docs-internal | — | 5 |
| 12284 | 2026-06-01 | consumer-enabling | skill-machinery | — | 3 |
| 12283 | 2026-06-01 | consumer-enabling | skill-machinery | — | 9 |
| 12279 | 2026-06-01 | consumer-direct:now | app-engine | — | 7 |
| 12274 | 2026-06-01 | consumer-enabling | ci-test-infra | — | 11 |
| 12277 | 2026-06-01 | consumer-enabling | skill-machinery | — | 3 |
| 12278 | 2026-06-01 | consumer-enabling | ci-test-infra | — | 2 |
| 12275 | 2026-06-01 | consumer-enabling | ci-test-infra | — | 2 |
| 12273 | 2026-05-31 | consumer-enabling | ci-test-infra | — | 7 |
| 12271 | 2026-05-31 | internal-only | portal-internal | — | 1036 |
| 12272 | 2026-05-31 | consumer-enabling | skill-machinery | — | 19 |
| 12269 | 2026-05-31 | consumer-enabling | ci-test-infra | — | 3 |
| 12268 | 2026-05-31 | internal-only | portal-internal | — | 95 |
| 12267 | 2026-05-31 | consumer-enabling | ci-test-infra | — | 4 |
| 12266 | 2026-05-31 | internal-only | portal-internal | — | 2 |
| 12263 | 2026-05-31 | consumer-direct:now | agent-cloud | — | 6 |
| 12162 | 2026-05-31 | consumer-enabling | ci-test-infra | — | 13 |
| 12261 | 2026-05-31 | consumer-enabling | ci-test-infra | — | 3 |
| 12260 | 2026-05-31 | consumer-enabling | ci-test-infra | — | 2 |
| 12257 | 2026-05-31 | internal-only | docs-internal | — | 1 |
| 12258 | 2026-05-31 | consumer-enabling | ci-test-infra | — | 2 |
| 12252 | 2026-05-31 | internal-only | docs-internal | — | 1 |
| 12254 | 2026-05-31 | consumer-enabling | ci-test-infra | — | 2 |
| 12125 | 2026-05-31 | consumer-enabling | ci-test-infra | — | 3 |
| 12249 | 2026-05-31 | consumer-enabling | ci-test-infra | — | 7 |
| 12248 | 2026-05-31 | consumer-enabling | ci-test-infra | — | 4 |
| 12246 | 2026-05-31 | consumer-enabling | ci-test-infra | — | 1 |
| 12245 | 2026-05-31 | consumer-enabling | ci-test-infra | — | 16 |
| 12243 | 2026-05-31 | internal-only | docs-internal | — | 1 |
| 12242 | 2026-05-31 | consumer-enabling | ci-test-infra | — | 1 |
| 12240 | 2026-05-31 | internal-only | docs-internal | — | 2 |
| 12239 | 2026-05-31 | consumer-enabling | ci-test-infra | — | 1 |
| 12238 | 2026-05-31 | internal-only | docs-internal | — | 6 |
| 12237 | 2026-05-31 | internal-only | portal-internal | — | 4 |
| 12212 | 2026-05-31 | consumer-enabling | skill-machinery | — | 10 |
| 12233 | 2026-05-31 | internal-only | portal-internal | — | 3 |
| 12224 | 2026-05-30 | internal-only | portal-internal | — | 3 |
| 12223 | 2026-05-30 | consumer-enabling | skill-machinery | — | 1 |
| 12222 | 2026-05-30 | internal-only | portal-internal | — | 4 |
| 12221 | 2026-05-30 | internal-only | portal-internal | — | 3 |
| 12202 | 2026-05-30 | consumer-enabling | ci-test-infra | — | 5 |
| 12201 | 2026-05-30 | internal-only | docs-internal | — | 4146 |
| 12200 | 2026-05-30 | consumer-enabling | ci-test-infra | — | 2 |
| 12196 | 2026-05-30 | consumer-enabling | ci-test-infra | — | 4 |
| 12195 | 2026-05-30 | consumer-enabling | ci-test-infra | — | 2 |
| 12193 | 2026-05-30 | consumer-enabling | ci-test-infra | — | 5 |
| 12192 | 2026-05-30 | consumer-enabling | ci-test-infra | — | 7 |
| 12189 | 2026-05-30 | consumer-direct:now | agent-cloud | — | 3 |
| 12187 | 2026-05-30 | consumer-enabling | skill-machinery | — | 10 |
| 12185 | 2026-05-30 | consumer-enabling | skill-machinery | — | 19 |
| 12183 | 2026-05-30 | consumer-direct:now | agent-cloud | — | 2 |
| 12182 | 2026-05-29 | consumer-enabling | skill-machinery | — | 2 |
| 12179 | 2026-05-29 | consumer-enabling | ci-test-infra | — | 10 |
| 12181 | 2026-05-29 | consumer-enabling | ci-test-infra | — | 4 |
| 12178 | 2026-05-29 | internal-only | portal-internal | — | 4 |
| 12174 | 2026-05-29 | consumer-direct:now | app-engine | — | 2 |
| 12172 | 2026-05-29 | consumer-enabling | ci-test-infra | — | 14 |
| 12171 | 2026-05-29 | consumer-direct:now | app-engine | — | 2 |
| 12169 | 2026-05-29 | consumer-direct:now | mcp-runtime | — | 2 |
| 12164 | 2026-05-29 | consumer-enabling | ci-test-infra | — | 17 |
| 12160 | 2026-05-29 | consumer-enabling | ci-test-infra | — | 4 |
| 12159 | 2026-05-29 | internal-only | docs-internal | — | 3 |
| 12152 | 2026-05-29 | consumer-enabling | ci-test-infra | — | 7 |
| 12151 | 2026-05-28 | consumer-direct:now | agent-cloud | — | 5 |
| 12149 | 2026-05-28 | consumer-direct:now | agent-cloud | — | 7 |
| 12148 | 2026-05-28 | consumer-enabling | ci-test-infra | — | 2 |
| 12146 | 2026-05-28 | internal-only | docs-internal | — | 10 |
| 12144 | 2026-05-28 | consumer-enabling | ci-test-infra | — | 2 |
| 12141 | 2026-05-28 | consumer-enabling | ci-test-infra | — | 2 |
| 12137 | 2026-05-28 | consumer-direct:now | agent-cloud | — | 4 |
| 12134 | 2026-05-28 | consumer-direct:now | app-engine | — | 3 |
| 12129 | 2026-05-28 | internal-only | docs-internal | — | 1 |
| 12128 | 2026-05-28 | consumer-enabling | ci-test-infra | — | 3 |
| 12127 | 2026-05-28 | consumer-enabling | skill-machinery | — | 2 |
| 12124 | 2026-05-28 | consumer-enabling | ci-test-infra | — | 3 |
| 12122 | 2026-05-28 | consumer-enabling | ci-test-infra | — | 11 |
| 12121 | 2026-05-28 | consumer-enabling | ci-test-infra | — | 2 |
| 12120 | 2026-05-28 | internal-only | docs-internal | — | 4 |
| 12119 | 2026-05-28 | consumer-enabling | ci-test-infra | — | 5 |
| 12118 | 2026-05-28 | consumer-enabling | ci-test-infra | — | 10 |
| 12115 | 2026-05-28 | consumer-enabling | ci-test-infra | — | 8 |
| 12113 | 2026-05-27 | consumer-enabling | ci-test-infra | — | 3 |
| 12112 | 2026-05-27 | consumer-enabling | ci-test-infra | — | 11 |
| 12110 | 2026-05-27 | consumer-enabling | ci-test-infra | — | 5 |
| 12098 | 2026-05-27 | consumer-enabling | ci-test-infra | — | 8 |
| 12099 | 2026-05-27 | consumer-enabling | ci-test-infra | — | 9 |
| 12096 | 2026-05-27 | consumer-direct:now | agent-cloud | — | 4 |
| 12095 | 2026-05-27 | consumer-enabling | ci-test-infra | — | 6 |
| 12092 | 2026-05-27 | consumer-enabling | ci-test-infra | — | 7 |
| 12093 | 2026-05-27 | consumer-enabling | ci-test-infra | — | 23 |
| 12086 | 2026-05-27 | consumer-enabling | ci-test-infra | — | 8 |
| 12085 | 2026-05-27 | consumer-direct:now | agent-cloud | — | 2 |
| 12083 | 2026-05-27 | consumer-enabling | ci-test-infra | — | 2 |
| 12082 | 2026-05-27 | consumer-enabling | ci-test-infra | — | 2 |
| 12079 | 2026-05-27 | consumer-enabling | ci-test-infra | — | 3 |
| 12077 | 2026-05-27 | internal-only | docs-internal | — | 1 |
| 12076 | 2026-05-27 | consumer-enabling | ci-test-infra | — | 6 |
| 12064 | 2026-05-27 | consumer-enabling | ci-test-infra | — | 3 |
| 12060 | 2026-05-27 | consumer-enabling | ci-test-infra | — | 2 |
| 12058 | 2026-05-27 | consumer-enabling | skill-machinery | — | 2 |
| 12061 | 2026-05-27 | consumer-enabling | ci-test-infra | — | 14 |
| 12057 | 2026-05-27 | consumer-direct:now | mcp-runtime | — | 8 |
| 12056 | 2026-05-27 | consumer-direct:now | agent-cloud | — | 1 |
| 12053 | 2026-05-27 | internal-only | docs-internal | — | 1 |
| 12054 | 2026-05-27 | consumer-enabling | ci-test-infra | — | 2 |
| 12050 | 2026-05-26 | consumer-direct:now | agent-cloud | — | 6 |
| 12043 | 2026-05-26 | consumer-enabling | ci-test-infra | — | 2 |
| 12045 | 2026-05-26 | consumer-enabling | ci-test-infra | — | 5 |
| 12044 | 2026-05-26 | consumer-enabling | ci-test-infra | — | 1 |
| 12046 | 2026-05-26 | consumer-enabling | ci-test-infra | — | 3 |
| 12037 | 2026-05-26 | consumer-direct:now | agent-cloud | — | 2 |
| 12035 | 2026-05-26 | consumer-direct:now | mcp-runtime | — | 3 |
| 12041 | 2026-05-26 | consumer-enabling | ci-test-infra | — | 3 |
| 12031 | 2026-05-26 | consumer-direct:now | agent-cloud | — | 2 |
| 12030 | 2026-05-26 | consumer-enabling | ci-test-infra | — | 12 |
| 12020 | 2026-05-26 | internal-only | docs-internal | — | 1 |
| 12021 | 2026-05-26 | consumer-enabling | skill-machinery | — | 7 |
| 12027 | 2026-05-26 | consumer-direct:now | agent-cloud | — | 2 |
| 12011 | 2026-05-26 | consumer-enabling | ci-test-infra | — | 1 |
| 12010 | 2026-05-26 | consumer-enabling | ci-test-infra | — | 1 |
| 12009 | 2026-05-26 | consumer-enabling | ci-test-infra | — | 6 |
| 12006 | 2026-05-26 | consumer-direct:now | agent-cloud | — | 5 |
| 12004 | 2026-05-26 | consumer-enabling | ci-test-infra | — | 4 |
| 12002 | 2026-05-26 | consumer-enabling | ci-test-infra | — | 2 |
| 12001 | 2026-05-26 | consumer-enabling | ci-test-infra | — | 2 |
| 12000 | 2026-05-26 | consumer-enabling | ci-test-infra | — | 3 |
| 11999 | 2026-05-26 | consumer-enabling | ci-test-infra | — | 7 |
| 11997 | 2026-05-25 | consumer-direct:now | agent-cloud | — | 2 |
| 11998 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 5 |
| 11991 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 10 |
| 11989 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 3 |
| 11987 | 2026-05-25 | consumer-direct:now | agent-cloud | — | 6 |
| 11988 | 2026-05-25 | consumer-direct:now | app-engine | — | 10 |
| 11985 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 4 |
| 11984 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 21 |
| 11980 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 3 |
| 11979 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 3 |
| 11978 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 4 |
| 11972 | 2026-05-25 | consumer-enabling | skill-machinery | — | 6 |
| 11971 | 2026-05-25 | consumer-direct:now | agent-cloud | — | 1 |
| 11975 | 2026-05-25 | consumer-enabling | skill-machinery | — | 3 |
| 11974 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 2 |
| 11970 | 2026-05-25 | consumer-direct:now | agent-cloud | — | 3 |
| 11969 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 18 |
| 11967 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 6 |
| 11959 | 2026-05-25 | consumer-direct:now | agent-cloud | — | 13 |
| 11958 | 2026-05-25 | consumer-direct:now | agent-cloud | — | 2 |
| 11957 | 2026-05-25 | consumer-direct:now | agent-cloud | — | 6 |
| 11956 | 2026-05-25 | internal-only | docs-internal | — | 7 |
| 11953 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 3 |
| 11951 | 2026-05-25 | internal-only | docs-internal | — | 4 |
| 11946 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 1 |
| 11945 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 1 |
| 11940 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 9 |
| 11941 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 12 |
| 11949 | 2026-05-25 | consumer-direct:now | mcp-runtime | — | 10 |
| 11947 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 3 |
| 11944 | 2026-05-25 | consumer-enabling | skill-machinery | — | 5 |
| 11943 | 2026-05-25 | consumer-direct:now | mcp-runtime | — | 2 |
| 11935 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 5 |
| 11939 | 2026-05-25 | consumer-direct:now | agent-cloud | — | 1 |
| 11938 | 2026-05-25 | consumer-enabling | ci-test-infra | — | 5 |
| 11936 | 2026-05-25 | consumer-enabling | skill-machinery | — | 3 |
| 11929 | 2026-05-25 | consumer-enabling | skill-machinery | — | 1 |
| 11928 | 2026-05-25 | consumer-enabling | skill-machinery | — | 4 |
| 11933 | 2026-05-24 | consumer-enabling | skill-machinery | — | 3 |
| 11932 | 2026-05-24 | consumer-enabling | skill-machinery | — | 4 |
| 11931 | 2026-05-24 | consumer-enabling | skill-machinery | — | 3 |
| 11927 | 2026-05-24 | consumer-enabling | skill-machinery | — | 3 |
| 11926 | 2026-05-24 | consumer-enabling | ci-test-infra | — | 34 |
| 11921 | 2026-05-24 | consumer-enabling | ci-test-infra | — | 4 |
| 11920 | 2026-05-24 | consumer-enabling | skill-machinery | — | 1 |
| 11919 | 2026-05-24 | consumer-enabling | ci-test-infra | — | 10 |
| 11917 | 2026-05-24 | consumer-direct:now | agent-cloud | — | 11 |
| 11918 | 2026-05-24 | consumer-direct:now | agent-cloud | — | 2 |
| 11916 | 2026-05-24 | consumer-enabling | ci-test-infra | — | 4 |
| 11914 | 2026-05-24 | consumer-direct:now | agent-cloud | — | 3 |
| 11913 | 2026-05-24 | consumer-direct:now | agent-cloud | — | 6 |
| 11915 | 2026-05-24 | consumer-enabling | ci-test-infra | — | 3 |
| 11910 | 2026-05-24 | consumer-enabling | skill-machinery | — | 2 |
| 11911 | 2026-05-24 | consumer-enabling | skill-machinery | — | 1 |
| 11901 | 2026-05-24 | consumer-direct:now | agent-cloud | — | 6 |
| 11898 | 2026-05-24 | consumer-enabling | skill-machinery | — | 2 |
| 11897 | 2026-05-24 | consumer-enabling | skill-machinery | — | 3 |
| 11896 | 2026-05-24 | consumer-enabling | skill-machinery | — | 1 |
| 11894 | 2026-05-24 | consumer-enabling | skill-machinery | — | 7 |
| 11879 | 2026-05-24 | consumer-direct:now | mcp-runtime | — | 12 |
| 11881 | 2026-05-24 | consumer-enabling | ci-test-infra | — | 4 |
| 11877 | 2026-05-24 | consumer-direct:now | agent-cloud | — | 3 |
| 11880 | 2026-05-24 | consumer-enabling | ci-test-infra | — | 5 |
| 11883 | 2026-05-24 | consumer-enabling | skill-machinery | — | 4 |
| 11876 | 2026-05-24 | consumer-direct:now | agent-cloud | — | 16 |
| 11839 | 2026-05-24 | internal-only | docs-internal | — | 1 |
| 11875 | 2026-05-24 | internal-only | docs-internal | — | 4 |
| 11868 | 2026-05-23 | consumer-enabling | ci-test-infra | — | 5 |
| 11867 | 2026-05-23 | consumer-enabling | ci-test-infra | — | 5 |
| 11865 | 2026-05-23 | consumer-direct:now | agent-cloud | — | 2 |
| 11863 | 2026-05-23 | consumer-direct:now | agent-cloud | — | 2 |
| 11853 | 2026-05-23 | consumer-enabling | ci-test-infra | — | 79 |
| 11851 | 2026-05-23 | consumer-enabling | ci-test-infra | — | 36 |
| 11850 | 2026-05-23 | consumer-enabling | ci-test-infra | — | 23 |
| 11849 | 2026-05-23 | consumer-enabling | ci-test-infra | — | 35 |
| 11843 | 2026-05-23 | consumer-enabling | ci-test-infra | — | 4 |
| 11842 | 2026-05-23 | consumer-enabling | ci-test-infra | — | 8 |
| 11841 | 2026-05-23 | consumer-enabling | ci-test-infra | — | 2 |
| 11838 | 2026-05-23 | consumer-direct:now | app-engine | — | 3 |
| 11820 | 2026-05-23 | consumer-direct:now | mcp-runtime | — | 1 |
| 11818 | 2026-05-23 | consumer-enabling | skill-machinery | — | 1 |
| 11815 | 2026-05-23 | consumer-enabling | ci-test-infra | — | 6 |
| 11814 | 2026-05-23 | consumer-enabling | skill-machinery | — | 1 |
| 11813 | 2026-05-23 | consumer-direct:now | agent-cloud | — | 2 |
| 11809 | 2026-05-23 | consumer-enabling | skill-machinery | — | 1 |
| 11808 | 2026-05-23 | consumer-enabling | skill-machinery | — | 2 |
| 11805 | 2026-05-23 | consumer-enabling | skill-machinery | — | 2 |
| 11810 | 2026-05-23 | consumer-enabling | skill-machinery | — | 1 |
| 11804 | 2026-05-23 | consumer-enabling | ci-test-infra | — | 4 |
| 11794 | 2026-05-23 | internal-only | docs-internal | — | 1 |
| 11786 | 2026-05-22 | consumer-enabling | skill-machinery | — | 14 |
| 11784 | 2026-05-22 | consumer-enabling | ci-test-infra | — | 2 |
| 11781 | 2026-05-22 | consumer-enabling | skill-machinery | — | 1 |
| 11779 | 2026-05-22 | internal-only | docs-internal | — | 3 |
| 11776 | 2026-05-22 | consumer-enabling | ci-test-infra | — | 3 |
| 11777 | 2026-05-22 | internal-only | docs-internal | — | 5 |
| 11769 | 2026-05-22 | consumer-enabling | ci-test-infra | — | 2 |
| 11774 | 2026-05-22 | consumer-direct:now | agent-cloud | — | 3 |
| 11773 | 2026-05-22 | consumer-enabling | skill-machinery | — | 10 |
| 11772 | 2026-05-22 | consumer-enabling | ci-test-infra | — | 31 |
| 11765 | 2026-05-22 | internal-only | docs-internal | — | 2 |
| 11764 | 2026-05-22 | consumer-enabling | ci-test-infra | — | 2 |
| 11763 | 2026-05-22 | consumer-enabling | skill-machinery | — | 3 |
| 11762 | 2026-05-22 | consumer-enabling | ci-test-infra | — | 5 |
| 11760 | 2026-05-22 | consumer-enabling | ci-test-infra | — | 1 |
| 11761 | 2026-05-22 | consumer-enabling | ci-test-infra | — | 8 |
| 11759 | 2026-05-22 | internal-only | docs-internal | — | 3 |
| 11758 | 2026-05-22 | consumer-direct:now | agent-cloud | — | 3 |
| 11757 | 2026-05-22 | consumer-enabling | ci-test-infra | — | 1 |
| 11755 | 2026-05-22 | consumer-enabling | ci-test-infra | — | 4 |
| 11754 | 2026-05-22 | consumer-enabling | skill-machinery | — | 1 |
| 11751 | 2026-05-22 | consumer-enabling | ci-test-infra | — | 5 |
| 11753 | 2026-05-22 | internal-only | docs-internal | — | 5 |
| 11749 | 2026-05-22 | internal-only | docs-internal | — | 7 |
| 11750 | 2026-05-22 | consumer-enabling | ci-test-infra | — | 6 |
| 11747 | 2026-05-22 | consumer-direct:now | agent-cloud | — | 4 |
| 11745 | 2026-05-22 | consumer-enabling | ci-test-infra | — | 5 |
| 11746 | 2026-05-22 | consumer-enabling | ci-test-infra | — | 7 |
| 11742 | 2026-05-22 | internal-only | docs-internal | — | 7 |
| 11748 | 2026-05-22 | internal-only | docs-internal | — | 1 |
| 11741 | 2026-05-22 | consumer-direct:now | agent-cloud | — | 2 |
| 11739 | 2026-05-21 | consumer-enabling | ci-test-infra | — | 11 |
| 11737 | 2026-05-21 | internal-only | docs-internal | — | 6 |
| 11738 | 2026-05-21 | internal-only | docs-internal | — | 1 |
| 11717 | 2026-05-21 | consumer-enabling | ci-test-infra | — | 2 |
| 11715 | 2026-05-21 | consumer-enabling | ci-test-infra | — | 7 |
| 11714 | 2026-05-21 | consumer-enabling | ci-test-infra | — | 9 |
| 11713 | 2026-05-21 | consumer-enabling | ci-test-infra | — | 2 |
| 11710 | 2026-05-21 | consumer-enabling | ci-test-infra | — | 7 |
| 11707 | 2026-05-21 | internal-only | docs-internal | — | 14 |
| 11709 | 2026-05-21 | consumer-enabling | ci-test-infra | — | 8 |
| 11708 | 2026-05-21 | consumer-enabling | ci-test-infra | — | 3 |
| 11703 | 2026-05-21 | consumer-enabling | ci-test-infra | — | 7 |
| 11700 | 2026-05-21 | consumer-enabling | ci-test-infra | — | 32 |
| 11702 | 2026-05-21 | consumer-direct:now | app-engine | — | 2 |
| 11704 | 2026-05-21 | consumer-enabling | ci-test-infra | — | 7 |
| 11699 | 2026-05-21 | consumer-enabling | ci-test-infra | — | 9 |
| 11697 | 2026-05-21 | consumer-enabling | ci-test-infra | — | 6 |
| 11696 | 2026-05-21 | consumer-enabling | ci-test-infra | — | 3 |
| 11695 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 3 |
| 11694 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 5 |
| 11692 | 2026-05-20 | consumer-enabling | skill-machinery | — | 2 |
| 11689 | 2026-05-20 | consumer-direct:now | mcp-runtime | — | 2 |
| 11688 | 2026-05-20 | consumer-direct:now | mcp-runtime | — | 4 |
| 11686 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 8 |
| 11684 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 6 |
| 11681 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 4 |
| 11678 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 4 |
| 11675 | 2026-05-20 | consumer-enabling | skill-machinery | — | 1 |
| 11674 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 4 |
| 11673 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 3 |
| 11670 | 2026-05-20 | consumer-enabling | skill-machinery | — | 2 |
| 11672 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 2 |
| 11661 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 12 |
| 11662 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 5 |
| 11666 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 7 |
| 11667 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 3 |
| 11664 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 3 |
| 11668 | 2026-05-20 | internal-only | docs-internal | — | 4 |
| 11659 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 5 |
| 11657 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 2 |
| 11656 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 8 |
| 11655 | 2026-05-20 | consumer-enabling | ci-test-infra | — | 3 |
| 11651 | 2026-05-19 | consumer-enabling | ci-test-infra | — | 2 |
| 11648 | 2026-05-19 | consumer-enabling | ci-test-infra | — | 8 |
| 11647 | 2026-05-19 | consumer-enabling | ci-test-infra | — | 6 |
| 11622 | 2026-05-19 | consumer-enabling | ci-test-infra | — | 6 |
| 11621 | 2026-05-19 | consumer-enabling | skill-machinery | — | 2 |
| 11620 | 2026-05-19 | consumer-enabling | skill-machinery | — | 1 |
| 11618 | 2026-05-19 | consumer-enabling | ci-test-infra | — | 9 |
| 11616 | 2026-05-19 | consumer-enabling | ci-test-infra | — | 2 |
| 11615 | 2026-05-19 | consumer-enabling | ci-test-infra | — | 8 |
| 11614 | 2026-05-19 | consumer-enabling | skill-machinery | — | 3 |
| 11613 | 2026-05-19 | consumer-enabling | ci-test-infra | — | 9 |
| 11612 | 2026-05-19 | consumer-enabling | skill-machinery | — | 6 |
| 11606 | 2026-05-19 | internal-only | docs-internal | — | 4 |
| 11607 | 2026-05-19 | consumer-enabling | ci-test-infra | — | 4 |
| 11611 | 2026-05-19 | consumer-direct:now | app-engine | — | 2 |
| 11610 | 2026-05-19 | consumer-enabling | skill-machinery | — | 6 |
| 11600 | 2026-05-19 | consumer-enabling | skill-machinery | documentation, enhancement, ai, architecture, needs-re-triage, model-experience, Cross-substrate references rely on position; "swiss-cheese decay" under compaction (the original #11558 framing), **Self-documenting**: anchor IS the heading; no positional-tracking overhead | 2 |
| 11592 | 2026-05-18 | consumer-enabling | ci-test-infra | — | 2 |
| 11586 | 2026-05-18 | consumer-enabling | ci-test-infra | — | 2 |
| 11589 | 2026-05-18 | internal-only | docs-internal | — | 1 |
| 11587 | 2026-05-18 | consumer-enabling | ci-test-infra | — | 2 |
| 11583 | 2026-05-18 | consumer-enabling | ci-test-infra | — | 2 |
| 11579 | 2026-05-18 | consumer-enabling | ci-test-infra | — | 3 |
| 11581 | 2026-05-18 | consumer-enabling | ci-test-infra | — | 5 |
| 11575 | 2026-05-18 | consumer-enabling | ci-test-infra | — | 4 |
| 11571 | 2026-05-18 | consumer-enabling | skill-machinery | — | 3 |
| 11574 | 2026-05-18 | consumer-enabling | ci-test-infra | — | 5 |
| 11572 | 2026-05-18 | consumer-enabling | ci-test-infra | — | 4 |
| 11569 | 2026-05-18 | consumer-enabling | ci-test-infra | — | 2 |
| 11566 | 2026-05-18 | consumer-enabling | ci-test-infra | — | 1 |
| 11567 | 2026-05-18 | consumer-enabling | ci-test-infra | — | 1 |
| 11565 | 2026-05-18 | consumer-enabling | ci-test-infra | — | 5 |
| 11568 | 2026-05-18 | internal-only | docs-internal | — | 1 |
| 11555 | 2026-05-18 | consumer-enabling | ci-test-infra | — | 2 |
| 11553 | 2026-05-18 | consumer-enabling | ci-test-infra | — | 14 |
| 11450 | 2026-05-18 | consumer-enabling | ci-test-infra | — | 19 |
| 11550 | 2026-05-18 | consumer-enabling | skill-machinery | — | 1 |
| 11541 | 2026-05-18 | consumer-enabling | ci-test-infra | — | 12 |
| 11526 | 2026-05-17 | consumer-enabling | ci-test-infra | — | 8 |
| 11547 | 2026-05-17 | consumer-enabling | skill-machinery | — | 2 |
| 11551 | 2026-05-17 | consumer-enabling | skill-machinery | — | 13 |
| 11535 | 2026-05-17 | consumer-direct:now | mcp-runtime | — | 4 |
| 11545 | 2026-05-17 | internal-only | docs-internal | — | 3 |
| 11544 | 2026-05-17 | consumer-enabling | ci-test-infra | — | 14 |
| 11534 | 2026-05-17 | consumer-enabling | skill-machinery | — | 2 |
| 11543 | 2026-05-17 | consumer-enabling | skill-machinery | — | 1 |
| 11530 | 2026-05-17 | consumer-enabling | skill-machinery | — | 8 |
| 11528 | 2026-05-17 | consumer-enabling | ci-test-infra | — | 4 |
| 11527 | 2026-05-17 | consumer-enabling | ci-test-infra | — | 8 |
| 11525 | 2026-05-17 | consumer-enabling | ci-test-infra | — | 6 |
| 11475 | 2026-05-17 | consumer-enabling | ci-test-infra | — | 9 |
| 11521 | 2026-05-17 | consumer-enabling | ci-test-infra | — | 2 |
| 11514 | 2026-05-17 | consumer-direct:now | agent-cloud | — | 2 |
| 11522 | 2026-05-17 | consumer-enabling | ci-test-infra | — | 2 |
| 11517 | 2026-05-17 | consumer-enabling | ci-test-infra | — | 2 |
| 11518 | 2026-05-17 | consumer-enabling | ci-test-infra | — | 2 |
| 11509 | 2026-05-17 | consumer-enabling | ci-test-infra | — | 5 |
| 11512 | 2026-05-17 | consumer-direct:now | agent-cloud | — | 2 |
| 11510 | 2026-05-17 | consumer-enabling | ci-test-infra | — | 9 |
| 11502 | 2026-05-17 | consumer-enabling | ci-test-infra | — | 1 |
| 11506 | 2026-05-17 | consumer-enabling | ci-test-infra | — | 3 |
| 11494 | 2026-05-17 | consumer-enabling | ci-test-infra | — | 3 |
| 11490 | 2026-05-17 | consumer-enabling | ci-test-infra | — | 5 |
| 11498 | 2026-05-17 | consumer-enabling | ci-test-infra | — | 1 |
| 11499 | 2026-05-16 | consumer-direct:now | agent-cloud | — | 4 |
| 11489 | 2026-05-16 | consumer-direct:now | agent-cloud | — | 2 |
| 11488 | 2026-05-16 | consumer-enabling | ci-test-infra | — | 2 |
| 11485 | 2026-05-16 | consumer-enabling | skill-machinery | — | 4 |
| 11483 | 2026-05-16 | consumer-enabling | ci-test-infra | — | 2 |
| 11482 | 2026-05-16 | consumer-enabling | ci-test-infra | — | 2 |
| 11480 | 2026-05-16 | consumer-direct:now | mcp-runtime | — | 4 |
| 11479 | 2026-05-16 | consumer-direct:now | mcp-runtime | — | 1 |
| 11476 | 2026-05-16 | consumer-enabling | ci-test-infra | — | 2 |
| 11470 | 2026-05-16 | consumer-enabling | ci-test-infra | — | 2 |
| 11473 | 2026-05-16 | consumer-direct:now | agent-cloud | — | 2 |
| 11468 | 2026-05-16 | consumer-enabling | skill-machinery | — | 3 |
| 11460 | 2026-05-16 | consumer-enabling | ci-test-infra | — | 2 |
| 11466 | 2026-05-16 | consumer-enabling | skill-machinery | — | 3 |
| 11461 | 2026-05-16 | internal-only | docs-internal | — | 6678 |
| 11446 | 2026-05-16 | consumer-enabling | ci-test-infra | — | 2 |
| 11415 | 2026-05-16 | consumer-enabling | ci-test-infra | — | 4 |
| 11454 | 2026-05-16 | internal-only | docs-internal | — | 1 |
| 11439 | 2026-05-16 | internal-only | docs-internal | — | 1 |
| 11438 | 2026-05-16 | consumer-enabling | ci-test-infra | — | 4 |
| 11434 | 2026-05-16 | consumer-enabling | skill-machinery | — | 7 |
| 11428 | 2026-05-16 | internal-only | docs-internal | — | 4 |
| 11407 | 2026-05-16 | consumer-enabling | ci-test-infra | — | 13 |
| 11424 | 2026-05-16 | consumer-enabling | ci-test-infra | — | 33 |
| 11432 | 2026-05-15 | consumer-enabling | skill-machinery | — | 2 |
| 11421 | 2026-05-15 | consumer-enabling | skill-machinery | — | 2 |
| 11426 | 2026-05-15 | internal-only | docs-internal | — | 1 |
| 11409 | 2026-05-15 | consumer-enabling | ci-test-infra | — | 1 |
| 11403 | 2026-05-15 | consumer-enabling | ci-test-infra | — | 15 |
| 11392 | 2026-05-15 | internal-only | docs-internal | — | 67 |
| 11388 | 2026-05-15 | consumer-enabling | ci-test-infra | — | 8 |
| 11401 | 2026-05-15 | internal-only | docs-internal | — | 1 |
| 11399 | 2026-05-15 | consumer-enabling | ci-test-infra | — | 5 |
| 11398 | 2026-05-15 | internal-only | docs-internal | — | 1 |
| 11396 | 2026-05-15 | consumer-enabling | ci-test-infra | — | 2 |
| 11391 | 2026-05-15 | consumer-enabling | skill-machinery | — | 1 |
| 11381 | 2026-05-15 | consumer-enabling | ci-test-infra | — | 3 |
| 11394 | 2026-05-15 | consumer-enabling | ci-test-infra | — | 3 |
| 11387 | 2026-05-15 | consumer-enabling | ci-test-infra | — | 6 |
| 11382 | 2026-05-15 | consumer-direct:now | agent-cloud | — | 4 |
| 11386 | 2026-05-15 | consumer-enabling | skill-machinery | — | 5 |
| 11378 | 2026-05-15 | internal-only | docs-internal | — | 1 |
| 11366 | 2026-05-14 | consumer-enabling | dream-nightshift | — | 3 |
| 11371 | 2026-05-14 | internal-only | docs-internal | — | 1 |
| 11368 | 2026-05-14 | internal-only | docs-internal | — | 1 |
| 11362 | 2026-05-14 | internal-only | docs-internal | — | 3417 |
| 11357 | 2026-05-14 | consumer-enabling | skill-machinery | — | 3 |
| 11335 | 2026-05-14 | consumer-enabling | ci-test-infra | — | 7 |
| 11355 | 2026-05-14 | consumer-enabling | skill-machinery | — | 2 |
| 11356 | 2026-05-14 | consumer-enabling | skill-machinery | — | 6 |
| 11354 | 2026-05-14 | consumer-enabling | skill-machinery | — | 1 |
| 11343 | 2026-05-14 | consumer-enabling | skill-machinery | — | 3 |
| 11346 | 2026-05-14 | consumer-enabling | skill-machinery | — | 2 |
| 11338 | 2026-05-14 | consumer-enabling | skill-machinery | — | 1 |
| 11339 | 2026-05-14 | consumer-enabling | skill-machinery | — | 2 |
| 11340 | 2026-05-14 | consumer-enabling | ci-test-infra | — | 2 |
| 11333 | 2026-05-13 | consumer-enabling | ci-test-infra | — | 2 |
| 11324 | 2026-05-13 | consumer-enabling | ci-test-infra | — | 5 |
| 11327 | 2026-05-13 | consumer-enabling | ci-test-infra | — | 2 |
| 11329 | 2026-05-13 | consumer-direct:now | mcp-runtime | — | 2 |
| 11303 | 2026-05-13 | consumer-enabling | skill-machinery | — | 3 |
| 11304 | 2026-05-13 | consumer-enabling | ci-test-infra | — | 3 |
| 11302 | 2026-05-13 | consumer-direct:now | app-engine | — | 2 |
| 11299 | 2026-05-13 | consumer-enabling | ci-test-infra | — | 1 |
| 11301 | 2026-05-13 | internal-only | docs-internal | — | 202 |
| 11300 | 2026-05-13 | consumer-enabling | ci-test-infra | — | 4 |
| 11298 | 2026-05-13 | consumer-enabling | ci-test-infra | — | 2 |
| 11297 | 2026-05-13 | consumer-enabling | ci-test-infra | — | 5 |
| 11295 | 2026-05-13 | consumer-enabling | ci-test-infra | — | 5 |
| 11294 | 2026-05-13 | internal-only | docs-internal | — | 137 |
| 11296 | 2026-05-13 | consumer-enabling | ci-test-infra | — | 2 |
| 11289 | 2026-05-13 | consumer-enabling | ci-test-infra | — | 2 |
| 11293 | 2026-05-13 | consumer-enabling | ci-test-infra | — | 4 |
| 11280 | 2026-05-13 | consumer-enabling | skill-machinery | — | 1 |
| 11282 | 2026-05-13 | consumer-enabling | ci-test-infra | — | 2 |
| 11276 | 2026-05-13 | consumer-enabling | ci-test-infra | — | 8 |
| 11277 | 2026-05-13 | consumer-enabling | skill-machinery | — | 1 |
| 11278 | 2026-05-13 | consumer-enabling | ci-test-infra | — | 7 |
| 11279 | 2026-05-13 | consumer-enabling | skill-machinery | — | 1 |
| 11271 | 2026-05-12 | consumer-enabling | skill-machinery | — | 5 |
| 11263 | 2026-05-12 | consumer-enabling | skill-machinery | — | 1 |
| 11255 | 2026-05-12 | consumer-enabling | skill-machinery | — | 5 |
| 11251 | 2026-05-12 | consumer-enabling | ci-test-infra | — | 2 |
| 11249 | 2026-05-12 | consumer-enabling | skill-machinery | — | 3 |
| 11247 | 2026-05-12 | consumer-enabling | ci-test-infra | — | 2 |
| 11246 | 2026-05-12 | consumer-enabling | ci-test-infra | — | 2 |
| 11232 | 2026-05-12 | consumer-direct:now | mcp-runtime | — | 13 |
| 11234 | 2026-05-12 | consumer-enabling | ci-test-infra | — | 8 |
| 11228 | 2026-05-12 | consumer-enabling | dream-nightshift | — | 4 |
| 11244 | 2026-05-12 | consumer-enabling | skill-machinery | — | 6 |
| 11245 | 2026-05-12 | consumer-enabling | skill-machinery | — | 1 |
| 11230 | 2026-05-11 | consumer-enabling | skill-machinery | — | 1 |
| 11223 | 2026-05-11 | consumer-enabling | skill-machinery | — | 3 |
| 11226 | 2026-05-11 | consumer-enabling | ci-test-infra | — | 1 |
| 11222 | 2026-05-11 | consumer-enabling | skill-machinery | — | 1 |
| 11220 | 2026-05-11 | consumer-enabling | skill-machinery | — | 1 |
| 11219 | 2026-05-11 | consumer-enabling | skill-machinery | — | 3 |
| 11215 | 2026-05-11 | consumer-enabling | skill-machinery | — | 2 |
| 11208 | 2026-05-11 | consumer-enabling | skill-machinery | — | 1 |
| 11207 | 2026-05-11 | consumer-direct:now | mcp-runtime | — | 2 |
| 11203 | 2026-05-11 | consumer-enabling | skill-machinery | — | 1 |
| 11199 | 2026-05-11 | consumer-enabling | skill-machinery | — | 5 |
| 11193 | 2026-05-11 | consumer-enabling | ci-test-infra | — | 2 |
| 11191 | 2026-05-11 | consumer-direct:now | mcp-runtime | — | 3 |
| 11194 | 2026-05-11 | consumer-enabling | skill-machinery | — | 3 |
| 11200 | 2026-05-11 | consumer-enabling | ci-test-infra | — | 6 |
| 11186 | 2026-05-11 | consumer-enabling | skill-machinery | — | 2 |
| 11183 | 2026-05-11 | consumer-enabling | ci-test-infra | — | 2 |
| 11175 | 2026-05-11 | consumer-enabling | ci-test-infra | — | 10 |
| 11178 | 2026-05-11 | consumer-enabling | ci-test-infra | — | 5 |
| 11173 | 2026-05-11 | consumer-enabling | ci-test-infra | — | 1 |
| 11167 | 2026-05-11 | consumer-enabling | skill-machinery | — | 4 |
| 11170 | 2026-05-11 | consumer-enabling | ci-test-infra | — | 1 |
| 11166 | 2026-05-11 | consumer-enabling | skill-machinery | — | 1 |
| 11162 | 2026-05-11 | consumer-enabling | ci-test-infra | — | 3 |
| 11159 | 2026-05-11 | consumer-enabling | ci-test-infra | — | 1 |
| 11158 | 2026-05-11 | consumer-direct:now | mcp-runtime | — | 1 |
| 11157 | 2026-05-11 | consumer-enabling | skill-machinery | — | 2 |
| 11149 | 2026-05-10 | consumer-direct:now | mcp-runtime | — | 2 |
| 11151 | 2026-05-10 | consumer-enabling | ci-test-infra | — | 3 |
| 11143 | 2026-05-10 | consumer-enabling | ci-test-infra | — | 4 |
| 11146 | 2026-05-10 | consumer-enabling | ci-test-infra | — | 3 |
| 11142 | 2026-05-10 | consumer-enabling | ci-test-infra | — | 4 |
| 11137 | 2026-05-10 | consumer-enabling | skill-machinery | — | 2 |
| 11139 | 2026-05-10 | consumer-enabling | skill-machinery | — | 1 |
| 11130 | 2026-05-10 | consumer-enabling | ci-test-infra | — | 9 |
| 11129 | 2026-05-10 | consumer-enabling | ci-test-infra | — | 5 |
| 11127 | 2026-05-10 | consumer-enabling | skill-machinery | — | 1 |
| 11125 | 2026-05-10 | internal-only | docs-internal | — | 56 |
| 11114 | 2026-05-10 | internal-only | docs-internal | — | 4182 |
| 11109 | 2026-05-10 | consumer-enabling | ci-test-infra | — | 2 |
| 11106 | 2026-05-10 | consumer-enabling | skill-machinery | — | 4 |
| 11104 | 2026-05-10 | consumer-enabling | skill-machinery | — | 1 |
| 11101 | 2026-05-10 | consumer-enabling | ci-test-infra | — | 7 |
| 11100 | 2026-05-10 | consumer-enabling | skill-machinery | — | 4 |
| 11098 | 2026-05-10 | consumer-enabling | skill-machinery | — | 2 |
| 11096 | 2026-05-10 | consumer-enabling | ci-test-infra | — | 5 |
| 11095 | 2026-05-10 | consumer-enabling | skill-machinery | — | 3 |
| 11097 | 2026-05-10 | consumer-enabling | skill-machinery | — | 2 |
| 11088 | 2026-05-10 | consumer-enabling | ci-test-infra | — | 4 |
| 11087 | 2026-05-10 | consumer-direct:now | agent-cloud | — | 3 |
| 11085 | 2026-05-10 | consumer-enabling | skill-machinery | — | 2 |
| 11069 | 2026-05-10 | consumer-enabling | ci-test-infra | — | 7 |
| 11064 | 2026-05-10 | consumer-enabling | ci-test-infra | — | 8 |
| 11063 | 2026-05-10 | consumer-enabling | ci-test-infra | — | 3 |
| 11061 | 2026-05-09 | consumer-enabling | ci-test-infra | — | 5 |
| 11060 | 2026-05-09 | consumer-enabling | ci-test-infra | — | 1 |
| 11059 | 2026-05-09 | consumer-enabling | ci-test-infra | — | 5 |
| 11055 | 2026-05-09 | consumer-enabling | ci-test-infra | — | 1 |
| 11054 | 2026-05-09 | consumer-enabling | ci-test-infra | — | 9 |
| 11056 | 2026-05-09 | consumer-enabling | skill-machinery | — | 2 |
| 11048 | 2026-05-09 | consumer-enabling | skill-machinery | — | 5 |
| 11045 | 2026-05-09 | consumer-enabling | skill-machinery | — | 4 |
| 11044 | 2026-05-09 | consumer-enabling | ci-test-infra | — | 5 |
| 11043 | 2026-05-09 | internal-only | docs-internal | — | 1 |
| 11047 | 2026-05-09 | consumer-enabling | ci-test-infra | — | 1 |
| 11042 | 2026-05-09 | consumer-enabling | ci-test-infra | — | 5 |
| 11040 | 2026-05-09 | consumer-enabling | skill-machinery | — | 1 |
| 11036 | 2026-05-09 | consumer-enabling | skill-machinery | — | 2 |
| 11035 | 2026-05-09 | consumer-enabling | skill-machinery | — | 5 |
| 11034 | 2026-05-09 | consumer-enabling | skill-machinery | — | 1 |
| 11015 | 2026-05-09 | consumer-enabling | skill-machinery | — | 1 |
| 11016 | 2026-05-09 | consumer-enabling | ci-test-infra | — | 9 |
| 11014 | 2026-05-09 | consumer-enabling | ci-test-infra | — | 29 |
| 11004 | 2026-05-09 | consumer-enabling | ci-test-infra | — | 4 |
| 11007 | 2026-05-09 | consumer-enabling | ci-test-infra | — | 77 |
| 11008 | 2026-05-09 | consumer-enabling | ci-test-infra | — | 5 |
| 11001 | 2026-05-09 | consumer-enabling | ci-test-infra | — | 86 |
| 11000 | 2026-05-09 | internal-only | docs-internal | — | 1 |
| 10998 | 2026-05-09 | consumer-enabling | ci-test-infra | — | 13 |
| 10997 | 2026-05-09 | consumer-enabling | ci-test-infra | — | 33 |
| 10995 | 2026-05-08 | consumer-enabling | ci-test-infra | — | 33 |
| 10992 | 2026-05-08 | consumer-enabling | skill-machinery | — | 6 |
| 10989 | 2026-05-08 | consumer-enabling | ci-test-infra | — | 4 |
| 10988 | 2026-05-08 | consumer-enabling | ci-test-infra | — | 2 |
| 10984 | 2026-05-08 | consumer-enabling | ci-test-infra | — | 5 |
| 10985 | 2026-05-08 | consumer-enabling | ci-test-infra | — | 3 |
| 10981 | 2026-05-08 | internal-only | docs-internal | — | 3 |
| 10979 | 2026-05-08 | consumer-enabling | ci-test-infra | — | 1 |
| 10978 | 2026-05-08 | consumer-direct:now | mcp-runtime | — | 6 |
| 10976 | 2026-05-08 | consumer-direct:now | mcp-runtime | — | 1 |
| 10973 | 2026-05-08 | consumer-direct:now | mcp-runtime | — | 3 |
| 10977 | 2026-05-08 | consumer-direct:now | mcp-runtime | — | 3 |
| 10975 | 2026-05-08 | consumer-direct:now | mcp-runtime | — | 3 |
| 10974 | 2026-05-08 | consumer-direct:now | mcp-runtime | — | 1 |
| 10968 | 2026-05-08 | consumer-direct:now | agent-cloud | — | 4 |
| 10967 | 2026-05-08 | consumer-enabling | ci-test-infra | — | 7 |
| 10966 | 2026-05-08 | consumer-direct:now | mcp-runtime | — | 2 |
| 10963 | 2026-05-08 | consumer-enabling | ci-test-infra | — | 4 |
| 10962 | 2026-05-08 | consumer-enabling | ci-test-infra | — | 3 |
| 10953 | 2026-05-08 | consumer-enabling | ci-test-infra | — | 7 |
| 10958 | 2026-05-08 | internal-only | docs-internal | — | 2 |
| 10940 | 2026-05-08 | consumer-enabling | ci-test-infra | — | 8 |
| 10930 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 6 |
| 10929 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 1 |
| 10928 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 4 |
| 10927 | 2026-05-07 | consumer-direct:now | agent-cloud | — | 4 |
| 10925 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 3 |
| 10921 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 5 |
| 10920 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 1 |
| 10899 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 1 |
| 10919 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 2 |
| 10916 | 2026-05-07 | consumer-direct:now | mcp-runtime | — | 15 |
| 10914 | 2026-05-07 | consumer-direct:now | agent-cloud | — | 1 |
| 10912 | 2026-05-07 | consumer-direct:now | agent-cloud | — | 1 |
| 10910 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 8 |
| 10909 | 2026-05-07 | consumer-direct:now | agent-cloud | — | 1 |
| 10907 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 2 |
| 10898 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 4 |
| 10901 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 7 |
| 10904 | 2026-05-07 | consumer-direct:now | agent-cloud | — | 1 |
| 10892 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 6 |
| 10891 | 2026-05-07 | consumer-direct:now | mcp-runtime | — | 4 |
| 10893 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 7 |
| 10888 | 2026-05-07 | consumer-enabling | skill-machinery | — | 5 |
| 10886 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 9 |
| 10885 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 4 |
| 10880 | 2026-05-07 | consumer-direct:now | agent-cloud | — | 7 |
| 10883 | 2026-05-07 | consumer-enabling | skill-machinery | — | 1 |
| 10879 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 1 |
| 10877 | 2026-05-07 | internal-only | docs-internal | — | 12 |
| 10876 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 2 |
| 10875 | 2026-05-07 | consumer-enabling | skill-machinery | — | 2 |
| 10873 | 2026-05-07 | consumer-direct:now | mcp-runtime | — | 10 |
| 10872 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 5 |
| 10870 | 2026-05-07 | consumer-enabling | skill-machinery | — | 1 |
| 10868 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 9 |
| 10865 | 2026-05-07 | consumer-enabling | skill-machinery | — | 2 |
| 10863 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 32 |
| 10850 | 2026-05-07 | consumer-direct:now | mcp-runtime | — | 1 |
| 10861 | 2026-05-07 | consumer-enabling | ci-test-infra | — | 3 |
| 10853 | 2026-05-07 | consumer-enabling | skill-machinery | — | 3 |
| 10849 | 2026-05-07 | consumer-direct:now | mcp-runtime | — | 10 |
| 10848 | 2026-05-07 | consumer-enabling | skill-machinery | — | 1 |
| 10831 | 2026-05-06 | internal-only | docs-internal | — | 2 |
| 10829 | 2026-05-06 | consumer-enabling | ci-test-infra | — | 2 |
| 10839 | 2026-05-06 | consumer-direct:now | app-engine | — | 2 |
| 10836 | 2026-05-06 | consumer-direct:now | mcp-runtime | — | 5 |
| 10832 | 2026-05-06 | consumer-direct:now | mcp-runtime | — | 1 |
| 10828 | 2026-05-06 | consumer-enabling | skill-machinery | — | 3 |
| 10821 | 2026-05-06 | consumer-enabling | skill-machinery | — | 1 |
| 10818 | 2026-05-06 | consumer-direct:now | mcp-runtime | — | 5 |
| 10816 | 2026-05-06 | consumer-enabling | skill-machinery | — | 4 |
| 10817 | 2026-05-06 | consumer-direct:now | mcp-runtime | — | 7 |
| 10814 | 2026-05-06 | consumer-direct:now | mcp-runtime | — | 9 |
| 10812 | 2026-05-06 | consumer-direct:now | mcp-runtime | — | 14 |
| 10811 | 2026-05-06 | internal-only | docs-internal | — | 1 |
| 10810 | 2026-05-06 | consumer-enabling | ci-test-infra | — | 17 |
| 10806 | 2026-05-06 | internal-only | docs-internal | — | 4 |
| 10799 | 2026-05-06 | internal-only | docs-internal | — | 4 |
| 10798 | 2026-05-06 | consumer-direct:now | mcp-runtime | — | 3 |
| 10797 | 2026-05-06 | consumer-direct:now | mcp-runtime | — | 2 |
| 10792 | 2026-05-06 | consumer-enabling | skill-machinery | — | 2 |
| 10791 | 2026-05-06 | consumer-enabling | ci-test-infra | — | 1 |
| 10793 | 2026-05-06 | internal-only | docs-internal | — | 4 |
| 10778 | 2026-05-05 | consumer-enabling | skill-machinery | — | 3 |
| 10785 | 2026-05-05 | consumer-direct:now | mcp-runtime | — | 2 |
| 10771 | 2026-05-05 | consumer-direct:now | mcp-runtime | — | 8 |
| 10767 | 2026-05-05 | consumer-direct:now | mcp-runtime | — | 3 |
| 10769 | 2026-05-05 | internal-only | docs-internal | — | 1 |
| 10768 | 2026-05-05 | consumer-direct:now | mcp-runtime | — | 3 |
| 10764 | 2026-05-05 | consumer-enabling | skill-machinery | — | 2 |
| 10754 | 2026-05-05 | internal-only | docs-internal | — | 1 |
| 10751 | 2026-05-05 | consumer-enabling | skill-machinery | — | 2 |
| 10752 | 2026-05-05 | consumer-direct:now | mcp-runtime | — | 4 |
| 10750 | 2026-05-05 | consumer-enabling | skill-machinery | — | 1 |
| 10746 | 2026-05-05 | internal-only | docs-internal | — | 1 |
| 10744 | 2026-05-05 | consumer-enabling | skill-machinery | — | 1 |
| 10741 | 2026-05-05 | consumer-enabling | skill-machinery | — | 3 |
| 10739 | 2026-05-05 | consumer-enabling | skill-machinery | — | 4 |
| 10730 | 2026-05-05 | consumer-direct:now | mcp-runtime | — | 6 |
| 10731 | 2026-05-05 | consumer-direct:now | mcp-runtime | — | 6 |
| 10729 | 2026-05-05 | consumer-direct:now | mcp-runtime | — | 4 |
| 10728 | 2026-05-05 | consumer-enabling | skill-machinery | — | 5 |
| 10720 | 2026-05-04 | consumer-enabling | skill-machinery | — | 1 |
| 10719 | 2026-05-04 | consumer-enabling | ci-test-infra | — | 4 |
| 10716 | 2026-05-04 | internal-only | docs-internal | — | 2 |
| 10718 | 2026-05-04 | consumer-enabling | ci-test-infra | — | 4 |
| 10710 | 2026-05-04 | consumer-enabling | skill-machinery | — | 1 |
| 10700 | 2026-05-04 | consumer-direct:now | mcp-runtime | — | 6 |
| 10713 | 2026-05-04 | consumer-enabling | ci-test-infra | — | 2 |
| 10701 | 2026-05-04 | consumer-enabling | ci-test-infra | — | 2 |
| 10696 | 2026-05-04 | consumer-enabling | ci-test-infra | — | 4 |
| 10699 | 2026-05-04 | consumer-enabling | skill-machinery | — | 9 |
| 10695 | 2026-05-04 | consumer-enabling | ci-test-infra | — | 2 |
| 10680 | 2026-05-04 | internal-only | docs-internal | — | 5 |
| 10688 | 2026-05-04 | internal-only | docs-internal | — | 1 |
| 10690 | 2026-05-04 | consumer-enabling | ci-test-infra | — | 3 |
| 10689 | 2026-05-04 | consumer-enabling | ci-test-infra | — | 2 |
| 10683 | 2026-05-04 | consumer-enabling | ci-test-infra | — | 8 |
| 10687 | 2026-05-04 | consumer-direct:now | mcp-runtime | — | 2 |
| 10682 | 2026-05-04 | consumer-enabling | ci-test-infra | — | 1 |
| 10667 | 2026-05-03 | consumer-enabling | ci-test-infra | — | 4 |
| 10665 | 2026-05-03 | consumer-enabling | ci-test-infra | — | 3 |
| 10663 | 2026-05-03 | consumer-enabling | ci-test-infra | — | 3 |
| 10661 | 2026-05-03 | consumer-enabling | ci-test-infra | — | 6 |
| 10659 | 2026-05-03 | consumer-enabling | ci-test-infra | — | 2 |
| 10655 | 2026-05-03 | internal-only | docs-internal | — | 2 |
| 10654 | 2026-05-03 | consumer-enabling | skill-machinery | — | 1 |
| 10656 | 2026-05-03 | consumer-direct:now | mcp-runtime | — | 2 |
| 10652 | 2026-05-03 | consumer-enabling | ci-test-infra | — | 4 |
| 10653 | 2026-05-03 | consumer-enabling | ci-test-infra | — | 6 |
| 10637 | 2026-05-03 | consumer-direct:now | mcp-runtime | — | 2 |
| 10642 | 2026-05-03 | consumer-enabling | ci-test-infra | — | 2 |
| 10639 | 2026-05-03 | consumer-enabling | ci-test-infra | — | 1 |
| 10632 | 2026-05-03 | consumer-enabling | ci-test-infra | — | 3 |
| 10631 | 2026-05-03 | consumer-enabling | ci-test-infra | — | 3 |
| 10628 | 2026-05-03 | consumer-direct:now | mcp-runtime | — | 2 |
| 10618 | 2026-05-03 | consumer-enabling | skill-machinery | — | 3 |
| 10621 | 2026-05-03 | consumer-enabling | ci-test-infra | — | 4 |
| 10623 | 2026-05-03 | consumer-enabling | ci-test-infra | — | 2 |
| 10619 | 2026-05-03 | consumer-enabling | ci-test-infra | — | 7 |
| 10613 | 2026-05-02 | consumer-enabling | skill-machinery | — | 3 |
| 10616 | 2026-05-02 | consumer-enabling | skill-machinery | — | 5 |
| 10610 | 2026-05-02 | consumer-enabling | skill-machinery | — | 2 |
| 10607 | 2026-05-02 | consumer-enabling | ci-test-infra | — | 2 |
| 10602 | 2026-05-01 | consumer-enabling | ci-test-infra | — | 5 |
| 10600 | 2026-05-01 | internal-only | docs-internal | — | 10 |
| 10603 | 2026-05-01 | consumer-enabling | ci-test-infra | — | 12 |
| 10598 | 2026-05-01 | consumer-enabling | ci-test-infra | — | 4 |
| 10597 | 2026-05-01 | consumer-enabling | ci-test-infra | — | 3 |
| 10596 | 2026-05-01 | consumer-enabling | skill-machinery | — | 2 |
| 10594 | 2026-05-01 | internal-only | docs-internal | — | 2 |
| 10592 | 2026-05-01 | consumer-enabling | ci-test-infra | — | 2 |
| 10588 | 2026-05-01 | consumer-enabling | skill-machinery | — | 1 |
| 10589 | 2026-05-01 | consumer-direct:now | mcp-runtime | — | 5 |
| 10590 | 2026-05-01 | consumer-enabling | ci-test-infra | — | 3 |
| 10585 | 2026-05-01 | consumer-direct:now | mcp-runtime | — | 2 |
| 10575 | 2026-05-01 | consumer-enabling | ci-test-infra | — | 9 |
| 10583 | 2026-05-01 | consumer-direct:now | mcp-runtime | — | 6 |
| 10581 | 2026-05-01 | consumer-direct:now | agent-cloud | — | 2 |
| 10580 | 2026-05-01 | consumer-direct:now | mcp-runtime | — | 5 |
| 10578 | 2026-05-01 | consumer-enabling | ci-test-infra | — | 1 |
| 10573 | 2026-05-01 | consumer-direct:now | mcp-runtime | — | 6 |
| 10571 | 2026-05-01 | internal-only | docs-internal | — | 2 |
| 10570 | 2026-05-01 | consumer-enabling | skill-machinery | — | 1 |
| 10568 | 2026-05-01 | internal-only | docs-internal | — | 1 |
| 10567 | 2026-05-01 | consumer-direct:now | mcp-runtime | — | 8 |
| 10566 | 2026-05-01 | consumer-enabling | skill-machinery | — | 3 |
| 10565 | 2026-05-01 | internal-only | docs-internal | — | 1 |
| 10561 | 2026-05-01 | consumer-enabling | skill-machinery | — | 1 |
| 10563 | 2026-05-01 | consumer-enabling | skill-machinery | — | 1 |
| 10554 | 2026-05-01 | consumer-direct:now | mcp-runtime | — | 1 |
| 10539 | 2026-05-01 | consumer-enabling | skill-machinery | — | 1 |
| 10533 | 2026-05-01 | consumer-enabling | ci-test-infra | — | 3 |
| 10553 | 2026-05-01 | consumer-enabling | skill-machinery | — | 3 |
| 10551 | 2026-05-01 | consumer-enabling | skill-machinery | — | 1 |
| 10549 | 2026-05-01 | consumer-enabling | skill-machinery | — | 1 |
| 10541 | 2026-05-01 | consumer-enabling | skill-machinery | — | 4 |
| 10544 | 2026-05-01 | consumer-enabling | skill-machinery | — | 1 |
| 10536 | 2026-04-30 | consumer-enabling | skill-machinery | — | 1 |
| 10505 | 2026-04-30 | consumer-direct:now | mcp-runtime | — | 2 |
| 10532 | 2026-04-30 | consumer-direct:now | mcp-runtime | — | 4 |
| 10526 | 2026-04-30 | consumer-enabling | ci-test-infra | — | 3 |
| 10530 | 2026-04-30 | consumer-enabling | skill-machinery | — | 1 |
| 10528 | 2026-04-30 | consumer-enabling | ci-test-infra | — | 2 |
| 10508 | 2026-04-30 | consumer-direct:now | mcp-runtime | — | 4 |
| 10524 | 2026-04-30 | consumer-enabling | skill-machinery | — | 1 |
| 10519 | 2026-04-30 | consumer-enabling | skill-machinery | — | 2 |
| 10507 | 2026-04-30 | consumer-direct:now | mcp-runtime | — | 1 |
| 10510 | 2026-04-30 | consumer-enabling | skill-machinery | — | 1 |
| 10516 | 2026-04-30 | consumer-enabling | ci-test-infra | — | 6 |
| 10514 | 2026-04-30 | consumer-enabling | skill-machinery | — | 2 |
| 10502 | 2026-04-30 | consumer-enabling | skill-machinery | — | 2 |
| 10512 | 2026-04-30 | consumer-enabling | skill-machinery | — | 1 |
| 10503 | 2026-04-29 | consumer-enabling | skill-machinery | — | 1 |
| 10500 | 2026-04-29 | consumer-enabling | ci-test-infra | — | 9 |
| 10497 | 2026-04-29 | consumer-enabling | skill-machinery | — | 1 |
| 10493 | 2026-04-29 | internal-only | docs-internal | — | 1 |
| 10491 | 2026-04-29 | consumer-enabling | ci-test-infra | — | 82 |
| 10486 | 2026-04-29 | consumer-enabling | ci-test-infra | — | 4 |
| 10451 | 2026-04-29 | consumer-enabling | skill-machinery | — | 1 |
| 10459 | 2026-04-29 | consumer-enabling | ci-test-infra | — | 2 |
| 10487 | 2026-04-29 | consumer-enabling | ci-test-infra | — | 20 |
| 10475 | 2026-04-29 | consumer-enabling | skill-machinery | — | 3 |
| 10479 | 2026-04-28 | consumer-enabling | skill-machinery | — | 1 |
| 10446 | 2026-04-28 | consumer-enabling | ci-test-infra | — | 2 |
| 10468 | 2026-04-28 | consumer-enabling | ci-test-infra | — | 1 |
| 10466 | 2026-04-28 | consumer-enabling | ci-test-infra | — | 1 |
| 10464 | 2026-04-28 | consumer-enabling | ci-test-infra | — | 4 |
| 10457 | 2026-04-28 | internal-only | docs-internal | — | 1 |
| 10453 | 2026-04-28 | consumer-enabling | skill-machinery | — | 1 |
| 10455 | 2026-04-28 | internal-only | docs-internal | — | 1 |
| 10445 | 2026-04-27 | consumer-enabling | ci-test-infra | — | 1 |
| 10441 | 2026-04-27 | consumer-enabling | skill-machinery | — | 1 |
| 10438 | 2026-04-27 | consumer-direct:now | mcp-runtime | — | 1 |
| 10436 | 2026-04-27 | consumer-enabling | ci-test-infra | — | 2 |
| 10433 | 2026-04-27 | consumer-enabling | ci-test-infra | — | 2 |
| 10427 | 2026-04-27 | consumer-enabling | ci-test-infra | — | 4 |
| 10431 | 2026-04-27 | consumer-enabling | ci-test-infra | — | 2 |
| 10425 | 2026-04-27 | consumer-enabling | ci-test-infra | — | 2 |
| 10421 | 2026-04-27 | consumer-direct:now | mcp-runtime | — | 1 |
| 10418 | 2026-04-27 | consumer-enabling | ci-test-infra | — | 1 |
| 10417 | 2026-04-27 | consumer-direct:now | mcp-runtime | — | 4 |
| 10416 | 2026-04-27 | consumer-direct:now | mcp-runtime | — | 2 |
| 10415 | 2026-04-27 | consumer-enabling | skill-machinery | — | 5 |
| 10412 | 2026-04-27 | consumer-direct:now | mcp-runtime | — | 1 |
| 10411 | 2026-04-27 | consumer-enabling | ci-test-infra | — | 1 |
| 10413 | 2026-04-27 | consumer-enabling | skill-machinery | — | 1 |
| 10406 | 2026-04-27 | consumer-enabling | skill-machinery | — | 1 |
| 10404 | 2026-04-27 | consumer-enabling | ci-test-infra | — | 7 |
| 10401 | 2026-04-27 | consumer-enabling | ci-test-infra | — | 5 |
| 10398 | 2026-04-27 | consumer-enabling | skill-machinery | — | 2 |
| 10394 | 2026-04-27 | consumer-enabling | skill-machinery | — | 1 |
| 10397 | 2026-04-27 | consumer-direct:now | mcp-runtime | — | 5 |
| 10392 | 2026-04-26 | consumer-enabling | ci-test-infra | — | 1 |
| 10390 | 2026-04-26 | consumer-direct:now | mcp-runtime | — | 2 |
| 10387 | 2026-04-26 | consumer-direct:now | mcp-runtime | — | 5 |
| 10386 | 2026-04-26 | consumer-enabling | skill-machinery | — | 1 |
| 10382 | 2026-04-26 | consumer-direct:now | mcp-runtime | — | 2 |
| 10378 | 2026-04-26 | consumer-direct:now | mcp-runtime | — | 4 |
| 10379 | 2026-04-26 | consumer-direct:now | mcp-runtime | — | 2 |
| 10377 | 2026-04-26 | consumer-enabling | skill-machinery | — | 3 |
| 10375 | 2026-04-26 | consumer-enabling | skill-machinery | — | 3 |
| 10371 | 2026-04-26 | consumer-enabling | skill-machinery | — | 6 |
| 10373 | 2026-04-26 | consumer-enabling | skill-machinery | — | 1 |
| 10369 | 2026-04-26 | consumer-enabling | skill-machinery | — | 1 |
| 10366 | 2026-04-26 | consumer-enabling | skill-machinery | — | 3 |
| 10356 | 2026-04-26 | internal-only | docs-internal | — | 1 |
| 10352 | 2026-04-26 | consumer-enabling | ci-test-infra | — | 3 |
| 10350 | 2026-04-26 | consumer-enabling | ci-test-infra | — | 4 |
| 10348 | 2026-04-26 | consumer-enabling | skill-machinery | — | 2 |
| 10342 | 2026-04-26 | consumer-direct:now | mcp-runtime | — | 4 |
| 10346 | 2026-04-26 | consumer-enabling | skill-machinery | — | 7 |
| 10345 | 2026-04-26 | consumer-enabling | skill-machinery | — | 1 |
| 10340 | 2026-04-25 | consumer-direct:now | mcp-runtime | — | 3 |
| 10337 | 2026-04-25 | consumer-enabling | skill-machinery | — | 2 |
| 10335 | 2026-04-25 | internal-only | docs-internal | — | 5 |
| 10331 | 2026-04-25 | consumer-enabling | ci-test-infra | — | 4 |
| 10329 | 2026-04-25 | consumer-enabling | skill-machinery | — | 1 |
| 10328 | 2026-04-25 | consumer-enabling | skill-machinery | — | 1 |
| 10325 | 2026-04-25 | consumer-direct:now | mcp-runtime | — | 5 |
| 10326 | 2026-04-25 | consumer-enabling | skill-machinery | — | 2 |
| 10317 | 2026-04-25 | consumer-enabling | skill-machinery | — | 19 |
| 10308 | 2026-04-25 | internal-only | docs-internal | — | 22 |
| 10315 | 2026-04-25 | consumer-enabling | skill-machinery | — | 4 |
| 10303 | 2026-04-24 | consumer-enabling | skill-machinery | — | 2 |
| 10286 | 2026-04-24 | consumer-enabling | skill-machinery | — | 2 |
| 10306 | 2026-04-24 | consumer-direct:now | mcp-runtime | — | 2 |
| 10287 | 2026-04-24 | consumer-direct:now | mcp-runtime | — | 9 |
| 10282 | 2026-04-24 | consumer-enabling | skill-machinery | — | 4 |
| 10279 | 2026-04-24 | consumer-enabling | skill-machinery | — | 2 |
| 10277 | 2026-04-24 | consumer-enabling | skill-machinery | — | 4 |
| 10298 | 2026-04-24 | consumer-enabling | skill-machinery | — | 2 |
| 10269 | 2026-04-24 | consumer-direct:now | mcp-runtime | — | 5 |
| 10268 | 2026-04-24 | consumer-direct:now | mcp-runtime | — | 3 |
| 10263 | 2026-04-24 | consumer-enabling | ci-test-infra | — | 8 |
| 10266 | 2026-04-24 | consumer-direct:now | mcp-runtime | — | 4 |
| 10264 | 2026-04-24 | consumer-enabling | ci-test-infra | — | 2 |
| 10265 | 2026-04-24 | internal-only | docs-internal | — | 4 |
| 10261 | 2026-04-23 | consumer-enabling | ci-test-infra | — | 4 |
| 10262 | 2026-04-23 | consumer-enabling | ci-test-infra | — | 4 |
| 10258 | 2026-04-23 | consumer-direct:now | mcp-runtime | — | 1 |
| 10254 | 2026-04-23 | consumer-enabling | ci-test-infra | — | 1 |
| 10253 | 2026-04-23 | consumer-direct:now | mcp-runtime | — | 4 |
| 10250 | 2026-04-23 | consumer-direct:now | mcp-runtime | — | 2 |
| 10242 | 2026-04-23 | consumer-direct:now | mcp-runtime | — | 4 |
| 10239 | 2026-04-23 | consumer-direct:now | mcp-runtime | — | 5 |
| 10235 | 2026-04-23 | consumer-direct:now | mcp-runtime | — | 2 |
| 10234 | 2026-04-23 | consumer-direct:now | mcp-runtime | — | 2 |
| 10236 | 2026-04-23 | consumer-enabling | ci-test-infra | — | 5 |
| 10229 | 2026-04-23 | consumer-enabling | ci-test-infra | — | 5 |
| 10227 | 2026-04-23 | consumer-direct:now | mcp-runtime | — | 2 |
| 10223 | 2026-04-23 | consumer-direct:now | mcp-runtime | — | 2 |
| 10225 | 2026-04-23 | consumer-enabling | ci-test-infra | — | 3 |
| 10220 | 2026-04-23 | consumer-direct:now | mcp-runtime | — | 3 |
| 10221 | 2026-04-23 | consumer-enabling | ci-test-infra | — | 2 |
| 10213 | 2026-04-22 | consumer-enabling | skill-machinery | — | 2 |
| 10211 | 2026-04-22 | consumer-enabling | skill-machinery | — | 3 |
| 10205 | 2026-04-22 | consumer-enabling | ci-test-infra | — | 2 |
| 10204 | 2026-04-22 | consumer-direct:now | mcp-runtime | — | 1 |
| 10203 | 2026-04-22 | internal-only | docs-internal | — | 2 |
| 10202 | 2026-04-22 | consumer-enabling | ci-test-infra | — | 1 |
| 10198 | 2026-04-22 | consumer-direct:now | mcp-runtime | — | 2 |
| 10196 | 2026-04-22 | consumer-enabling | ci-test-infra | — | 4 |
| 10197 | 2026-04-22 | consumer-enabling | ci-test-infra | — | 1 |
| 10193 | 2026-04-22 | consumer-direct:now | mcp-runtime | — | 6 |
| 10185 | 2026-04-22 | consumer-direct:now | mcp-runtime | — | 2 |
| 10182 | 2026-04-22 | consumer-direct:now | mcp-runtime | — | 1 |
| 10177 | 2026-04-22 | consumer-direct:now | mcp-runtime | — | 5 |
| 10178 | 2026-04-22 | consumer-direct:now | mcp-runtime | — | 5 |
| 10175 | 2026-04-22 | consumer-enabling | ci-test-infra | — | 5 |
| 10170 | 2026-04-22 | consumer-enabling | ci-test-infra | — | 4 |
| 10171 | 2026-04-22 | consumer-enabling | ci-test-infra | — | 9 |
| 10167 | 2026-04-21 | consumer-direct:now | mcp-runtime | — | 7 |
| 10166 | 2026-04-21 | consumer-direct:now | mcp-runtime | — | 9 |
| 10165 | 2026-04-21 | consumer-enabling | ci-test-infra | — | 4 |
| 10162 | 2026-04-21 | consumer-enabling | ci-test-infra | — | 2 |
| 10163 | 2026-04-21 | consumer-enabling | skill-machinery | — | 6 |
| 10142 | 2026-04-21 | consumer-enabling | skill-machinery | — | 2 |
| 10160 | 2026-04-21 | consumer-enabling | skill-machinery | — | 1 |
| 10161 | 2026-04-21 | consumer-direct:now | agent-cloud | — | 4 |
| 10157 | 2026-04-21 | consumer-enabling | skill-machinery | — | 2 |
| 10155 | 2026-04-21 | consumer-enabling | skill-machinery | — | 4 |
| 10140 | 2026-04-21 | internal-only | docs-internal | — | 1 |
| 10133 | 2026-04-20 | consumer-direct:now | mcp-runtime | — | 7 |
| 10131 | 2026-04-20 | consumer-enabling | ci-test-infra | — | 12 |
| 10130 | 2026-04-20 | internal-only | docs-internal | — | 1 |
| 10128 | 2026-04-20 | consumer-direct:now | mcp-runtime | — | 9 |
| 10123 | 2026-04-20 | consumer-direct:now | mcp-runtime | — | 2 |
| 10122 | 2026-04-20 | consumer-enabling | ci-test-infra | — | 2 |
| 10121 | 2026-04-20 | consumer-direct:now | mcp-runtime | — | 4 |
| 10116 | 2026-04-20 | consumer-enabling | skill-machinery | — | 7 |
| 10115 | 2026-04-20 | consumer-enabling | ci-test-infra | — | 1 |
| 10114 | 2026-04-20 | consumer-enabling | ci-test-infra | — | 3 |
| 10111 | 2026-04-20 | consumer-direct:now | mcp-runtime | — | 6 |
| 10105 | 2026-04-19 | consumer-enabling | ci-test-infra | — | 7 |
| 10102 | 2026-04-19 | consumer-enabling | ci-test-infra | — | 3 |
| 10101 | 2026-04-19 | consumer-enabling | ci-test-infra | — | 5 |
| 10100 | 2026-04-19 | consumer-enabling | ci-test-infra | — | 4 |
| 10099 | 2026-04-19 | consumer-enabling | ci-test-infra | — | 3 |
| 10098 | 2026-04-19 | consumer-direct:now | mcp-runtime | — | 8 |
| 10093 | 2026-04-19 | consumer-direct:now | mcp-runtime | — | 6 |
| 10091 | 2026-04-19 | internal-only | docs-internal | — | 11 |
| 10084 | 2026-04-19 | consumer-enabling | ci-test-infra | — | 5 |
| 10078 | 2026-04-19 | consumer-enabling | ci-test-infra | — | 1 |
| 10076 | 2026-04-19 | consumer-enabling | skill-machinery | — | 6 |
| 10071 | 2026-04-18 | consumer-enabling | ci-test-infra | — | 2 |
| 10069 | 2026-04-18 | consumer-enabling | skill-machinery | — | 2 |
| 10067 | 2026-04-18 | consumer-enabling | ci-test-infra | — | 2 |
| 10066 | 2026-04-18 | consumer-direct:now | mcp-runtime | — | 3 |
| 10065 | 2026-04-18 | consumer-enabling | ci-test-infra | — | 3 |
| 10062 | 2026-04-18 | consumer-enabling | skill-machinery | — | 3 |
| 10060 | 2026-04-18 | consumer-enabling | ci-test-infra | — | 13 |
| 10055 | 2026-04-17 | consumer-enabling | skill-machinery | — | 2 |
| 10053 | 2026-04-17 | consumer-enabling | skill-machinery | — | 3 |
| 10052 | 2026-04-17 | consumer-enabling | ci-test-infra | — | 5 |
| 10048 | 2026-04-17 | internal-only | docs-internal | — | 10 |
| 10047 | 2026-04-17 | consumer-enabling | ci-test-infra | — | 5 |
| 10045 | 2026-04-16 | consumer-enabling | skill-machinery | — | 5 |
| 10042 | 2026-04-16 | consumer-enabling | ci-test-infra | — | 6 |
| 10029 | 2026-04-15 | consumer-enabling | ci-test-infra | — | 5 |
| 10027 | 2026-04-15 | consumer-enabling | ci-test-infra | — | 8 |
| 10026 | 2026-04-15 | consumer-enabling | skill-machinery | — | 6 |
| 10024 | 2026-04-15 | consumer-direct:now | mcp-runtime | — | 12 |
| 9998 | 2026-04-14 | consumer-direct:now | mcp-runtime | — | 2 |
| 9996 | 2026-04-14 | internal-only | docs-internal | — | 5 |
| 9995 | 2026-04-14 | consumer-direct:now | agent-cloud | — | 1 |
| 9990 | 2026-04-14 | consumer-enabling | ci-test-infra | — | 8 |
| 9988 | 2026-04-13 | internal-only | docs-internal | — | 5 |
| 9987 | 2026-04-13 | internal-only | docs-internal | — | 5 |
| 9984 | 2026-04-13 | internal-only | docs-internal | — | 4 |
| 9982 | 2026-04-13 | internal-only | docs-internal | — | 3 |
| 9979 | 2026-04-13 | consumer-direct:now | mcp-runtime | — | 3 |
| 9978 | 2026-04-13 | consumer-direct:now | mcp-runtime | — | 4 |
| 9976 | 2026-04-13 | consumer-enabling | skill-machinery | — | 2 |
| 9974 | 2026-04-13 | consumer-direct:now | mcp-runtime | — | 3 |
| 9972 | 2026-04-13 | consumer-direct:now | agent-cloud | — | 2 |
| 9970 | 2026-04-13 | consumer-enabling | skill-machinery | — | 4 |
| 9968 | 2026-04-13 | consumer-enabling | skill-machinery | — | 3 |
| 9967 | 2026-04-13 | consumer-direct:now | agent-cloud | — | 2 |
| 9966 | 2026-04-13 | consumer-direct:now | mcp-runtime | — | 2 |
| 9964 | 2026-04-13 | consumer-direct:now | mcp-runtime | — | 2 |
| 9960 | 2026-04-13 | consumer-direct:now | mcp-runtime | — | 3 |
| 9949 | 2026-04-13 | consumer-enabling | skill-machinery | — | 3 |
| 9947 | 2026-04-13 | consumer-direct:now | agent-cloud | — | 1 |
| 9944 | 2026-04-12 | consumer-direct:now | agent-cloud | — | 1 |
| 9943 | 2026-04-12 | consumer-direct:now | mcp-runtime | — | 1 |
| 9941 | 2026-04-12 | consumer-direct:now | mcp-runtime | — | 2 |
| 9938 | 2026-04-12 | consumer-direct:now | mcp-runtime | — | 3 |
| 9936 | 2026-04-12 | consumer-direct:now | mcp-runtime | — | 2 |
| 9934 | 2026-04-12 | consumer-direct:now | agent-cloud | — | 1 |
| 9932 | 2026-04-12 | consumer-enabling | ci-test-infra | — | 5 |
| 9930 | 2026-04-12 | consumer-enabling | ci-test-infra | — | 3 |
| 9928 | 2026-04-12 | consumer-enabling | ci-test-infra | — | 9 |
| 9926 | 2026-04-12 | consumer-direct:now | mcp-runtime | — | 9 |
| 9918 | 2026-04-12 | consumer-enabling | ci-test-infra | — | 4 |
| 9916 | 2026-04-12 | internal-only | docs-internal | — | 1 |
| 9911 | 2026-04-12 | consumer-direct:now | agent-cloud | — | 1 |
| 9909 | 2026-04-12 | consumer-enabling | skill-machinery | — | 2 |
| 9902 | 2026-04-12 | consumer-direct:now | mcp-runtime | — | 5 |
| 9899 | 2026-04-12 | consumer-enabling | skill-machinery | — | 2 |
| 9897 | 2026-04-12 | internal-only | docs-internal | — | 1 |
| 9896 | 2026-04-11 | internal-only | docs-internal | — | 5 |
| 9894 | 2026-04-11 | consumer-enabling | skill-machinery | — | 4 |
| 9885 | 2026-04-11 | consumer-direct:now | agent-cloud | — | 5 |
| 9882 | 2026-04-11 | consumer-direct:now | mcp-runtime | — | 6 |
| 9880 | 2026-04-11 | internal-only | docs-internal | — | 1 |
| 9878 | 2026-04-11 | internal-only | docs-internal | — | 1 |
| 9874 | 2026-04-11 | consumer-enabling | skill-machinery | — | 1 |
| 9870 | 2026-04-10 | consumer-enabling | ci-test-infra | — | 1 |
| 9867 | 2026-04-10 | consumer-enabling | skill-machinery | — | 2 |
| 9863 | 2026-04-10 | consumer-enabling | skill-machinery | — | 2 |
| 9861 | 2026-04-10 | consumer-direct:now | agent-cloud | — | 11 |
| 9766 | 2026-04-07 | consumer-direct:now | mcp-runtime | — | 3 |
| 9647 | 2026-04-03 | consumer-direct:now | mcp-runtime | — | 5 |
| 9573 | 2026-03-27 | internal-only | docs-internal | — | 1 |
| 9480 | 2026-03-15 | consumer-direct:now | app-engine | — | 4 |
| 9477 | 2026-03-14 | internal-only | portal-internal | — | 6 |
| 9410 | 2026-03-09 | internal-only | docs-internal | — | 10 |
