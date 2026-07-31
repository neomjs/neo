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

## Start the host edge — terminal, any platform

**The containerized stack alone has no wake delivery and no host-bound effects.** It comes up
healthy and looks complete; the host edge is a second, separate process you start yourself. If you
are trying the Agent OS in a fork and wondering why nudges never arrive, this section is why.

Two commands, no installer, from the repository root:

```sh
npm run ai:host-edge        # graphless host-edge Orchestrator (host-bound effects)
npm run ai:wake-receiver    # signed Shape-B wake receiver, host port 3199
```

Run them in their own terminals. Neither command is macOS-specific; both work on any platform Node
runs on. On Linux or Windows, supervise them with whatever your system already uses.

> **What the terminal path gives you today, stated precisely.** It resolves the correct *role*, so
> the process owns host-edge work and cannot claim the container's. It does **not** yet reproduce
> the full lane posture: the launchd plist additionally pins the host-edge state directory and ~20
> lane-enablement and provider values (`NEO_ORCHESTRATOR_KB_SYNC_ENABLED`, `…DEV_SERVER_ENABLED`,
> the daemon toggles, the local provider host). Started bare, the orchestrator therefore takes
> AiConfig defaults for those lanes and will run some the supervised install disables — and its
> authority receipt lands in the checkout rather than under
> `~/Library/Application Support/Neo/AgentOS`.
>
> So on macOS the supervised install below remains the complete path. The terminal path is correct
> for the role and incomplete for the lane set, which is a known gap rather than a preference:
> that configuration belongs in an AiConfig host-edge profile, not duplicated into a plist and an
> npm script. Until it moves, prefer the install for a long-running host edge and the terminal for
> a bounded run.

**Do not use `npm run ai:orchestrator` for this.** That entrypoint takes no role of its own, and the
daemon now refuses to start without one:

```
[Orchestrator] Failed to start: Required deployment configuration is missing or invalid:
  - NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE (orchestrator.authorityProfile): absent
```

A role is **declared, never inherited**. The container declares `container-plane` in its Compose
service; `ai:host-edge` declares `host-edge`. The refusal exists because there is no default that
could be correct for both: a shared default describes one owner's reality, so the other silently
claims a role it does not own — writing authority state and running maintenance lanes against the
wrong plane, with no error. Declaring is cheap; diagnosing a silent duplicate owner is not.

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

## Install the host edge

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
untrusted networks. The host-edge template intentionally pins the local
overlay's default LM Studio port and generation/embedding model IDs; changing a
`NEO_LOCAL_AGENT_OS_*` provider selection requires a reviewed matching
LaunchAgent change.

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
