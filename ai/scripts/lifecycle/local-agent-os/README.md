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

**Two processes, and neither one starts the other.** The host edge and the wake
receiver are independent: a host running only the host edge accepts no wakes, and
nothing on that host reports a problem, because from its side there is nothing to
report. Run both, or decide deliberately to run one.

They do **not** have the same platform reach. `hostEdge.mjs` runs anywhere Node
runs. `receiver.mjs` is **POSIX-only**, and not by convention — it refuses to
start unless its manifest carries no group or other permission bits:

```js
// ai/daemons/wake/receiver.mjs
if ((stat.mode & 0o077) !== 0) {
    throw new Error(`Wake receiver manifest '${manifestPath}' must be mode 0600`);
}
```

[Node documents](https://nodejs.org/api/fs.html#file-modes) that Windows exposes
no owner/group/other distinction and that `chmod` there can change only
writability, so a Windows host cannot express the mode this gate requires. That
is a deliberate secret-hygiene gate on a file holding signing keys, not an
oversight to route around — so the receiver row below names the platforms it can
actually serve rather than claiming one it cannot.

| Platform | Host edge | Wake receiver | Keep them running |
|---|---|---|---|
| macOS | `npm run ai:host-edge` | `npm run ai:wake-receiver` ([invocation](#start-the-wake-receiver)) | the launchd installs below (`RunAtLoad` + `KeepAlive`) — one per process |
| Linux | same | same | systemd user units wrapping them — not supplied here |
| Windows | `npm run ai:host-edge` | **not supported** — see the mode gate above | your own supervisor, host edge only |

A Windows host therefore gets host-bound effects and **no wake delivery**. That
is a real gap rather than a documentation shortcut: closing it needs a
Windows-appropriate manifest-permission contract in `receiver.mjs`, which is a
runtime change and not something this guide can assert on its behalf.

`npm run ai:host-edge` resolves the complete **host-edge** posture from
`ai/deploy/hostEdgeProfile.mjs`: the `host-edge` role, `deploymentMode=local`,
a state root outside every checkout, and the lane closure. No installer, no
plist, no shell-specific syntax. Complete for that role — it does **not** start
the wake receiver, which is a separate final-mile boundary with its own
manifest, state directory, and port.

Every key yields to an explicit environment value, so a machine without LM Studio
starts with `NEO_ORCHESTRATOR_LMS_ENABLED=false` set and nothing else changed.
**That flag governs LM Studio supervision only.** It does not disable wake, and
it is not a reason to skip the receiver — a no-LMS host still needs it running to
receive anything at all. Setting it and stopping there is the single most likely
way to end up with a permanently deaf seat that reports healthy.

**`npm run ai:orchestrator` is not the host edge.** It starts the same daemon
with no role declared, and since #16229 that refuses rather than resolving one:
a role is declared, never inherited. Before the cutover it produced the right
thing; the container now owns `container-plane`, so a host process claiming it
is a duplicate owner, and the refusal is what makes that visible instead of
silent. Declare a role explicitly if you need that entrypoint directly.

## Start the container plane

Run from **any** current repository root after provisioning `.env`, plus the
mode-0600 auth token at the machine-level path
`~/.neo-ai/secrets/mcp-auth-token` (override with `NEO_MCP_AUTH_TOKEN_FILE`).

**The token lives outside every checkout on purpose.** It used to be read from
`<checkout>/.neo-ai-secrets/mcp-auth-token`, so provisioning it once made exactly
one clone able to run the rebuild — and pinned the whole local plane to whatever
branch that clone sat on. Measured cost: a plane running 103 commits behind `dev`
while the fixes sat merged.

**Its value must be the token the plane already bootstrapped**, not a fresh one:
it is both `NEO_AUTH_PROVIDER_BOOTSTRAP_PAT_FILE` and
`NEO_MCP_HEALTHCHECK_TOKEN_FILE`, so a newly generated secret breaks auth rather
than provisioning it. Migrating an existing machine is one move:

```sh
mkdir -p ~/.neo-ai/secrets
mv <the-provisioned-checkout>/.neo-ai-secrets/mcp-auth-token ~/.neo-ai/secrets/
chmod 600 ~/.neo-ai/secrets/mcp-auth-token
```

A missing file makes Compose refuse to start, which is deliberate — loud at the
one moment someone can act, rather than a silent fallback that restores the
single-clone dependency.

**Resolve the channel to a commit first.** Compose maps one operator pin to both
internal Docker arguments, and the source stage refuses a mutable ref (#16635) —
a branch name makes the fetch layer cache-stable, so the build would package
whatever `dev` pointed at the first time it ran and report success doing it:

```sh
export NEO_REVISION=$(git ls-remote https://github.com/neomjs/neo.git dev | cut -f1)

docker compose --env-file .env \
  -f ai/deploy/docker-compose.yml \
  -f ai/deploy/docker-compose.local-agent-os.yml \
  --profile cloud --profile ingress --profile fleet up -d --wait
```

The `fleet` profile is explicit because headless deployments may omit the cockpit control service.
This canonical local profile includes it: readiness calls authenticated `GET /fleet/probe` through
the same provider-PAT authority as KB/MC and verifies `/app/.neo-ai-data/fleet` before Docker marks
the service healthy. Ingress does not depend on Fleet, so omitting the profile leaves `/fleet` at an
honest `404` while KB/MC remain available.

Fleet admission adds a derived subject on top of that shared authority: every admitted request
carries an opaque `ownerPrincipal` built from the provider-stable tuple (provider, normalized
API base URL, provider user id) — never the mutable login — and the probe's `identity` echoes it
back, which is the quickest way to verify a deployment resolves the subject it will key ownership
and grants on. Wire verbs are class-split at admission: read-observe verbs serve any
authenticated caller, lifecycle-write verbs refuse callers without a forge-resolved subject (the
possession-only local bearer can observe, never mutate). The full contract:
`learn/agentos/cloud-deployment/ClientAuthentication.md`.

The canonical project is `neo-local-agent-os` unless
`NEO_LOCAL_AGENT_OS_PROJECT_NAME` explicitly overrides it.

### Updating an already-running plane

Same resolve step, then `--build`. Do not trust the build log or `--wait`: the
log prints a cached layer's command exactly as it prints an executed one, and
`--wait` proves *health*, never *revision*. `D#16304` records this path running
as a full cache hit — containers recreated from three-week-old images with the
running revision moving **backwards** — while every gate in the stack reported
success. With `NEO_REVISION` exported, the build now fails closed instead.

Verify what actually shipped by reading the artifact rather than the graph:

```sh
docker compose --env-file .env \
  -f ai/deploy/docker-compose.yml \
  -f ai/deploy/docker-compose.local-agent-os.yml \
  --profile cloud exec mc-server cat /app/.neo-revision
```

## Bind the host Fleet transport to this plane

The local canonical ingress is `http://127.0.0.1:3102`. Declare it in the
environment that launches the harness, together with a dedicated,
identity-bound plane credential for that resident:

```sh
export NEO_FLEET_PLANE_BASE="http://127.0.0.1:3102"
: "${NEO_FLEET_PLANE_BEARER:?load a dedicated identity-bound plane credential from the external secret store first}"
export NEO_FLEET_PLANE_BEARER
```

Persist those two names in the external launcher or secret store when the
harness must survive a shell restart; never put the bearer in this repository.
`NEO_FLEET_PLANE_BEARER` is MCP admission for this resident's Fleet transport.
It is a different credential class from the app-to-Fleet
`NEO_FLEET_BEARER`, the seat-side MCP slot `NEO_MCP_REMOTE_TOKEN`, and any
repository-workflow credential such as `GH_TOKEN`; do not copy or alias one of
those values into it.

A nonempty `NEO_FLEET_PLANE_BASE` is a topology declaration, not a health
probe. `npm --prefix harness run start:brain` will therefore start or reuse only
the host Fleet transport. If the ingress is down or the bearer resolves to the
wrong viewer, the transport's authenticated init fails closed and the harness
reports the boot failure; it never falls through to a host-native organism.
Leave the base empty only on a machine intentionally using the host-native
fresh-install path.

## Install the host edge (macOS, supervised)

This section is macOS-only: `launchctl` and `plutil` do not exist elsewhere. It
buys restart-on-login and nothing more — the posture itself comes from
`hostEdgeProfile.mjs` either way, so the supervised process and a bare
`npm run ai:host-edge` run identical configuration.

Each wake subscription's one-time signing key lives only in the server record
and in `routes.json` (mode 0600, generated by `npm run ai:wake-manifest`
below); never print or commit that file. Its schema is validated by
`ai/daemons/wake/receiver.mjs`.

`NEO_WAKE_RECEIVER_MANIFEST` is the ONE declaration every consumer derives
from: the receiver's plist is materialized from it below, and the Fleet
server's `fleet.wakeReceiverManifestPath` config leaf binds the same env name —
so the cockpit's seat-arming axis observes exactly the manifest the receiver
boots on. Leave it unset on a machine with no local wake lane and that axis
reports typed-unobserved instead of guessing.

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

The result returns `subscriptionId` and `signingKey` once; the server keeps the
key in the subscription record. **Never hand-author `routes.json`** — generate
it. Each seat runs the generator for its own identity (per-peer and additive:
one seat cannot unprovision another, and concurrent builds serialize under a
strict lock). Save the output of `manage_wake_subscription` `list` from your
authenticated Memory Core session, then:

```sh
npm run ai:wake-manifest -- \
  --subscriptions /path/to/subscriptions.json \
  --manifest "${NEO_WAKE_RECEIVER_MANIFEST}" \
  --identity "@your-seat-handle" \
  --instance userDataDir \
  --instance-address /absolute/validated/seat-profile

# Publishing writes the file; it does NOT make the route live — a running receiver
# serves the manifest it validated. To adopt a newly published route, RESTART the
# receiver. Stop the existing process, then start it again as above.
```

**Publishing is not provisioning.** Until the running receiver re-reads, a newly
published route answers `404`, and the sender treats a 4xx as a client error and
degrades the subscription immediately with no retry — so the route goes deaf on
its *first* wake rather than failing gradually. Restart after publishing, or start
the receiver afterwards.

## Start the wake receiver

This is the portable-across-POSIX command, and it is the second of the two
processes in the [platform matrix](#platform-matrix). It runs on macOS and Linux;
it cannot run on Windows, for the manifest-mode reason given there. The macOS
launchd plist below is *supervision over this same command*, not an alternative
to it. Within this guide the plist was previously the only place these arguments
appeared, which left Linux hosts without a runnable line — the receiver is not
macOS-only, only its supervision is.

There are no deployment-path defaults. All four arguments are required:

```bash
chmod 0600 "${NEO_WAKE_RECEIVER_MANIFEST}"
mkdir -p -m 0700 "${NEO_WAKE_RECEIVER_STATE_DIR}"

npm run ai:wake-receiver -- \
  --manifest   "${NEO_WAKE_RECEIVER_MANIFEST}" \
  --state-dir  "${NEO_WAKE_RECEIVER_STATE_DIR}" \
  --host       127.0.0.1 \
  --port       3199
```

`--host 127.0.0.1` keeps the receiver loopback-only, which is what a local
install wants. A containerized sender needs a Docker-reachable bind address
instead; that topology and its `host.docker.internal` mapping are covered in
[`PersistentProcessManagement.md` §3d](../../../../learn/agentos/wake-substrate/PersistentProcessManagement.md).

**`--manifest` means something different here than one command earlier.**
`ai:wake-manifest` *generates* the routes file and takes `--manifest` as its
**output** path; `ai:wake-receiver` *serves* that file and takes it as **input**.
Same flag, adjacent commands, opposite direction — running the generator is not
starting the receiver, and a host that ran only the generator holds a routes file
nothing is serving.

The receiver imports no GraphLog or SQLite: it owns durable acceptance and local
harness effects only. That is why it survives — and must be started — on a host
with `NEO_ORCHESTRATOR_LMS_ENABLED=false` and no model provider at all.

> **Do not signal a receiver to reload it.** A process started before the reload
> handler existed has no SIGHUP handler, and node's default for an unhandled SIGHUP
> is to **terminate** — so signalling such a process kills wake delivery for every
> seat on the host. **A restart is the only safe adoption step**, and it is correct
> whether or not the running process supports reloading.
>
> Checking the source tree does not make signalling safe: a checkout can hold the
> handler while the running process was started before it — pull the newer tree,
> read a reassuring result, signal, and terminate the receiver anyway. Reload
> authority has to come from the **running process**, and until it can be asked
> directly there is no mechanical check that authorizes a signal.

To confirm a route is live — after a restart, or at any time, without sending a
real wake — POST with a deliberately wrong signature. `401 invalid-signature`
means the receiver holds the route; `404 unknown-subscription` means it does not.
That question is answered by the running process, which is why it is trustworthy.

```bash
probe() {   # $1 = port, $2 = subscription id
    curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://127.0.0.1:$1/wake" \
        -H "x-neo-wake-subscription-id: $2" \
        -H 'x-neo-wake-event-id: probe' \
        -H 'x-neo-wake-schema-version: 1.0' \
        -H 'x-neo-wake-signature: sha256=deadbeef' \
        --data '{}'
}

probe 3199 WAKE_SUB:<a-route-you-KNOW-is-held>            # REQUIRED positive control
probe 3199 WAKE_SUB:00000000-0000-0000-0000-000000000000  # REQUIRED negative control
probe 3199 WAKE_SUB:<the-id-you-are-asking-about>
```

**The subscription id is a header, not a body field.** The receiver reads
`x-neo-wake-subscription-id` and looks the route up by it; a body-only
`{"subscriptionId": …}` never reaches the lookup, so the route resolves as
`undefined` and the receiver answers `404 unknown-subscription` — byte-identical
to a genuinely absent route.

**Run the positive control first, and treat an absence reading as void without
it.** Measured against a live receiver:

| request | result |
|---|---|
| subscription-id header omitted entirely | `404` |
| bogus id | `404` |
| a route the receiver genuinely holds | `401` |

The first two are indistinguishable, so **the negative control alone cannot tell a
malformed probe from an absent route** — it produces the identical observation
under the exact failure this procedure exists to catch. Only a `401` from a route
you already know is held proves the instrument can reach the other branch at all.

Read them in this order. If the positive control does not return `401`, stop: the
probe is wrong and every `404` below it is meaningless. If the negative control
does not return `404`, stop too — an instrument answering `401` indiscriminately
is equally useless, in the opposite direction. Only with both controls passing in
the **same run** does a `404` on your target mean the route is absent.

A reload that fails validation is refused and logged, leaving the routes already
serving untouched; an unreadable or half-written manifest cannot empty a working
route table.

The generator reads the server-issued key from the record (it never mints one
and fails closed on disagreement), skips undeliverable targets with a named
reason, and writes the manifest as mode 0600 only after the receiver's own
loader accepts it. The receiver-side GUI tuple comes from `--instance` +
`--instance-address`, never from the record: prefer `userDataDir` (durable);
`pid` is for one-shot proofs. An `osascript` route without the tuple is
refused, never emitted half-wired. Codex seats additionally pass
`--adapter-config adapters.json` (`{"WAKE_SUB:<id>": {"codexBinary":
"/usr/local/bin/codex"}}`). Re-running composes additively and withdraws your
own dead routes (unsubscribed or retargeted) — a partial subscription list
withdraws wrongly, so always feed it the full current `list`.

The generated manifest verifies itself through the receiver's loader, but a
belt-and-braces check costs nothing:

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
plutil -replace ProgramArguments -json "[
  \"$(command -v node)\", \"ai/daemons/wake/receiver.mjs\",
  \"--manifest\",  \"${NEO_WAKE_RECEIVER_MANIFEST}\",
  \"--state-dir\", \"${NEO_WAKE_RECEIVER_STATE_DIR}\",
  \"--host\",      \"127.0.0.1\",
  \"--port\",      \"3199\"
]" "${NEO_WAKE_PLIST}"
plutil -replace WorkingDirectory -string "${NEO_REPO_ROOT}" "${NEO_WAKE_PLIST}"
plutil -replace EnvironmentVariables.PATH -string "${PATH}" "${NEO_WAKE_PLIST}"
plutil -replace StandardOutPath -string "${NEO_WAKE_RECEIVER_STATE_DIR}/launchd.out.log" "${NEO_WAKE_PLIST}"
plutil -replace StandardErrorPath -string "${NEO_WAKE_RECEIVER_STATE_DIR}/launchd.err.log" "${NEO_WAKE_PLIST}"
plutil -lint "${NEO_WAKE_PLIST}"

# `lint` is NOT sufficient here — see the note after this block. Assert no placeholder survived.
plutil -p "${NEO_WAKE_PLIST}" | grep -q '__' && { echo 'FAIL: placeholder survived in wake plist'; exit 1; }
```

**Replace the whole `ProgramArguments` array, never an index.** `plutil -replace
ProgramArguments.0` **inserts** at index 0 instead of replacing it: the
placeholder survives one slot to the right and becomes `argv[1]`, so `node` is
handed `__NODE_BIN__` as its script path and the agent never launches. The wake
plist degrades worst under the per-index form, because each insert shifts every
later placeholder and the remaining index arithmetic is then wrong.

**`plutil -lint` reports `OK` on the corrupted result** — the shifted array is
structurally valid — so there is no install-time diagnostic and the failure only
shows up as an agent that silently never runs. That is why the placeholder
assertion above exists, and why `lint` alone must not be trusted as the check.
Dictionary-key replacement (`WorkingDirectory`, `EnvironmentVariables.*`,
`StandardOutPath`, `StandardErrorPath`, including nested dotted keys) replaces
correctly and is fine as written; the defect is specific to **array indices**.

The receiver binds `127.0.0.1` deliberately: the container plane reaches the
host receiver through the loopback-mapped host address, so a `0.0.0.0` bind is
an unnecessary widening — keep it loopback unless a measured LAN path requires
otherwise.

```sh
cp ai/deploy/com.neomjs.agent-os-host-edge.plist "${NEO_HOST_EDGE_PLIST}"
plutil -replace ProgramArguments -json "[\"$(command -v node)\", \"ai/daemons/orchestrator/hostEdge.mjs\"]" "${NEO_HOST_EDGE_PLIST}"
plutil -replace WorkingDirectory -string "${NEO_REPO_ROOT}" "${NEO_HOST_EDGE_PLIST}"
plutil -replace EnvironmentVariables.PATH -string "${PATH}" "${NEO_HOST_EDGE_PLIST}"
plutil -replace EnvironmentVariables.NEO_AI_ORCHESTRATOR_DIR -string "${NEO_HOST_EDGE_STATE_DIR}" "${NEO_HOST_EDGE_PLIST}"
plutil -replace StandardOutPath -string "${NEO_HOST_EDGE_STATE_DIR}/launchd.out.log" "${NEO_HOST_EDGE_PLIST}"
plutil -replace StandardErrorPath -string "${NEO_HOST_EDGE_STATE_DIR}/launchd.err.log" "${NEO_HOST_EDGE_PLIST}"
plutil -lint "${NEO_HOST_EDGE_PLIST}"
plutil -p "${NEO_HOST_EDGE_PLIST}" | grep -q '__' && { echo 'FAIL: placeholder survived in host-edge plist'; exit 1; }

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
  --profile cloud --profile ingress --profile fleet ps

node ai/scripts/diagnostics/fleetHealthcheck.mjs \
  --url http://127.0.0.1:3102/fleet/probe \
  --bearer-token-file .neo-ai-secrets/mcp-auth-token \
  --expected-data-dir /app/.neo-ai-data/fleet

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

## The authority lease: one live role per machine

Since #16230, every orchestrator boot claims a role-scoped lease
(`.authority-lease-<role>`) beside its authority receipt **before** writing that
receipt. A second boot declaring a role whose lease is still fresh refuses with a
structured error naming the holder pid, the role, and both entrypoints, and exits
non-zero — writing nothing. Liveness is a heartbeat (the holder refreshes the lease
on its poll cadence; ~60s TTL), **not** a pid probe, so a Docker Desktop container
holder — whose pid has no host-namespace existence — still reads as live. A lease
older than the TTL is reclaimed automatically; a clean shutdown releases it.

The practical consequence: `npm run ai:orchestrator` with an explicit
`container-plane` declaration on a machine where the container already runs that
role now fails loudly instead of silently double-running heavy lanes. Different
roles (`host-edge` beside `container-plane`) never contend — the lease file is
per-role by construction.

## Stop or recover

Stop only the host edges when repairing their configuration:

```sh
launchctl bootout "gui/$(id -u)/com.neomjs.agent-os-wake"
launchctl bootout "gui/$(id -u)/com.neomjs.agent-os-host-edge"
```

Never recover by moving a checkout `.neo-ai-data` into place or replacing the
Docker volumes. Logical import, rebuild, backup, or restore work requires a
separately reviewed procedure and a quiesced writer plane.
