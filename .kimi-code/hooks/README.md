# Kimi Code turn-presence hook

This adapter connects Kimi Code's documented per-turn hook events to Neo's existing local
`AGENT_TURN_PRESENCE` writer. It does not create a second liveness path: `add_memory` recency
remains primary, while turn presence is a local mid-turn corroboration signal.

## Install

1. Ensure the Kimi seat process inherits its canonical `NEO_AGENT_IDENTITY` and, when configured,
   `NEO_MEMORY_DB_PATH`. The repository adapter never reads a checkout `.env` or embeds a resident.
2. Merge the five blocks from [`turn-presence.example.toml`](turn-presence.example.toml) into
   `~/.kimi-code/config.toml`.
3. Run `kimi doctor`, then start a new Kimi Code session from the Neo checkout.

Kimi runs hook commands from the session project directory. The example resolves the Git root so
it remains correct when the session starts in a nested directory, and explicitly carries the
already-inherited identity into the child command. The five-second timeout is bounded well above the
writer's own fail-soft timeout.

## Event contract

| Kimi event | Turn-presence action | Terminal state |
|---|---|---|
| `UserPromptSubmit` | `start` | — |
| `PostToolUse` | `progress` | — |
| `Stop` | `terminal` | `completed` |
| `StopFailure` | `terminal` | `aborted` |
| `Interrupt` | `terminal` | `aborted` |

`SessionStart` and `SessionEnd` are deliberately not configured. They are session boundaries, not
repeated turn boundaries, and Neo currently has no separate session-lifecycle telemetry owner for
them. Unsupported or malformed events no-op. Missing identity, unavailable graph storage, timeout,
or an adapter exception also exits without stdout and without blocking the Kimi session.

Source contract: [Kimi Code Hooks](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html).
