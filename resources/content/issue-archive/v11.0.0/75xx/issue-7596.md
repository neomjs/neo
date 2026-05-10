---
id: 7596
title: 'Bug: ChromaDB Fails on x64 Systems Without WSL'
state: CLOSED
labels:
  - bug
  - documentation
  - good first issue
  - hacktoberfest
assignees:
  - Alachi24
createdAt: '2025-10-21T14:18:47Z'
updatedAt: '2025-10-24T14:17:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7596'
author: Alachi24
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-24T14:17:43Z'
---
# Bug: ChromaDB Fails on x64 Systems Without WSL

**Describe the bug**
Developers on **x64 systems (Intel/AMD)** will likely encounter this error when running `npm run ai:server`:

```Js
Error: Cannot find module 'chromadb-js-bindings-linux-x64-gnu' 
````
This happens because **ChromaDB bindings are architecture-dependent** and the setup process currently assumes an ARM64 environment.
As a result, contributors using x64 Ubuntu or Windows cannot start the AI server directly.

**Impact**
- Blocks contributors using standard x64 hardware
- Prevents local testing of AI-related features
- Creates setup friction during onboarding and Hacktoberfest participation

**To Reproduce**
Steps to reproduce the behavior:
1. Clone the repository on an x64 system (Ubuntu 22.04, WSL2, or Intel-based environment)
2. Run `npm install`
3. Attempt to start the AI server: `npm run ai:server`
4. Observe the module error

**Expected behavior**
The AI server should start successfully on x64 systems with ChromaDB bindings properly installed for the detected architecture.

**Actual Behavior**
The server crashes immediately with a missing module error, suggesting the correct x64 bindings were not installed or linked during `npm install`.


**Desktop (please complete the following information):**
 - OS: Ubuntu 22.04 LTS / Windows 10/11 (x64)
 - Node.js: v20.19.5
 - npm: 10.8.2
 - Architecture: x86_64 (x64)

**Confirmed Workaround**
**Using WSL (Windows Subsystem for Linux)** with Ubuntu 22.04 LTS resolves the issue completely.

Developers can install Neo within WSL, open it in **VS Code** via the **WSL extension (Microsoft)**, and run:

```bash
   npm install
   npm run build-all
   npm run ai:server
````
✅ The AI server launches successfully under this setup.

**Suggested Documentation Update**

Add a new markdown file:
📄 `.github/DOCS/setup-x64-wsl-guide.md`

This file should include:
- Instructions for enabling virtualization in BIOS
- WSL installation and Ubuntu setup
- VS Code configuration (with WSL extension)
- Steps to copy existing forks into WSL safely
- Commands to verify ChromaDB runs correctly

This keeps the main **README** lightweight while providing detailed help for x64 users.

Labels

`setup`, `bug`, `documentation`, `hacktoberfest`, `good first issue`

@tobiu , I'd love to work on this issue.

## Timeline

- 2025-10-21T14:18:48Z @Alachi24 added the `bug` label
### @tobiu - 2025-10-21T14:36:14Z

this one is tricky. i would say, chroma should resolve it on their own, e.g.: https://github.com/chroma-core/chroma/issues/5188

what we could do on our end, until this is fixed: a try / catch block around starting chroma, if there is a missing OS related module, install it as a dev dependency. however, these ones can not get into the neo repo `package.json`, since they are OS related. and this can easily get messed up in PRs.

`npm run ai:server` is close to be fully deprecated. we now have 3 "real" mcp servers inside: https://github.com/neomjs/neo/tree/dev/ai/mcp/server

for gemini we now have this as the starting point: https://github.com/neomjs/neo/blob/dev/.gemini/settings.json
(important: no longer relying on package.json scripts).

this would affect:
https://github.com/neomjs/neo/blob/dev/ai/mcp/server/knowledge-base/services/ChromaManager.mjs#L45
https://github.com/neomjs/neo/blob/dev/ai/mcp/server/memory-core/services/ChromaManager.mjs#L62
(i kept them separate, since after v11, it would make sense to move the memory-core into a separate repo, so that non-neo related projects can use it too.)

creating a guide is definitely fine too.

- 2025-10-21T14:37:17Z @tobiu assigned to @Alachi24
### @Alachi24 - 2025-10-21T14:47:22Z

Thank you, I'll start working on it.
Can you also include the labels I requested, especially the `Documentation` & `Hacktoberfest` @tobiu 

- 2025-10-21T14:48:30Z @tobiu added the `documentation` label
- 2025-10-21T14:48:30Z @tobiu added the `good first issue` label
- 2025-10-21T14:48:30Z @tobiu added the `hacktoberfest` label
- 2025-10-22T18:24:15Z @Alachi24 referenced in commit `c837a7a` - "docs: add setup guide for x64 systems using WSL to resolve ChromaDB binding issues (#7596)"
- 2025-10-23T04:30:08Z @Alachi24 cross-referenced by PR #7617
- 2025-10-24T13:45:26Z @Alachi24 referenced in commit `055fed6` - "docs: add guide for running AI/ChromaDB tooling on Windows via WSL (#7596)"
- 2025-10-24T14:17:43Z @tobiu referenced in commit `269b0da` - "docs: add setup guide for x64 systems using WSL to resolve ChromaDB binding issues (#7596)"
- 2025-10-24T14:17:43Z @tobiu closed this issue
- 2025-10-24T14:17:43Z @tobiu referenced in commit `fdfd63c` - "docs: add guide for running AI/ChromaDB tooling on Windows via WSL (#7596)"

