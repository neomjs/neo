# Local Docker Agent OS

Steady-state operator procedure for the one-machine local deployment. Docker
owns the Memory Core, Knowledge Base, Chroma, corpus, WAL, and scheduler plane
through Compose-managed volumes.

The pre-Docker checkout `.neo-ai-data` — including
`/Users/Shared/github/neomjs/neo/.neo-ai-data` — is an import source, never a
live target. Never bind, copy, move, or rsync it over the Docker plane.

## Topology

- `container-plane`: the Docker Orchestrator owns every graph/corpus task.
- `host-edge`: a graphless launchd Orchestrator initially owns only LM Studio
  supervision on `127.0.0.1:1234`.
- `com.neomjs.agent-os-wake`: the separate signed Shape-B receiver owns
  final-mile wake delivery on host port `3199`.

Both host processes keep state under
`~/Library/Application Support/Neo/AgentOS`, outside every checkout plane.
`legacy-mixed` and Shape C are not part of this topology.

## The containerized stack alone is not a complete Agent OS

Compose brings up the Memory Core, Knowledge Base, Chroma, and the plane-owning
Orchestrator, and it reports healthy. It has **no wake delivery and no
host-bound effects** — those belong to the host edge, a second process that
Compose neither starts nor mentions. A stack that looks complete while wake is
dead is the failure this section exists to prevent; it ran that way here for
hours.

If you are exploring a fork and only want the containerized half, that is a
valid deployment — you simply do not get wakes.

## Platform matrix

The **runtime is portable**: `ai/daemons/orchestrator/hostEdge.mjs` and
`ai/daemons/wake/receiver.mjs` run anywhere Node runs. Only the **supervision**
is platform-specific.

| Platform | Run it | Keep it running |
|---|---|---|
| any (macOS, Linux, Windows) | `npm run ai:host-edge` | your terminal, or your own supervisor |
| macOS | same command | the launchd install below (`RunAtLoad` + `KeepAlive`) |
| Linux | same command | a systemd user unit wrapping it — not supplied here |

`npm run ai:host-edge` resolves the **complete** host-edge posture from
`ai/deploy/hostEdgeProfile.mjs`: the `host-edge` role, `deploymentMode=local`,
a state root outside every checkout, and the lane closure. No installer, no
plist, no shell-specific syntax. Every key yields to an explicit environment
value, so a machine without LM Studio starts with
`NEO_ORCHESTRATOR_LMS_ENABLED=false` set and nothing else changed.

**`npm run ai:orchestrator` is not the host edge.** It starts the same daemon
with no role declared, and since #16229 that refuses rather than resolving one:
a role is declared, never inherited. Before the cutover it produced the right
thing; the container now owns `container-plane`, so a host process claiming it
is a duplicate owner, and the refusal is what makes that visible instead of
silent. Declare a role explicitly if you need that entrypoint directly.

## Start the container plane

Run from the repository root after provisioning `.env` and the mode-0600
`.neo-ai-secrets/mcp-auth-token`:

```sh
docker compose --env-file .env \
  -f ai/deploy/docker-compose.yml \
  -f ai/deploy/docker-compose.local-agent-os.yml \
  --profile cloud --profile ingress up -d --wait
```

The canonical project is `neo-local-agent-os` unless
`NEO_LOCAL_AGENT_OS_PROJECT_NAME` explicitly overrides it.

## Install the host edge (macOS, supervised)

This section is macOS-only: `launchctl` and `plutil` do not exist elsewhere. It
buys restart-on-login and nothing more — the posture itself comes from
`hostEdgeProfile.mjs` either way, so the supervised process and a bare
`npm run ai:host-edge` run identical configuration.

Preserve each current wake subscription's one-time signing key in
`routes.json`; never print or commit that file. Its schema is validated by
`ai/daemons/wake/receiver.mjs`.

