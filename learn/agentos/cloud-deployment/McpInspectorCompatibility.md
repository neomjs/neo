# MCP Inspector PAT Compatibility

This guide records the verified MCP Inspector path for a cloud-deployed Neo MCP
server running GitLab-PAT bearer authentication. The useful baseline is
Inspector v0.21.2 with a manually supplied bearer token.

## Result

Inspector v0.21.2 works with Neo's PAT mode when the request carries an explicit
`Authorization: Bearer <token>` header.

No OAuth Dynamic Client Registration shim is justified for this path. The server
must return a bare bearer `401` for missing or invalid tokens, without OAuth
protected-resource metadata. With that shape, Inspector does not need GitLab to
support Dynamic Client Registration.

## Prerequisites

- The MCP server is reachable over Streamable HTTP at its `/mcp` endpoint.
- PAT authentication is enabled on the server.
- The token validates against the configured GitLab API `/api/v4/user` endpoint.
- The PAT is stored in an environment variable, not in a committed config file.

Example:

```bash
export NEO_MCP_TOKEN="<your-gitlab-pat>"
export NEO_MC_MCP_URL="https://mcp.<your-host>/mc/mcp"
export NEO_KB_MCP_URL="https://mcp.<your-host>/kb/mcp"
```

## Inspector UI

Start Inspector:

```bash
npx -y @modelcontextprotocol/inspector@0.21.2
```

Use these connection settings:

| Field | Value |
|---|---|
| Transport | Streamable HTTP |
| URL | `https://mcp.<your-host>/mc/mcp` or `https://mcp.<your-host>/kb/mcp` |
| Authentication type | Bearer token |
| Header name | `Authorization` |
| Token value | the GitLab PAT from `NEO_MCP_TOKEN` |

Then connect and run `tools/list`. A successful connection lists the server's
tools. If Inspector reports a bearer `401`, first verify that the token value is
present in the UI and that the server can validate it against GitLab.

## Inspector CLI

Use the CLI path for a deterministic smoke test:

```bash
npx -y @modelcontextprotocol/inspector@0.21.2 --cli "$NEO_MC_MCP_URL" \
  --transport http \
  --method tools/list \
  --header "Authorization: Bearer ${NEO_MCP_TOKEN}"
```

For Knowledge Base, replace the target URL with `$NEO_KB_MCP_URL`.

Expected outcome:

- Without `--header`, Inspector fails during `initialize` with the server's bare
  bearer `401`.
- With `--header "Authorization: Bearer ${NEO_MCP_TOKEN}"`, Inspector completes
  `initialize`, sends `notifications/initialized`, and returns `tools/list`.

## Falsification Matrix

The verified matrix used a local GitLab API mock and a local Neo Memory Core
server running PAT mode. The mock accepted only `Bearer test-token` at
`/api/v4/user`; all other requests returned `401`.

| Probe | Expected result |
|---|---|
| Direct Inspector CLI without bearer header | Fails with the server's bare bearer `401` |
| Direct Inspector CLI with bearer header | Succeeds and returns `tools/list` |
| Inspector proxy path without bearer header | Returns an upstream `401` envelope with `WWW-Authenticate: Bearer` |
| Inspector proxy path with bearer header | Succeeds and returns the server `initialize` result |

This proves that Inspector v0.21.2 forwards an explicit bearer header in both
the direct CLI and proxy-mediated paths. If a later Inspector version regresses,
rerun the matrix before proposing a heavier OAuth or Dynamic Client Registration
adapter.

## Failure Triage

| Symptom | Meaning | Next check |
|---|---|---|
| `Missing Authorization header` | Inspector reached the server but did not send a bearer token. | Re-enter the token or add the CLI `--header`. |
| `GitLab PAT validation failed` | The server forwarded the token to GitLab and GitLab rejected it. | Verify token scope, expiry, and GitLab API base URL. |
| OAuth or Dynamic Client Registration prompt | The server likely advertised OAuth metadata or a proxy inserted it. | Confirm PAT mode returns a bare bearer `401` with no protected-resource metadata. |
| `Invalid Host` | The MCP SDK host allowlist rejected the request before auth. | Set the server public URL or allowed-host list for the deployment hostname. |

## Decision

Use the manual bearer path for Inspector v0.21.2. Do not add a Dynamic Client
Registration shim unless a future Inspector version removes or breaks explicit
bearer-header forwarding and the regression is reproduced against a PAT-mode
Neo endpoint.
