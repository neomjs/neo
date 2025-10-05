---
title: Update Agent Workflow to use Automated GitHub Issue Creation
labels: documentation, enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7369

**Epic:** Integrate GitHub CLI to Streamline Contribution Workflow
**Phase:** 2
**Status:** To Do

## Description

Once the script to automate GitHub issue creation is complete, the agent's core instructions must be updated to use it. This ticket is to modify `AGENTS.md` to replace the old manual workflow with the new, streamlined, automated one.

## Acceptance Criteria

1.  The `AGENTS.md` file is updated.
2.  The section describing the "Ticket-First" Gate and the manual creation of GitHub issues is removed.
3.  It is replaced with a new protocol where the agent, after creating the local markdown ticket, immediately calls the `npm run ai:create-gh-issue` script.
4.  The agent should be instructed to verify that the script ran successfully and that the markdown file was updated with the new GitHub issue ID.
