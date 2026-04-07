---
id: 9752
title: 'Native Agent Skills: Fix Progressive Disclosure Tool Mapping'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-07T12:43:28Z'
updatedAt: '2026-04-07T12:43:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9752'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T12:43:42Z'
---
# Native Agent Skills: Fix Progressive Disclosure Tool Mapping

### Description
The `ContextAssembler` successfully mounts Progressive Disclosure agent skills via `loadSkillsSync()` into the overriding system prompt, but instructs agents to use the proprietary `view_file` internal hypervisor abstraction. This causes standard MCP clients leveraging the `@modelcontextprotocol/server-filesystem` node to fail reading skill documents.

This ticket resolves the string injection by mapping the progressive disclosure capability to the native `read_file` signature and explicit `absolutePath` parameter exposed by the Neo local file-system server.

## Timeline

- 2026-04-07T12:43:28Z @tobiu added the `bug` label
- 2026-04-07T12:43:29Z @tobiu added the `ai` label
- 2026-04-07T12:43:39Z @tobiu referenced in commit `6963754` - "fix(ai): Map agent skills to native MCP file system (#9752)"
- 2026-04-07T12:43:40Z @tobiu assigned to @tobiu
- 2026-04-07T12:43:42Z @tobiu closed this issue
### @tobiu - 2026-04-07T12:43:51Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Successfully transitioned the internal hypervisor instruction to properly map against the standard `@modelcontextprotocol/server-filesystem` `read_file` signature. The system prompt will now correctly feed sub-agent variables using the `absolutePath` parameter, guaranteeing Progressive Disclosure capabilities function in production swarms.


