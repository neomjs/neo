---
id: 9250
title: Rewrite DevIndex Data Factory Introduction
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-02-22T13:11:41Z'
updatedAt: '2026-02-22T13:28:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9250'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-22T13:28:06Z'
---
# Rewrite DevIndex Data Factory Introduction

The `learn/guides/devindex/data-factory/Intro.md` file is currently a dummy placeholder. Now that we have detailed guides for all the individual services (Spider, Updater, Storage, Orchestrator, Hygiene, Opt-In/Out), we need to rewrite the Introduction to provide a powerful, cohesive overview of the entire "Data Factory" architecture.

Tasks:
- Rewrite `learn/guides/devindex/data-factory/Intro.md`.
- Introduce the Data Factory concept as a robust, automated, multi-stage pipeline.
- Provide a high-level summary of all the key micro-services working in concert (Orchestrator, Spider, Updater, Storage, Cleanup, Privacy Services).
- Establish the narrative arc that connects discovery, enrichment, filtering (meritocracy), and privacy.

## Timeline

- 2026-02-22T13:11:42Z @tobiu added the `documentation` label
- 2026-02-22T13:11:42Z @tobiu added the `ai` label
- 2026-02-22T13:12:06Z @tobiu assigned to @tobiu
- 2026-02-22T13:27:18Z @tobiu referenced in commit `caf96ec` - "docs: Rewrite DevIndex Data Factory Intro with architecture overview (#9250)"
- 2026-02-22T13:27:35Z @tobiu referenced in commit `75d4c18` - "docs: Add mermaid sequence diagram to Data Factory intro (#9250)"
### @tobiu - 2026-02-22T13:27:49Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the rewrite of the `learn/guides/devindex/data-factory/Intro.md` guide.
> 
> The new introduction provides a high-level architectural overview of the Data Factory pipeline. I've also included a Mermaid flowchart that visually maps the entire sequence from Orchestrator -> Privacy -> Spider -> Updater (with Enrichment Utilities) -> Cleanup -> Storage, matching the numbered sections in the document. 
> 
> The changes have been pushed to the `dev` branch. I will close this issue.

- 2026-02-22T13:28:07Z @tobiu closed this issue

