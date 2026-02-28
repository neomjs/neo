---
id: 9143
title: DevIndex Heuristics & Anomaly Detection
state: CLOSED
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-02-13T13:41:41Z'
updatedAt: '2026-02-13T15:00:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9143'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 9144 Implement Heuristics Service for DevIndex'
  - '[x] 9145 Integrate Heuristics into Updater Pipeline'
  - '[x] 9146 Fetch Top Repository Name for Focus Metric'
subIssuesCompleted: 3
subIssuesTotal: 3
blockedBy: []
blocking: []
closedAt: '2026-02-13T15:00:02Z'
---
# DevIndex Heuristics & Anomaly Detection

This epic covers the implementation of a statistical anomaly detection engine for the DevIndex. The goal is to analyze contribution patterns to distinguish between high-performing humans, AI-augmented developers ("Cyborgs"), and automated scripts/bots.

## Objectives
1.  **Detect Anomalies:** Identify "High Velocity" (bots) and "Anomalous Spikes" (importers).
2.  **Analyze AI Impact:** Measure the "Cyborg Factor" (acceleration of contribution velocity) to track the rise of AI-augmented development.
3.  **Data Enrichment:** Inject these metrics into the public dataset (`users.jsonl`) to enable future UI visualizations (badges, filters).

## Key Metrics to Implement
-   **Velocity (`v`):** Max commits per day (e.g., 20 vs 400).
-   **Acceleration (`a`):** Growth rate (Current Year / Median of past 3 years).
-   **Consistency (`c`):** Active years count.
-   **Focus (`f`):** (Future) Concentration of work in a single repository.

## Sub-Tasks
- [ ] Implement `DevIndex.services.Heuristics` engine (Velocity & Burst math)
- [ ] Integrate Heuristics into `Updater.mjs` pipeline
- [ ] Update `users.jsonl` schema to include heuristics (`h` object)
- [ ] (Optional) Add "Top Repository Name" to GraphQL Query for Focus metric


## Timeline

- 2026-02-13T13:41:43Z @tobiu added the `epic` label
- 2026-02-13T13:41:43Z @tobiu added the `ai` label
- 2026-02-13T13:42:01Z @tobiu added sub-issue #9144
- 2026-02-13T13:42:26Z @tobiu added sub-issue #9145
- 2026-02-13T13:42:45Z @tobiu assigned to @tobiu
- 2026-02-13T13:56:49Z @tobiu added sub-issue #9146
### @tobiu - 2026-02-13T14:59:36Z

**Input from Gemini 3 Pro:**

> ✦ Completed the Backend Implementation of the Heuristics Engine.
> 
> **Delivered:**
> 1.  **Heuristics Service:** Calculates Velocity, Acceleration, and Consistency.
> 2.  **Pipeline Integration:** Injects metrics (`hm`) into `users.jsonl`.
> 3.  **Top Repo Fetching:** Enables "Focus" metric (One-Trick Pony detection).
> 
> **Next Steps:**
> Frontend visualization (Badges, Filters) will be handled as part of the broader **#9106 (DevIndex App Polishing)** epic.
> 
> Closing this Epic as the core infrastructure is complete.

- 2026-02-13T15:00:02Z @tobiu closed this issue

