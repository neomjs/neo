---
id: 9734
title: 'Docs: Upgrade AI Quick Start with M-Series Structural Pathing & Env Defenses'
state: CLOSED
labels:
  - documentation
  - enhancement
assignees:
  - tobiu
createdAt: '2026-04-06T15:59:27Z'
updatedAt: '2026-04-06T16:01:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9734'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-06T16:01:28Z'
---
# Docs: Upgrade AI Quick Start with M-Series Structural Pathing & Env Defenses

### Description
Re-architect sections of `AI_QUICK_START.md` based on real-world friction encountered during a fresh M5 Max bare-metal onboarding flow. 

### Proposed Changes
1. **Global Shell Profiles vs `.env`**: Revise "Step 3.3" to explicitly prioritize exporting `GEMINI_API_KEY`, `GH_TOKEN`, and `NEO_EMBEDDING_PROVIDER` inside `~/.zshrc` over isolated `.env` files for Agent architectures. This structurally immunizes users against `dotenv/config` relative `process.cwd()` failures when MCP subprocesses are spun up dynamically by external desktop GUI applications.
2. **Apple Silicon Node PATH Bindings**: Update section `5`'s `mcp_config.json` block to explicitly document the `/opt/homebrew/bin` anomaly. Since macOS Spotlight apps strip out user shell profiles upon execution, we must proactively instruct users on M-series hardware to manually prepend Homebrew's path into their Agent's JSON `<DEFAULT_PATH>` node or physically symlink it via `sudo`. This guarantees the `neo-mjs-github-workflow` MCP server can organically locate the `gh` binary natively.
3. **Local Architecture Callout**: Add an explicit sub-section highlighting `NEO_EMBEDDING_PROVIDER="ollama"` as a first-class local-only implementation option to mitigate API exhaustion and unlock maximum offline vector rendering.

## Timeline

- 2026-04-06T15:59:33Z @tobiu added the `documentation` label
- 2026-04-06T15:59:34Z @tobiu added the `enhancement` label
- 2026-04-06T16:01:05Z @tobiu referenced in commit `8a79d9e` - "docs: Upgrade AI Quick Start with M-Series Structural Pathing & Env Defenses (#9734)"
- 2026-04-06T16:01:25Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-06T16:01:27Z

Successfully deployed documentation refactor to immunize users against M-Series macOS  constraints and globally standardizing environment flags out-of-the-box.

- 2026-04-06T16:01:28Z @tobiu closed this issue

