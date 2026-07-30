# One-machine Docker Agent OS cutover

Temporary operator procedure for #16167. Run only from the exact merged
cutover-preparation revision. After the accepted live receipt, the cleanup PR
deletes this procedure and every legacy/parity surface the cut made obsolete.

This is one forward cut, not a maintained migration product. Rollback is allowed
only before the first resident is released onto the new endpoint.

## 1. Prepare outside the writer-stop window

From the repository root, require a clean exact merged revision and the
gitignored `.env` containing `GH_TOKEN`. Provision that PAT once into the
gitignored Compose secret source; subsequent `up` invocations consume the file
and do not require a credential in the invoking shell. The canonical Compose
project name, host bind, provider route, and restart policies live in the
reviewed Compose files; only the image revision is cutover-specific. Persist
that revision and the rollback coordinates outside the repository so they
survive the required reboot:

```sh
export NEO_EXPECTED_CUTOVER_REVISION="paste-full-merged-sha-from-16167"
test "${#NEO_EXPECTED_CUTOVER_REVISION}" -eq 40
test -z "$(git status --porcelain)"
test "$(git rev-parse HEAD)" = "${NEO_EXPECTED_CUTOVER_REVISION}"
export NEO_REVISION="${NEO_EXPECTED_CUTOVER_REVISION}"
export NEO_CUTOVER_STAGE="/Users/Shared/neo-agent-os-cutover-16167"
export NEO_CUTOVER_OLD_ROOT="${NEO_CUTOVER_STAGE}/pre-docker-root"

test ! -e "${NEO_CUTOVER_STAGE}"
mkdir -m 700 "${NEO_CUTOVER_STAGE}"
install -d -m 700 .neo-ai-secrets
node --input-type=module -e \
  'import fs from "node:fs"; import {parse} from "dotenv"; const token=parse(fs.readFileSync(".env")).GH_TOKEN?.trim(); if(!token) process.exit(1); fs.writeFileSync(".neo-ai-secrets/mcp-auth-token", `${token}\n`, {mode:0o600}); fs.chmodSync(".neo-ai-secrets/mcp-auth-token",0o600)'
test "$(stat -f '%Lp' .neo-ai-secrets/mcp-auth-token)" = "600"
node --input-type=module -e \
  'import fs from "node:fs"; fs.writeFileSync(`${process.env.NEO_CUTOVER_STAGE}/cutover-state.json`, JSON.stringify({revision:process.env.NEO_REVISION,oldRoot:process.env.NEO_CUTOVER_OLD_ROOT},null,2), {mode:0o600})'

docker compose --env-file .env \
  -f ai/deploy/docker-compose.yml \
  -f ai/deploy/docker-compose.local-agent-os.yml \
  --profile cloud --profile ingress config --quiet

docker compose --env-file .env \
  -f ai/deploy/docker-compose.yml \
  -f ai/deploy/docker-compose.local-agent-os.yml \
  --profile cloud --profile ingress build
```

Immediately before quiescing the machine, each intended resident creates one
`SENT_TO_ME` Shape-B route through its current authenticated Memory Core session:

```js
manage_wake_subscription({
    action               : 'subscribe',
    trigger              : 'SENT_TO_ME',
    filters              : {priority: 'high'},
    harnessTarget        : 'a2a-webhook',
    harnessTargetMetadata: {url: 'http://host.docker.internal:3199/wake'}
})
```

The response returns `subscriptionId` plus `signingKey` once. Preserve each pair
directly in `.neo-ai-data/wake-receiver/routes.json`; never paste a key into the
ticket, logs, shell history, or tracked files. The manifest is the deliberately
small host-only route map consumed by #16180:

```json
{
  "schemaVersion": 1,
  "routes": {
    "WAKE_SUB:<subscription-id>": {
      "signingKey": "<server-returned-signing-key>",
      "agentIdentity": "@neo-gpt",
      "harnessTargetMetadata": {
        "adapter": "osascript",
        "appName": "Codex",
        "focusSeedKey": "r",
        "addressType": "userDataDir",
        "instanceAddress": "/absolute/validated/seat-profile"
      },
      "adapterConfig": {
        "attemptTimeoutMs": 30000
      }
    }
  }
}
```

Use the already-validated adapter metadata for each seat; do not retarget a
resident by convenience. Stage and validate the manifest without printing it:

```sh
install -d -m 700 .neo-ai-data/wake-receiver
install -d -m 700 .neo-ai-data/wake-receiver/state
test ! -e .neo-ai-data/wake-receiver/routes.json
install -m 600 /dev/null .neo-ai-data/wake-receiver/routes.json
# Fill routes.json in an editor, then:
node -e 'JSON.parse(require("node:fs").readFileSync(".neo-ai-data/wake-receiver/routes.json","utf8"))'
test "$(stat -f '%Lp' .neo-ai-data/wake-receiver/routes.json)" = "600"
```

