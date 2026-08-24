# Nightly whitebox-e2e runner — activation (#14685)

The unattended quality heartbeat. Neo's whitebox-e2e suites live **outside CI by design** (the failing-honest
discipline — a whitebox proof may be legitimately red without blocking a merge), but nothing runs them on a
schedule, so red states sit undiscovered. This LaunchAgent runs the declared e2e configs nightly and, on **any**
red, pushes **one** normal-priority (mailbox-drain, never a wake storm) A2A digest naming the failing specs +
first-error lines + the run-log path. Green runs are **silent**.

- Runner: [`../nightlyE2eRunner.mjs`](../nightlyE2eRunner.mjs) (I/O: lockfile, spawn playwright, read the json report, send the A2A digest).
- Pure parse/format core (unit-tested): [`../nightlyE2eDigest.mjs`](../nightlyE2eDigest.mjs).
- Plist template: [`com.neomjs.nightly-e2e.plist`](./com.neomjs.nightly-e2e.plist).

## Why staged, not auto-installed

The plist is a **template**, not an installed agent: it carries a machine-specific absolute repo path and a
schedule the operator owns. Auto-installing a LaunchAgent from a checkout would be a surprising side effect on
every clone. Activation is a deliberate, per-machine operator step — deployments that do not want a nightly run
simply never install it.

## Activate (macOS, per-user LaunchAgent)

```sh
# 1. Render the template with your absolute repo root, PATH, and Memory Core credential.
#    A launchd session inherits NOTHING from your shell: without these the run reaches the MCP
#    client with no token and no node on PATH, and fails every night while every local test stays
#    green. The credential is the same NEO_MCP_REMOTE_TOKEN your other remote MCP clients use.
REPO="$(git rev-parse --show-toplevel)"
mkdir -p "$REPO/.neo-ai-data/nightly-e2e/logs" ~/Library/LaunchAgents
sed -e "s#__NEO_REPO_ROOT__#$REPO#g" \
    -e "s#__NEO_PATH__#$PATH#g" \
    -e "s#__NEO_MCP_REMOTE_TOKEN__#${NEO_MCP_REMOTE_TOKEN:?export NEO_MCP_REMOTE_TOKEN before rendering}#g" \
  "$REPO/ai/scripts/lifecycle/nightly-e2e/com.neomjs.nightly-e2e.plist" \
  > ~/Library/LaunchAgents/com.neomjs.nightly-e2e.plist
chmod 600 ~/Library/LaunchAgents/com.neomjs.nightly-e2e.plist   # the rendered copy carries a secret

# 2. Load it (fires only on schedule — RunAtLoad is false).
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.neomjs.nightly-e2e.plist
launchctl print "gui/$(id -u)/com.neomjs.nightly-e2e" | head    # verify it's loaded
```

Default schedule: **03:17 local**, nightly. Edit `StartCalendarInterval` in your installed copy to change it.

## Verify / read results

```sh
# Trigger one run immediately (bypasses the schedule) to smoke-test:
launchctl kickstart -k "gui/$(id -u)/com.neomjs.nightly-e2e"

cat .neo-ai-data/nightly-e2e/last-run.json          # {at, red, configs:[{config, failing, ran, note}], logPath}
ls  .neo-ai-data/nightly-e2e/logs/                  # per-run logs + launchd.{out,err}.log
```

On a **red** run the digest arrives in the A2A mailbox (subject `[nightly-e2e][RED] …`), naming the failing
specs. On a **green** run nothing is sent — silence is the signal.

The digest is delivered as an authenticated **MCP client** of the containerized Memory Core, not through
in-process service imports (#17708). That is not a style choice: this process is host-resident because e2e
needs GPU hardware, while the graph lives in a container, so an in-process write would land in a host store
no reader serves — succeeding locally and arriving nowhere. Its sender is therefore the identity
`NEO_MCP_REMOTE_TOKEN` resolves to, not the literal `@system` it used to pass; use an automation credential
rather than a maintainer seat, so a red digest is not mistaken for a person who ran it and is looking at it.

Because delivery is now a network call, it can fail loudly — and that is the point. `last-run.json` carries
`digest: 'failed'` with the error when it does, and `unresolvedRed` keeps an undelivered red visible across
later green runs so a recovery night cannot erase it.

## Add a suite

Append to `E2E_CONFIGS` in the runner header ([`../nightlyE2eRunner.mjs`](../nightlyE2eRunner.mjs)) — one
`{config, results}` entry per playwright config (its own `json` reporter `outputFile` is read back). The list is
deliberately additive as dock e2e, FM NL-proofs, and tour-replay suites land. **Custom configs only** — every
run passes `-c <config>`, never the default `npx playwright test`.

## Disable / uninstall

```sh
launchctl bootout "gui/$(id -u)/com.neomjs.nightly-e2e"
rm ~/Library/LaunchAgents/com.neomjs.nightly-e2e.plist
```

## Scope

Out of scope (per #14685): CI integration (the outside-CI discipline stands) · fixing the reds (the digest
points; owners fix) · unit / integration suites (CI owns those). A Linux `systemd --user` timer equivalent is a
follow-up if/when a non-macOS runner host is provisioned.
