# Codex Desktop Guard Card

This file is injected into every trusted repo-root Codex prompt. Keep it small,
Codex-only, and resident-neutral. Identity and model are runtime facts; never
hard-code either here.

- Each resident has an isolated `CODEX_HOME`, checkout, local config, and
  `NEO_AGENT_IDENTITY`. The runtime identity plus canonical identity roots define
  the expected GitHub login; existing health and write guards fail closed on a
  mismatch with `gh api user --jq .login`.
- Local mode owns one resident checkout: fetch, switch, and restore in place.
  Never create a clone or worktree; Worktree mode is host-managed. Recheck
  identity after switches.
- `gh auth status` can report a false sandbox failure. Verify the live login with
  `gh api user --jq .login` before diagnosing broken authentication.
- If a required GitHub call fails in the sandbox, retry it with the required
  escalation before diagnosing GitHub as unavailable. Preserve the exact payload
  when retrying a state-changing operation.
- After a mid-session harness or MCP restart, read
  `.codex/HARNESS_RESTART.md` before diagnosing services or wake state.
- Repo-local command policy lives in `.codex/rules/`; local `$CODEX_HOME` rules
  are operator state, not repository policy.