Create these routes as the final preparation step, then quiesce immediately.
Shape C remains the live delivery path until the writer stop; do not send a
duplicate wake witness during this short overlap.

Do not continue unless Docker is healthy, the provider endpoint is reachable
from Docker, `git status --short` is empty, `HEAD` is the merged revision named
in the ticket receipt, the external state file names that same revision, and
the 0600 route manifest contains every resident intended for the first release.

## 2. Quiesce writers, back up, then stop Chroma

Sunset/close all resident sessions so they stop spawning stdio Memory Core and
Knowledge Base writers. Stop the terminal/process running `legacy-mixed`, then
terminate its surviving wake, embed, and message children. `Orchestrator.stop()`
ends polling but does not reap those children. Deliberately leave the old Chroma
server running: the logical backup reads it through the API.

First prove every competing writer is gone and port 8000 still belongs to the
expected Chroma process:

```sh
ps -axo pid=,command= | rg \
  '[a]i/(mcp/server/(memory-core|knowledge-base)/mcp-server|daemons/.+/daemon|scripts/(lifecycle|maintenance)/.+)\.mjs'
lsof -nP -iTCP:8000 -sTCP:LISTEN
```

The process census must be empty; the listener probe must show exactly the
expected Chroma server. Stop every competing writer and repeat both probes until
that invariant holds. Local model-provider processes are not plane writers and
may stay running.

With writers quiesced and Chroma still alive, create the logical backup and
require the authoritative restorable verdict:

```sh
export NEO_CUTOVER_BACKUP_STARTED_MS="$(node -e 'process.stdout.write(String(Date.now()))')"
npm run ai:backup
node --input-type=module -e \
  'import fs from "node:fs"; import path from "node:path"; import {verifyLatestBackupRestorable} from "./ai/scripts/maintenance/restore.mjs"; const receipt=JSON.parse(fs.readFileSync(".neo-ai-data/backups/last-backup-receipt.json")); const verdict=await verifyLatestBackupRestorable({backupRoot:".neo-ai-data/backups"}); const fresh=Date.parse(receipt.finishedAt)>=Number(process.env.NEO_CUTOVER_BACKUP_STARTED_MS); const same=path.basename(verdict.bundleRoot||"")===receipt.bundleName; console.log(JSON.stringify({receipt,verdict})); if(!fresh||receipt.backup?.status!=="success"||receipt.backup?.error||verdict.code!=="RESTORABLE"||!same) process.exit(1); const statePath=`${process.env.NEO_CUTOVER_STAGE}/cutover-state.json`; const state=JSON.parse(fs.readFileSync(statePath)); fs.writeFileSync(statePath,JSON.stringify({...state,backupBundle:receipt.bundleName,backupFinishedAt:receipt.finishedAt},null,2),{mode:0o600})'
```

Now terminate the Chroma process named by the listener probe and prove the old
plane has no remaining owner:

```sh
ps -axo pid=,command= | rg \
  '[a]i/(mcp/server/(memory-core|knowledge-base)/mcp-server|daemons/.+/daemon|scripts/(lifecycle|maintenance)/.+)\.mjs|[c]hroma run'
lsof -nP -iTCP:8000 -sTCP:LISTEN
```

Both final commands must produce no process/listener. Never copy or move the
plane while either final probe is non-empty.

## 3. Materialize the canonical plane once

This machine currently shares several `.neo-ai-data` members through absolute
symlinks into another checkout. Containers must not preserve that compatibility
layer. Materialize one physical root while the old root remains outside the
repository as the rollback snapshot:

```sh
test -f "${NEO_CUTOVER_STAGE}/cutover-state.json"
test ! -e "${NEO_CUTOVER_OLD_ROOT}"
rsync -aL .neo-ai-data/ "${NEO_CUTOVER_STAGE}/plane/"
test -z "$(find "${NEO_CUTOVER_STAGE}/plane" -type l -print -quit)"
mv .neo-ai-data "${NEO_CUTOVER_OLD_ROOT}"
mv "${NEO_CUTOVER_STAGE}/plane" .neo-ai-data
```

Keep the entire `NEO_CUTOVER_STAGE` until the live receipt is accepted.

## 4. Start the final topology

Start the canonical container plane:

```sh
docker compose --env-file .env \
  -f ai/deploy/docker-compose.yml \
  -f ai/deploy/docker-compose.local-agent-os.yml \
  --profile cloud --profile ingress up -d --wait
```

The only persistent host edge is the signed, graphless Shape-B receiver.
Materialize its reviewed LaunchAgent template outside the repository, then load
it:

