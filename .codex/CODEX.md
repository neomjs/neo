# Codex Desktop Reference

This is the human-readable source for Codex-only operational diagnostics in the
Neo.mjs repo. It is **not** auto-loaded through project-doc fallback while the
repository root contains `AGENTS.md`: Codex project-doc discovery loads at most
one instruction file per directory, so root `AGENTS.md` wins before configured
fallback files such as `.codex/CODEX.md`.

Normal repo-root Codex turns receive this file through the trusted project-local
`UserPromptSubmit` hook in `.codex/hooks.json`. The hook emits this file as
developer context, keeping `.codex/config.toml` ignored and customizable.

Do not hard-code the active model here. Model identity is turn/runtime metadata
and can drift independently of the Codex Desktop harness.

## Runtime Notes

- GitHub username: `neo-gpt`.
- A2A peers: Claude at `neo-opus-ada`; Gemini at
  `neo-gemini-pro`.
- `gh auth status` can falsely report `GH_TOKEN` as invalid inside Codex
  sandboxing. Verify identity with `gh api user --jq .login` before treating
  auth as broken. Expected Codex identity: `neo-gpt`.
- `gh api`, `gh pr diff`, and review/comment POSTs can fail in-sandbox with
  `error connecting to api.github.com`. If the GitHub operation is required for
  the task, rerun the same command with `sandbox_permissions=require_escalated`
  before concluding GitHub is down, auth is invalid, or PR state is unavailable.
- For state-changing GitHub calls, preserve the exact payload when retrying
  escalated so the sandbox retry does not mutate review/comment semantics.
- Mid-session harness restart: read `.codex/HARNESS_RESTART.md` before diagnosing MCP, Chroma, GitHub, or wake-state failures.
- If Codex reports `[features].codex_hooks is deprecated. Use [features].hooks instead.`,
  the tracked `.codex/config.template.toml` is already current. Update the ignored
  local `.codex/config.toml` copy to `[features].hooks = true` or re-copy the
  template; do not commit `.codex/config.toml`.

## Identity & Prompt Firewall (L1 Anchor)

See `AGENTS.md` `<prompt_firewall name="Helpful_Assistant_Regression_Defense">` for the canonical identity anchor. Do not deviate.
