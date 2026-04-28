---
name: pr-review
description: Standardized guidelines and templates for structuring Pull Request reviews so that feedback is actionable, encouraging, and extractable by the Native Edge Graph.
triggers: Use this skill when evaluating a Pull Request, writing a PR review, structuring feedback on agent-generated code, or instructing a human on how to write a structured PR Review.
---
# PR Review Skill

If you are tasked with conducting a Pull Request review, generating feedback, or helping a user formulate a PR Review, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agent/skills/pr-review/references/pr-review-guide.md` before proceeding.

**Verify-Before-Assert Integration:**
Before asserting any claim in your PR Review (especially under §7 Depth Floor), you MUST apply the **Verify-Before-Assert Pre-Flight Check** (`AGENTS.md` §2.3). You cannot claim "this code breaks X" or "this label is missing" without first empirically running the falsifying tool to prove it.