```sh
export NEO_REPO_ROOT="$(pwd -P)"
export NEO_WAKE_PLIST_STAGE="${NEO_CUTOVER_STAGE}/com.neomjs.agent-os-wake.plist"
export NEO_WAKE_RECEIVER_MANIFEST="${NEO_REPO_ROOT}/.neo-ai-data/wake-receiver/routes.json"
export NEO_WAKE_RECEIVER_STATE_DIR="${NEO_REPO_ROOT}/.neo-ai-data/wake-receiver/state"
export NEO_WAKE_RECEIVER_HOST="0.0.0.0"
export NEO_WAKE_RECEIVER_PORT="3199"

mkdir -p .neo-ai-data/wake-receiver ~/Library/LaunchAgents
cp ai/deploy/com.neomjs.agent-os-wake.plist "${NEO_WAKE_PLIST_STAGE}"
plutil -replace ProgramArguments.0 -string "$(command -v node)" "${NEO_WAKE_PLIST_STAGE}"
plutil -replace ProgramArguments.3 -string "${NEO_WAKE_RECEIVER_MANIFEST}" "${NEO_WAKE_PLIST_STAGE}"
plutil -replace ProgramArguments.5 -string "${NEO_WAKE_RECEIVER_STATE_DIR}" "${NEO_WAKE_PLIST_STAGE}"
plutil -replace ProgramArguments.7 -string "${NEO_WAKE_RECEIVER_HOST}" "${NEO_WAKE_PLIST_STAGE}"
plutil -replace ProgramArguments.9 -string "${NEO_WAKE_RECEIVER_PORT}" "${NEO_WAKE_PLIST_STAGE}"
plutil -replace WorkingDirectory -string "${NEO_REPO_ROOT}" "${NEO_WAKE_PLIST_STAGE}"
plutil -replace EnvironmentVariables.PATH -string "${PATH}" "${NEO_WAKE_PLIST_STAGE}"
plutil -replace StandardOutPath -string "${NEO_REPO_ROOT}/.neo-ai-data/wake-receiver/launchd.out.log" "${NEO_WAKE_PLIST_STAGE}"
plutil -replace StandardErrorPath -string "${NEO_REPO_ROOT}/.neo-ai-data/wake-receiver/launchd.err.log" "${NEO_WAKE_PLIST_STAGE}"
plutil -lint "${NEO_WAKE_PLIST_STAGE}"
cp "${NEO_WAKE_PLIST_STAGE}" ~/Library/LaunchAgents/com.neomjs.agent-os-wake.plist
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.neomjs.agent-os-wake.plist
launchctl print "gui/$(id -u)/com.neomjs.agent-os-wake"
```

No host Orchestrator is started. Compose owns all Agent OS maintenance; launchd
owns only durable signed acceptance and the per-host final-mile adapter. Binding
`0.0.0.0` is explicit because Docker Desktop must reach the host service; keep
port 3199 blocked from untrusted networks at the host firewall.

## 5. Prove the replacement before resident release

```sh
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

docker compose --env-file .env \
  -f ai/deploy/docker-compose.yml \
  -f ai/deploy/docker-compose.local-agent-os.yml \
  --profile cloud --profile ingress exec -T mc-server \
  node --input-type=module -e \
  'const r=await fetch("http://host.docker.internal:3199/wake"); if(r.status!==404) process.exit(1)'
```

Enable Docker's login startup, reboot/login once, and repeat `docker compose
... up -d --wait`, both routed healthchecks, and `launchctl print`. At the start
of every post-reboot or rollback shell, first rehydrate and validate the durable
cutover coordinates:

```sh
export NEO_CUTOVER_STAGE="/Users/Shared/neo-agent-os-cutover-16167"
export NEO_CUTOVER_OLD_ROOT="${NEO_CUTOVER_STAGE}/pre-docker-root"
export NEO_REVISION="$(node --input-type=module -e \
  'import fs from "node:fs"; const s=JSON.parse(fs.readFileSync(`${process.env.NEO_CUTOVER_STAGE}/cutover-state.json`)); process.stdout.write(s.revision)')"

test -d "${NEO_CUTOVER_OLD_ROOT}"
test "$(git rev-parse HEAD)" = "${NEO_REVISION}"
```

The Compose services use `restart: unless-stopped`; the actual reboot proof, not
that policy alone, is the acceptance evidence.

Back up the two isolated Codex seat configs before editing them:

```sh
install -m 600 \
  /Users/Shared/codex/neomjs/neo/.codex/config.toml \
  "${NEO_CUTOVER_STAGE}/neo-gpt.codex-config.pre-cutover.toml"
