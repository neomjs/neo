# Agent OS Windows Support Audit

Issue #10135 asked for an Agent OS Windows support audit after the prerequisite
work in #9999. The live state on June 7, 2026 is that #9999 is closed and the
audit is no longer blocked.

## Decision

Agent OS remains **WSL-first** for v13. Native Windows is not a supported Agent
OS target yet, and the repository should not add a Windows CI lane for Agent OS
until the native dependency and shell-script boundaries below are intentionally
resolved.

This decision is scoped to Agent OS tooling. The Neo runtime / Body layer is
still expected to run on native Windows; the WSL boundary only applies to the AI
development environment that uses Memory Core, the Knowledge Base, local Chroma,
and the daemon/tooling scripts.

## Evidence Summary

- `learn/agentos/tooling/AiToolingWslSetup.md` already documents the support
  boundary: native Windows is fine for Neo itself, while the AI development
  environment uses WSL because ChromaDB has a native x64 Windows installation
  issue.
- `package.json` requires Node `>=24.0.0`, starts the local vector store through
  `chroma run --path ./.neo-ai-data/chroma/unified`, and depends on
  `chromadb` plus `better-sqlite3`.
- Most repo automation is Node-based `.mjs`, but core package scripts still
  contain POSIX shell assumptions such as `UNIT_TEST_MODE=true playwright ...`
  in `test-unit`.
- Existing CI runs on `ubuntu-latest` only. There is no current Windows matrix
  providing native Agent OS proof.
- The codebase has targeted Windows handling where it has been required:
  `ai/scripts/lifecycle/windowsBatchSpawn.mjs` dispatches `.cmd` / `.bat`
  wrappers through `cmd.exe` with repo-owned quoting, and
  `test/playwright/unit/ai/scripts/lifecycle/resumeHarness.spec.mjs` covers that
  behavior.
- Some diagnostics intentionally stay POSIX-only. For example,
  `ai/scripts/diagnostics/diagnoseMcpConcurrency.mjs` reports that `lsof` is
  required on macOS / Linux when it is unavailable.
- Shell files exist in example/deployment and MLX setup paths, not as the main
  Agent OS boot path: `ai/examples/cloud-deployment/pre-push-hook.sh`,
  `ai/examples/cloud-deployment/deploy-pipeline.sh`, and
  `ai/mcp/server/memory-core/scripts/setup_mlx.sh`.

## Findings

| Scope Area | Severity | Current State | Decision |
| --- | --- | --- | --- |
| Path handling | Minor | Many source paths use `path` APIs or normalize separators; selected build/doc scripts explicitly handle `path.sep === '\\'`. Native Windows is not broadly proven. | Keep WSL-first. Fix path issues only when a native-Windows support lane is opened. |
| Process invocation | Minor | Build scripts use Windows binary names such as `node.exe` / `npm.cmd` in places, and lifecycle resume has explicit `.cmd` support. Package scripts still use POSIX env-prefix syntax. | Do not claim native support. Keep new process code Node-owned and platform-explicit. |
| SQLite / native modules | WSL-only | Memory Core, wake, graph, and tests use `better-sqlite3`. There is no Windows CI proving install/runtime behavior. | WSL remains the supported Windows path for Agent OS persistence. |
| Chroma server | Native blocker | The documented Windows setup routes through WSL because the AI environment depends on ChromaDB, and `package.json` exposes `ai:server` through `chroma run`. | No native Agent OS support until Chroma install/runtime is empirically proven or replaced. |
| Shell scripts | Minor | The few `.sh` files are example/deployment or MLX helper paths, while primary orchestration is `.mjs`. Some npm scripts still depend on POSIX shell semantics. | Accept under WSL-first. Make future boot-critical scripts portable by construction. |
| Line endings | No current blocker | No audit evidence showed JSONL, markdown, or script failure from CRLF handling. | No follow-up ticket from this audit. Re-test if native Windows support becomes a target. |
| `.env`, home, and config conventions | Minor | Config is environment-driven and generally Node-owned. Native Windows home/config proof is not present. | WSL-first avoids promising behavior not covered by CI. |
| Tool limits | No current blocker | No Windows-specific path-length or watcher limit was found in the audited surfaces. | No follow-up ticket from this audit. |
| WSL escape hatch | Intended support path | The WSL setup guide is the current documented route for Windows users who need Agent OS tooling. | Keep WSL as the supported v13 answer. |

## CI Decision

Do **not** add Windows CI for Agent OS in v13. A Windows matrix would imply a
support contract the repo does not yet satisfy and would likely fail for reasons
outside the audited code paths, especially Chroma/native persistence and
POSIX-oriented npm scripts.

A future native-Windows support effort should add CI only after these acceptance
conditions are met:

1. `npm install` succeeds on native Windows with the repo's Node engine and
   native dependencies.
2. Chroma can be installed, started, and reached through the same contract used
   by Memory Core and Knowledge Base.
3. Boot-critical npm scripts are portable without POSIX env-prefix assumptions.
4. At least one targeted Agent OS unit/integration slice runs green under
   Windows CI.

## Follow-Up Tickets

No follow-up tickets were created by this audit. The current finding is a
support-boundary decision, not a set of v13 blockers. Creating native-Windows
fix tickets now would expand the release scope and violate the stale-ticket
check: #10135 asked for the audit report, and current reality supports a
WSL-first decision.

File follow-ups only if the operator decides native Windows Agent OS support is
a release target. In that case, start with the Chroma/native dependency proof and
portable npm-script contract before lower-priority path or line-ending cleanup.

## Acceptance Criteria Mapping

- Structured report location: this document is the audit report.
- Every scope area covered: findings include path handling, process invocation,
  SQLite/native modules, Chroma server, shell scripts, line endings, environment
  conventions, tool limits, and WSL fallback.
- Severity ranking: each row is classified as no current blocker, minor,
  WSL-only, or native blocker.
- Decision recorded: v13 Agent OS is WSL-first; no Windows CI lane is added now.
- Follow-up handling: no new tickets are required unless the support target
  changes from WSL-first to native Windows.
