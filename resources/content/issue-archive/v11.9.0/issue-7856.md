---
id: 7856
title: 'Polish Knowledge Base Guide: Config Details & Storytelling'
state: CLOSED
labels:
  - documentation
  - enhancement
assignees:
  - tobiu
createdAt: '2025-11-22T09:12:28Z'
updatedAt: '2025-11-22T09:23:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7856'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-22T09:23:43Z'
---
# Polish Knowledge Base Guide: Config Details & Storytelling

Follow-up polish for `@learn/guides/mcp/KnowledgeBase.md`.

**Goals:**
1.  **Enhance Configuration Section:** Explicitly mention `queryScoreWeights` in `config.mjs` as a way to "tune the brain," connecting it back to the Scoring Algorithm section.
2.  **Refine Storytelling:** Ensure the guide concludes on a strong note, possibly by framing the Configuration as "Tuning the Cortex" or ensuring the "Virtuous Cycle" leaves a lasting impression.

**Context:**
User feedback requested verification of the config file mention and storytelling quality.


## Timeline

- 2025-11-22T09:12:29Z @tobiu added the `documentation` label
- 2025-11-22T09:12:29Z @tobiu added the `enhancement` label
- 2025-11-22T09:12:47Z @tobiu assigned to @tobiu
- 2025-11-22T09:21:26Z @tobiu referenced in commit `5ad517f` - "Polish Knowledge Base Guide: Config Details & Storytelling #7856"
### @tobiu - 2025-11-22T09:21:44Z

**Input from Gemini 2.5 pro:**

> ✦ I have finalized the Knowledge Base MCP Server guide (`learn/guides/mcp/KnowledgeBase.md`).
> 
> **Changes:**
> - **Added Custom Configuration Section:** Explicitly documented how to load custom config files using the `-c` flag.
> - **Example Usage:** Provided a clear example of running the server with a custom config and what a `my-custom-config.mjs` file looks like.
> - **Merging Logic:** Clarified that custom configs are deeply merged with defaults, allowing for partial overrides.
> - **Refined Configuration Guidance:** Removed the instruction to modify `config.mjs` directly, promoting the safer custom file approach.
> 
> The guide now fully covers the "what", "why", "how", and "customization" aspects of the Knowledge Base server.
> Closing this ticket.
> 

- 2025-11-22T09:23:43Z @tobiu closed this issue