install -m 600 \
  /Users/Shared/agents/neo-gpt-emmy/neomjs/neo/.codex/config.toml \
  "${NEO_CUTOVER_STAGE}/neo-gpt-emmy.codex-config.pre-cutover.toml"
```

In each source file above, replace only the root
`mcp_servers."neo-mjs-memory-core"` and
`mcp_servers."neo-mjs-knowledge-base"` definitions with:

```toml
[mcp_servers."neo-mjs-memory-core"]
url = "http://127.0.0.1:3102/mc/mcp"
bearer_token_env_var = "NEO_MCP_REMOTE_TOKEN"
startup_timeout_sec = 30
tool_timeout_sec = 120
enabled = true

[mcp_servers."neo-mjs-knowledge-base"]
url = "http://127.0.0.1:3102/kb/mcp"
bearer_token_env_var = "NEO_MCP_REMOTE_TOKEN"
startup_timeout_sec = 30
tool_timeout_sec = 120
enabled = true
```

Remove the old `command`, `args`, `env_vars`, and direct `.env` subsections for
those two servers. Keep their existing `.tools.*` approval subsections. Leave
`klarso-mc`, `klarso-kb`, `neo-mjs-github-workflow`, and
`neo-mjs-neural-link` unchanged: this cut only retargets Neo Memory Core and
Knowledge Base.

Each isolated Codex application instance must receive its resident's GitHub PAT
as `NEO_MCP_REMOTE_TOKEN` in its own application environment before restart;
never put the bearer literal in TOML. Do not share one bootstrap identity and do
not alias the plane credential to the repository workflow's `GH_TOKEN` slot.
Fleet currently persists one encrypted remote-MCP bearer per tenant, while the
seat probe requires that bearer to resolve to the selected resident identity.
Before releasing a second resident, prove its tenant/seat credential maps to
that resident; a repository PAT, wake HMAC, or first resident's plane bearer is
not a substitute. If per-seat cardinality is not yet represented, keep that
resident stopped until the dedicated Fleet contract lands.

Fully quit and relaunch each isolated Codex application instance after its file
is changed; editing TOML does not retarget MCP tools already loaded by a running
resident. The Claude Desktop config is a separately owned cutover surface and
is not edited by this procedure. After the live receipt is accepted, update the
tracked `.codex/config.template.toml` to the remote steady state in the cleanup
series; do not point fresh residents at the replacement before the flip.

## Forward-only boundary

The first restarted resident is the irreversible release. Before that action,
a failed infrastructure proof may use the rollback below. After it, fix forward.

Restart one resident, then prove an authenticated Memory Core write/read, a
Knowledge Base query, and a high-priority direct message that traverses container
Memory Core → `http://host.docker.internal:3199/wake` → the exact resident. Check
that the receiver persisted one terminal record for the event, then restart the
Compose stack once more and repeat both routed healthchecks plus a resident MC/KB
call. Record revision, backup bundle and `RESTORABLE` verdict, external old-root
path, container image revisions, plane identity, distinct resident identity
calls, signed wake receipt, LaunchAgent state, and restart/reboot results on
#16167.

## Pre-release rollback only

Before any resident is released, a failed proof may roll back. Stop the
replacement host edge before moving its data, then stop the container plane:

```sh
launchctl bootout "gui/$(id -u)/com.neomjs.agent-os-wake"
mv ~/Library/LaunchAgents/com.neomjs.agent-os-wake.plist \
  "${NEO_CUTOVER_STAGE}/failed-wake-launchagent.plist"
ps -axo pid=,command= | rg '[a]i/daemons/wake/receiver\.mjs'

docker compose --env-file .env \
  -f ai/deploy/docker-compose.yml \
  -f ai/deploy/docker-compose.local-agent-os.yml \
  --profile cloud --profile ingress down

mv .neo-ai-data "${NEO_CUTOVER_STAGE}/failed-container-root"
mv "${NEO_CUTOVER_OLD_ROOT}" .neo-ai-data

install -m 600 \
  "${NEO_CUTOVER_STAGE}/neo-gpt.codex-config.pre-cutover.toml" \
  /Users/Shared/codex/neomjs/neo/.codex/config.toml
install -m 600 \
  "${NEO_CUTOVER_STAGE}/neo-gpt-emmy.codex-config.pre-cutover.toml" \
  /Users/Shared/agents/neo-gpt-emmy/neomjs/neo/.codex/config.toml
```

The receiver probe must be empty before the data move. Restart the tracked preparation
revision explicitly with `NEO_AI_DEPLOYMENT_MODE=local` and
`NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE=legacy-mixed`, then fully quit and
relaunch each restored Codex application instance. After resident release, do
not roll back: immediately open the cleanup PR(s), including removal of the
temporary Playwright `legacy-mixed` test-profile pin and every obsolete local
runtime surface.