```sh
export NEO_REPO_ROOT="$(pwd -P)"
export NEO_AGENT_OS_HOST_ROOT="${HOME}/Library/Application Support/Neo/AgentOS"
export NEO_WAKE_RECEIVER_ROOT="${NEO_AGENT_OS_HOST_ROOT}/wake"
export NEO_WAKE_RECEIVER_MANIFEST="${NEO_WAKE_RECEIVER_ROOT}/routes.json"
export NEO_WAKE_RECEIVER_STATE_DIR="${NEO_WAKE_RECEIVER_ROOT}/state"
export NEO_HOST_EDGE_STATE_DIR="${NEO_AGENT_OS_HOST_ROOT}/host-edge"
export NEO_WAKE_PLIST="${HOME}/Library/LaunchAgents/com.neomjs.agent-os-wake.plist"
export NEO_HOST_EDGE_PLIST="${HOME}/Library/LaunchAgents/com.neomjs.agent-os-host-edge.plist"

install -d -m 700 \
  "${NEO_WAKE_RECEIVER_ROOT}" \
  "${NEO_WAKE_RECEIVER_STATE_DIR}" \
  "${NEO_HOST_EDGE_STATE_DIR}" \
  "${HOME}/Library/LaunchAgents"
```

For a fresh install, each resident creates its own signed Shape-B route through
its authenticated Memory Core connection:

```js
manage_wake_subscription({
    action               : 'subscribe',
    trigger              : 'SENT_TO_ME',
    filters              : {priority: 'high'},
    harnessTarget        : 'a2a-webhook',
    harnessTargetMetadata: {
        url            : 'http://host.docker.internal:3199/wake',
        adapter        : 'osascript',
        appName        : 'Codex',
        focusSeedKey   : 'r',
        addressType    : 'userDataDir',
        instanceAddress: '/absolute/validated/seat-profile'
    }
})
```

The result returns `subscriptionId` and `signingKey` once. Before losing that
response, create the external manifest as mode 0600 and add one route per
resident:

```json
{
  "schemaVersion": 1,
  "routes": {
    "WAKE_SUB:<subscription-id>": {
      "signingKey": "<one-time-signing-key>",
      "agentIdentity": "@resident",
      "harnessTargetMetadata": {
        "adapter": "osascript",
        "appName": "Codex",
        "focusSeedKey": "r",
        "addressType": "userDataDir",
        "instanceAddress": "/absolute/validated/seat-profile"
      },
      "adapterConfig": {"attemptTimeoutMs": 30000}
    }
  }
}
```

```sh
test ! -e "${NEO_WAKE_RECEIVER_MANIFEST}"
install -m 600 /dev/null "${NEO_WAKE_RECEIVER_MANIFEST}"
# Fill routes.json in an editor without printing its keys, then:
node -e 'JSON.parse(require("node:fs").readFileSync(process.env.NEO_WAKE_RECEIVER_MANIFEST,"utf8"))'
```

For an update, preserve the existing external manifest. In either case:

