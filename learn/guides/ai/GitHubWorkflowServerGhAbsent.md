# Reproducing `gh`-absent startup behavior

This document contains steps to reproduce the server behavior when the GitHub CLI (`gh`) is not installed or not present on the process `PATH`.

Purpose

- Provide reproducible steps for maintainers and CI to validate the server's behavior when `gh` is absent.
- Provide quick remediation commands for users.

Reproduction (temporary PATH removal)

1. Open PowerShell in the repository root.
2. Save the current PATH and start a session with `gh` removed from PATH for the session only:

```powershell
$origPATH = $env:PATH
$env:PATH = ($env:PATH -split ';' | Where-Object { $_ -notmatch 'GitHub CLI' -and $_ -notmatch 'GitHub' }) -join ';'

# Start the MCP stdio server in this session (gh will be hidden)
node C:/dev/open_source/neo/ai/mcp/server/github-workflow/mcp-stdio.mjs --debug

# When finished, restore your PATH
$env:PATH = $origPATH
```

3. Observe the server startup logs. Expected behavior:
   - The server should not crash.
   - HealthService should report a clear message indicating `gh` is not installed or not available in PATH.
   - The server should start and continue to run with tools disabled until `gh` becomes available.

Alternative single-command test (no session PATH change)

```powershell
cmd /C "set PATH=C:\Windows\System32;C:\Windows; & node C:\dev\open_source\neo\ai\mcp\server\github-workflow\mcp-stdio.mjs --debug"
```

Runbook / Remediation

- If `gh` is missing: install from https://cli.github.com/
- If `gh` is installed but unauthenticated: run `gh auth login` and follow the prompts.

Acceptance criteria

- Logs contain a clear, actionable message when `gh` is absent (e.g., "GitHub CLI is not installed or not available in PATH. Please install it or run `gh auth login`.").
- Server does not exit or crash when `gh` is absent.
