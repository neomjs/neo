---
id: 9606
title: 'docs: Refactor README & Intro as an AI-native Application Engine Manifesto'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-31T08:48:50Z'
updatedAt: '2026-03-31T09:08:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9606'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-31T09:08:34Z'
---
# docs: Refactor README & Intro as an AI-native Application Engine Manifesto

The current top-level discovery documents (README.md and learn/benefits/Introduction.md) do not capture the necessary paradigm shift well enough compared to the newly structured Benefit Guides.

The Problem:

1. We still use "modern" to describe legacy single-threaded frameworks.
2. We bury the lead on why Neo.mjs is perfect for LLMs. It is JSON-first and has been for 6 years—this makes it exceptionally easy to use for agents, allowing humans + LLMs to build complex applications that are otherwise impossible.

The Solution:
Refactor both documents to explicitly state:

• Legacy web architectures hit a ceiling.
• Neo.mjs is an Application Engine built for the AI Era.
• The Engine's complexity is abstracted and driven by its JSON-first architecture, allowing LLMs to orchestrate intricate UIs natively.
• Highlight the comprehensive AI Toolchain: AI SDK, 4 MCP Servers, Neural Link.

This ticket covers rewriting these top-level files to properly orient humans and LLMs discovering the Application Engine.

## Timeline

- 2026-03-31T08:48:51Z @tobiu added the `documentation` label
- 2026-03-31T08:48:51Z @tobiu added the `enhancement` label
- 2026-03-31T08:48:51Z @tobiu added the `ai` label
- 2026-03-31T09:08:24Z @tobiu referenced in commit `6d70adc` - "docs: Surgically integrate Application Engine Manifesto and Zero-Hallucination engine into README (#9606)"
### @tobiu - 2026-03-31T09:08:34Z

Added 'Built for AI, By AI' section detailing the Zero-Hallucination verification loop (Playwright, Neural Link, Memory Core). Updated README and Intro strictly to Application Engine branding and eradicated 'framework' references.

- 2026-03-31T09:08:35Z @tobiu closed this issue
- 2026-03-31T09:08:43Z @tobiu assigned to @tobiu