```sh
test -s "${NEO_WAKE_RECEIVER_MANIFEST}"
test "$(stat -f '%Lp' "${NEO_WAKE_RECEIVER_MANIFEST}")" = "600"

if launchctl print "gui/$(id -u)/com.neomjs.agent-os-wake" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/com.neomjs.agent-os-wake"
fi
if launchctl print "gui/$(id -u)/com.neomjs.agent-os-host-edge" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/com.neomjs.agent-os-host-edge"
fi

cp ai/deploy/com.neomjs.agent-os-wake.plist "${NEO_WAKE_PLIST}"
plutil -replace ProgramArguments.0 -string "$(command -v node)" "${NEO_WAKE_PLIST}"
plutil -replace ProgramArguments.3 -string "${NEO_WAKE_RECEIVER_MANIFEST}" "${NEO_WAKE_PLIST}"
plutil -replace ProgramArguments.5 -string "${NEO_WAKE_RECEIVER_STATE_DIR}" "${NEO_WAKE_PLIST}"
plutil -replace ProgramArguments.7 -string "0.0.0.0" "${NEO_WAKE_PLIST}"
plutil -replace ProgramArguments.9 -string "3199" "${NEO_WAKE_PLIST}"
plutil -replace WorkingDirectory -string "${NEO_REPO_ROOT}" "${NEO_WAKE_PLIST}"
plutil -replace EnvironmentVariables.PATH -string "${PATH}" "${NEO_WAKE_PLIST}"
plutil -replace StandardOutPath -string "${NEO_WAKE_RECEIVER_STATE_DIR}/launchd.out.log" "${NEO_WAKE_PLIST}"
plutil -replace StandardErrorPath -string "${NEO_WAKE_RECEIVER_STATE_DIR}/launchd.err.log" "${NEO_WAKE_PLIST}"
plutil -lint "${NEO_WAKE_PLIST}"

cp ai/deploy/com.neomjs.agent-os-host-edge.plist "${NEO_HOST_EDGE_PLIST}"
plutil -replace ProgramArguments.0 -string "$(command -v node)" "${NEO_HOST_EDGE_PLIST}"
plutil -replace WorkingDirectory -string "${NEO_REPO_ROOT}" "${NEO_HOST_EDGE_PLIST}"
plutil -replace EnvironmentVariables.PATH -string "${PATH}" "${NEO_HOST_EDGE_PLIST}"
plutil -replace EnvironmentVariables.NEO_AI_ORCHESTRATOR_DIR -string "${NEO_HOST_EDGE_STATE_DIR}" "${NEO_HOST_EDGE_PLIST}"
plutil -replace StandardOutPath -string "${NEO_HOST_EDGE_STATE_DIR}/launchd.out.log" "${NEO_HOST_EDGE_PLIST}"
plutil -replace StandardErrorPath -string "${NEO_HOST_EDGE_STATE_DIR}/launchd.err.log" "${NEO_HOST_EDGE_PLIST}"
plutil -lint "${NEO_HOST_EDGE_PLIST}"

launchctl bootstrap "gui/$(id -u)" "${NEO_WAKE_PLIST}"
launchctl bootstrap "gui/$(id -u)" "${NEO_HOST_EDGE_PLIST}"
```

Bind `3199` only where Docker Desktop can reach it; keep it blocked from
untrusted networks.

The host-edge LaunchAgent is a **supervision wrapper** (#16229): it launches
`hostEdge.mjs` and carries only what is genuinely machine-specific — this
machine's state root and its pinned local LM Studio port and
generation/embedding model IDs. Changing a `NEO_LOCAL_AGENT_OS_*` provider
selection still requires a reviewed matching LaunchAgent change. It no longer
carries the role, the deployment mode, or the lane closure, so the supervised
path and the portable one cannot drift apart.

## Prove authority and health

```sh
docker compose --env-file .env \
  -f ai/deploy/docker-compose.yml \
  -f ai/deploy/docker-compose.local-agent-os.yml \
  --profile cloud --profile ingress ps

node ai/scripts/diagnostics/mcpHealthcheck.mjs \
  --url http://127.0.0.1:3102 --mcp-path /mc/mcp \
  --bearer-token-env GH_TOKEN \
  --expected-plane-id neo-local-canonical \
  --expected-plane-data-root /app/.neo-ai-data

node ai/scripts/diagnostics/mcpHealthcheck.mjs \
  --url http://127.0.0.1:3102 --mcp-path /kb/mcp \
  --bearer-token-env GH_TOKEN \
  --expected-plane-id neo-local-canonical \
  --expected-plane-data-root /app/.neo-ai-data

launchctl print "gui/$(id -u)/com.neomjs.agent-os-wake"
launchctl print "gui/$(id -u)/com.neomjs.agent-os-host-edge"

node --input-type=module -e \
  'import fs from "node:fs"; const root=`${process.env.HOME}/Library/Application Support/Neo/AgentOS`; const r=JSON.parse(fs.readFileSync(`${root}/host-edge/orchestrator-authority.json`)); if(r.role!=="host-edge") process.exit(1)'
```

The authority receipt must say `host-edge`; no host process may open the Docker
SQLite or Chroma plane.

## Stop or recover

Stop only the host edges when repairing their configuration:

```sh
launchctl bootout "gui/$(id -u)/com.neomjs.agent-os-wake"
launchctl bootout "gui/$(id -u)/com.neomjs.agent-os-host-edge"
```

Never recover by moving a checkout `.neo-ai-data` into place or replacing the
Docker volumes. Logical import, rebuild, backup, or restore work requires a
separately reviewed procedure and a quiesced writer plane.
