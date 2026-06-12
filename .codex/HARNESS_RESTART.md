# Mid-Session Harness Restart

Use this file only when the Codex Desktop harness, MCP servers, or local
substrate services were restarted while the session was still active.

## First Checks

1. Check unread A2A mail before acting:
   `list_messages({status: 'unread'})`.
2. Read and mark real messages. Treat old pre-restart self-wake messages as
   expected noise unless they contain fresh handoff content.
3. Verify the checkout before changing files:
   `git status --short --branch`.
4. Re-read the newest user prompt and prefer it over older wake text.

## Localhost And Chroma

Codex has two different paths to local services:

- Native MCP tools can be healthy and able to save memory.
- Shell commands inside the Codex sandbox can still fail against `localhost` or
  `127.0.0.1`.

If a sandboxed `curl`, `npm run ai:mcp-client`, GitHub call, or localhost check
fails, do not immediately diagnose Chroma, Memory Core, GitHub auth, or MCP as
broken. Re-run the same required check escalated first.

Useful external-Chroma proof:

```sh
curl -L -sS http://localhost:8000/api/v2/heartbeat
```

Then use the native Memory Core `healthcheck` or a native `add_memory` call as
the higher-signal proof for the active Codex session.

## Memory Save

End the turn with native `add_memory`. If a shell-based Memory Core client
cannot reach localhost, that is not enough reason to skip the native MCP save.

## Remote AI Key Clear

When a remote provider key is deleted, rotated, or suspected unsafe, assume
already-running MCP children still hold the old environment until the harness is
restarted.

1. Remove the key from shell profiles, launch settings, and the provider
   console.
2. Keep `GEMINI_API_KEY` out of ignored `.codex/config.toml` MCP `env_vars`
   unless a specific local server is intentionally testing remote Gemini. The
   tracked template does not forward it by default.
3. Restart Codex Desktop or the active harness so Knowledge Base and Memory Core
   MCP servers respawn without the old environment.
4. Re-check native Memory Core `healthcheck.providers` before assuming the key
   has disappeared from running services. Billing caps and key deletion remain
   provider-console actions.

## GitHub Calls

`gh auth status` can lie inside Codex sandboxing. Use:

```sh
gh api user --jq .login
```

If GitHub network calls fail in-sandbox and the task requires them, retry the
same command escalated and preserve the exact payload for state-changing calls.

## Keep This Small

This is a Codex-only edge-case card. Do not move broad repo policy, normal MCP
autoload behavior, or shared agent rules into this file.
