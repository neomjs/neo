#!/usr/bin/env node
/**
 * @summary Unattended nightly whitebox-e2e run with a RED-ONLY A2A digest (ticket-ref-ok: #14685 owning-leaf anchor).
 *
 * e2e lives OUTSIDE CI by design (failing-honest discipline — a whitebox proof may be legitimately red without
 * blocking a merge), but nothing runs it on a schedule, so red states sit undiscovered (the 3-week middleware
 * staleness failure mode). This is the unattended quality heartbeat: run the declared e2e configs, and on ANY
 * red, push ONE A2A digest naming the failing specs + first-error lines + the run-log path.
 * Green runs are SILENT — red-as-pointer made push, not pull.
 *
 * The RED digest WAKES, deliberately. A broadcast is suppressed by default, so a red suite would
 * otherwise arrive drain-class into mailboxes carrying thousands unread — silence inherited rather
 * than chosen. Green never reaches the send, so routine success still wakes nobody.
 *
 * Delivery disposition is RECORDED, never derived: the receipt carries `pending` before the attempt
 * and `sent` or `failed` after it. A crash between the two leaves `pending` standing, so an
 * undelivered digest can never read as delivered.
 *
 * The digest is delivered as an MCP CLIENT of the containerized Memory Core, not through in-process
 * service imports. This process is host-resident by construction — the e2e layer needs GPU
 * hardware and a headed browser, which is the whole reason it lives outside CI — while the graph it
 * must reach is served from a container. An in-process `MailboxService` here resolves against the
 * HOST plane root, which no reader serves: the write succeeds and the digest arrives nowhere. Its
 * sibling lifecycle scripts keep their in-process imports correctly, because the orchestrator daemon
 * runs them INSIDE the container; this one never made that trip and cannot.
 *
 * Delivery therefore fails loudly by construction. An unreachable or unauthenticated Memory Core
 * throws at connect, which the disposition machinery above records as `failed` — where a local write
 * to an unserved store would have returned success.
 *
 * Hardening (the middleware-scheduler LaunchAgent precedent): an exclusive PID lockfile with stale-steal, a run log,
 * structured stderr, and finally-hygiene that always releases the lock. LaunchAgent-staged (not auto-installed);
 * see ai/scripts/lifecycle/nightly-e2e/README for activation. CRITICAL inherited rule: custom playwright configs
 * only — every run passes `-c <config>`, never the default `npx playwright test`.
 *
 * Out of scope (per the ticket): CI integration (the outside-CI discipline stands), fixing the reds (the digest
 * points; owners fix), and unit/integration suites (CI owns those).
 */
import {spawnSync}                                         from 'node:child_process';
import path                                                from 'node:path';
import {fileURLToPath}                                     from 'node:url';
import fs                                                  from 'fs-extra';
import Neo             from '../../../src/Neo.mjs';
import '../../../src/core/_export.mjs';
import Client                                              from '../../mcp/client/Client.mjs';
import {REMOTE_MCP_CREDENTIAL_ENV_VAR}                     from '../../services/fleet/mcpServers.mjs';
import {buildRunLog, collectFailures, formatDigest, isRed} from './nightlyE2eDigest.mjs';

/**
 * The whitebox-e2e configs the nightly run executes. ADDITIVE: append a config here as a suite lands
 * (dock e2e, FM NL-proofs, tour-replay suites). Each entry is a repo-relative playwright config;
 * its own `json` reporter `outputFile` is read back for the digest. Unit/integration configs are CI-owned and
 * deliberately absent.
 */
const E2E_CONFIGS = [
    {config: 'test/playwright/playwright.config.e2e.mjs', results: 'test-results/e2e/results.json'}
];

// Only the DIRECTORY is a constant. Its children are derived per run by `bindPlane`, so no code path
// can resolve one of them against a cwd that moved after the run started.
const STATE_DIR     = '.neo-ai-data/nightly-e2e',
      LOCK_STALE_MS = 6 * 60 * 60 * 1000;   // 6h — a nightly run that outlives this is a hung process; steal the lock

/**
 * How long the Memory Core client may take to become ready before the run calls it a failed
 * delivery. This is a FAILURE DEADLINE, not a wait: the happy path resolves in milliseconds and
 * never observes it. It exists because framework readiness has no rejection path, so without a
 * deadline an unreachable ingress produces a pending promise rather than an error.
 * @type {Number}
 */
const CONNECT_DEADLINE_MS = 30 * 1000;

/**
 * @summary Binds this run's plane to absolute paths, once, before any await.
 *
 * `STATE_DIR` and its children are repo-relative, so every use resolves against `process.cwd()` AT
 * THAT MOMENT. Between acquiring the lock and releasing it the run performs a network round-trip,
 * and any cwd change in that window silently renames the lock: the release looks in the new plane,
 * finds nothing, and leaves the real lock behind — after which every run for the next six hours
 * aborts believing one is still in flight. The receipt can split the same way.
 *
 * Binding once removes the dependency entirely. A run's plane is wherever it started, and nothing
 * that happens mid-run can move it.
 * @param {String} [stateDir=STATE_DIR] Plane directory; callers that must not depend on cwd pass it.
 * @returns {{dir: String, lockPath: String, statePath: String}}
 */
function bindPlane(stateDir=STATE_DIR) {
    const dir = path.resolve(stateDir);

    return {dir, lockPath: path.join(dir, 'runner.lock'), statePath: path.join(dir, 'last-run.json')}
}

/**
 * @summary Acquires the exclusive runner lock, stealing it only when the holder is provably stale (> 6h). A
 * fresh lock means another nightly run is in flight — abort rather than double-run the suite.
 * @param {String} nowIso ISO timestamp for the lock stamp.
 * @param {Object} plane Bound plane from {@link bindPlane}.
 * @returns {Promise<Boolean>} `true` when the lock is held by this process, `false` when a fresh run owns it.
 */
async function acquireLock(nowIso, {dir, lockPath}) {
    await fs.ensureDir(dir);

    if (await fs.pathExists(lockPath)) {
        const held    = await fs.readJson(lockPath).catch(() => null),
              heldAt  = held?.at ? new Date(held.at).getTime() : 0,
              staleMs = Date.now() - heldAt;

        if (held && staleMs < LOCK_STALE_MS) {
            console.error(`[nightlyE2eRunner] Abort: a run started ${held.at} (pid ${held.pid}) still holds the lock.`);
            return false;
        }
        console.error(`[nightlyE2eRunner] Stealing stale lock (held ${held?.at ?? 'unknown'}, > ${LOCK_STALE_MS}ms).`);
    }

    await fs.writeJson(lockPath, {pid: process.pid, at: nowIso}, {spaces: 2});
    return true;
}

/**
 * @summary Runs one e2e config to completion and reads back its JSON reporter output. A non-zero exit with no
 * parseable results is itself a red (an infra/boot failure the digest must surface, not swallow).
 * @param {Object} entry declared config `{config, results}` — the config path + its reporter output path.
 * @returns {Object} per-config outcome `{config, failures, ran, note}`.
 */
export function runConfig(entry, {spawn = spawnSync} = {}) {
    console.error(`[nightlyE2eRunner] Running ${entry.config} …`);
    // Remove any stale reporter output FIRST: a prior run's results.json (or a leftover green one) must never
    // be read as THIS run's result — that would let an infra failure which writes no fresh report be scored
    // green, silently suppressing the red digest. The heartbeat's one job is to not go silent.
    fs.removeSync(entry.results);

    // Custom config ONLY — never the default `npx playwright test`. Capture (pipe) rather than inherit so the
    // output backs the per-run log the digest points at; echo it through so an attended run still sees it live.
    const run = spawn('npx', ['playwright', 'test', '-c', entry.config], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});

    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    const output = `$ npx playwright test -c ${entry.config}\n${run.stdout ?? ''}${run.stderr ?? ''}`;

    let report = null;
    try {
        if (fs.pathExistsSync(entry.results)) report = fs.readJsonSync(entry.results);
    } catch (error) {
        console.error(`[nightlyE2eRunner] Could not parse ${entry.results}: ${error.message}`);
    }

    if (!report) {
        // No parseable report + non-zero exit = infra/boot red. Surface it explicitly rather than reporting green.
        const ran = run.status === 0;
        return {config: entry.config, failures: [], ran, note: ran ? 'ran; no report emitted' : `runner exited ${run.status ?? 'signal'} with no report (infra/boot failure)`, output};
    }

    return {config: entry.config, failures: collectFailures(report), ran: true, note: '', output};
}

/**
 * @summary Executes the nightly run: hold the lock, run each declared config, and on ANY red push exactly one
 * WAKING A2A digest. Green = silence. Always releases the lock, including on a delivery failure.
 *
 * Delivery moves through explicit receipt states — `pending` before the attempt, then `sent` or
 * `failed` — so an undelivered digest can never be re-derived as delivered.
 *
 * That guarantee is per-run, and on its own it is not enough: the receipt is a single document each
 * invocation rewrites, so a green night would erase a red one whose digest never left. Each run
 * therefore READS the prior receipt before writing its own and carries an undelivered red forward
 * until a delivery actually resolves. Recording disposition answers "did this run report?"; the carry
 * answers "did an earlier run fail to?", and only the second survives being overwritten by success.
 *
 * Every collaborator is injectable for the same reason `runConfig` takes its spawn: the delivery
 * paths are the ones worth proving, and a module-level import cannot be driven from a test.
 * @param {Object}   [options]
 * @param {Function} [options.connect] Memory Core client seam — resolves to `{callTool, close}`.
 * @param {Number}   [options.connectDeadlineMs=CONNECT_DEADLINE_MS] Failure deadline for the seam.
 * @param {Function} [options.runOne] Per-config execution seam.
 * @param {String}   [options.stateDir=STATE_DIR] Plane directory seam — an explicit value makes a run's
 *     plane independent of `process.cwd()` entirely, which a caller sharing a process needs.
 * @returns {Promise<Object>} run outcome `{red, sent, reason?}`.
 */
export async function runNightlyE2e({
    connect           = connectMemoryCore,
    connectDeadlineMs = CONNECT_DEADLINE_MS,
    runOne            = runConfig,
    stateDir          = STATE_DIR
} = {}) {
    // Bound BEFORE the first await, so nothing that happens mid-run can move this run's plane.
    const plane   = bindPlane(stateDir),
          nowIso  = new Date().toISOString(),
          logPath = path.join(plane.dir, `logs/run-${nowIso.replace(/[:.]/g, '-')}.log`);

    if (!(await acquireLock(nowIso, plane))) {
        return {red: false, sent: false, reason: 'lock-held'};
    }

    // The runner owns this process, so it owns its rejection policy for the duration of the run.
    // `Neo.create` runs `initAsync` detached, so a rejected credential surfaces as an UNHANDLED
    // rejection and Node's default policy kills the process on the spot — verified against the live
    // ingress as a fatal `StreamableHTTPError … HTTP 401`, no catch reached, the receipt stuck at
    // `pending`, and the lock left behind so the next six hours of runs abort believing one is live.
    //
    // The sink spans the WHOLE run, not just the connect: a client whose readiness failed was never
    // returned and therefore never closed, and its transport keeps rejecting afterwards. Dying on
    // THAT straggler would abandon the receipt and the lock just as effectively as dying on the first.
    const lateRejection = {deliver: null},
          onUnhandled   = reason => {
              const error = reason instanceof Error ? reason : new Error(String(reason));

              if (lateRejection.deliver) lateRejection.deliver(error);
              else console.error(`[nightlyE2eRunner] late transport rejection, after the delivery decision: ${error.message}`)
          };

    process.on('unhandledRejection', onUnhandled);

    try {
        const outcomes = E2E_CONFIGS.map(entry => runOne(entry)),
              red      = isRed(outcomes);

        // Back the digest's `Run log:` pointer with a real file: ensure the logs dir, write the captured
        // per-config output. Without this the logPath in last-run.json / the digest would be a phantom.
        fs.ensureDirSync(path.dirname(logPath));
        fs.writeFileSync(logPath, buildRunLog(outcomes, nowIso), 'utf8');

        // Read BEFORE the first write, because the write destroys what it reads. A run that stamps a
        // fresh receipt without consulting the previous one is write-only across invocations: the
        // green path below would overwrite an earlier red whose digest never left the host, and that
        // red exists on no other surface.
        const carriedRed = resolveCarriedRed(await readPriorReceipt(plane.statePath));

        if (carriedRed) {
            console.error(`[nightlyE2eRunner] Carrying forward an unreported red from ${carriedRed.at ?? 'an unreadable receipt'} (digest: ${carriedRed.digest}).`);
        }

        // A red receipt starts as `pending`, never as an absent field. Inferring delivery from
        // `red` alone would publish "sent" for a digest that never left: a crash between this write
        // and the send is indistinguishable from success unless the state exists BEFORE the attempt.
        await writeRunReceipt({digest: red ? 'pending' : 'not-required', logPath, nowIso, outcomes, red, statePath: plane.statePath, unresolvedRed: carriedRed});

        if (!red) {
            console.error('[nightlyE2eRunner] All declared e2e configs green — staying silent.');
            return {red: false, sent: false};
        }

        let client = null;

        try {
            // Connect FIRST and separately from the call: an unreachable or unauthenticated Memory
            // Core must be distinguishable from a rejected message, and both must be distinguishable
            // from success. The client throws here on a missing credential, which is the property
            // that makes an unattended run's misconfiguration loud instead of nightly-silent.
            client = await connectWithinDeadline(connect, connectDeadlineMs, lateRejection);

            // MCP has TWO success boundaries and only the first one throws. The protocol request
            // resolving means the server answered; whether it ACCEPTED is carried in the result, and
            // our own servers say so by resolving `{isError: true}` (`ai/mcp/server/BaseServer.mjs`).
            // Writing `sent` on a resolved call alone would record a refused digest as delivered —
            // this leaf's original defect, one layer up and behind a green suite.
            const result = await client.callTool('add_message', {
                to      : 'AGENT:*',
                subject : `[nightly-e2e][RED] ${outcomes.reduce((n, o) => n + o.failures.length, 0)} failing whitebox-e2e spec(s) — ${nowIso.slice(0, 10)}`,
                body    : formatDigest(outcomes, logPath),
                priority: 'normal',
                // A red suite is action-required BY DEFINITION, and a broadcast defaults to
                // suppressed, so silence here would be inherited rather than chosen. This is the
                // only per-message lever: the wake tier is one boolean on the message, so it
                // wakes every seat or none. Green never reaches this call and stays un-woken.
                wakeSuppressed: false
            });

            if (result?.isError) {
                // Surface the server's own words rather than a generic label: the disposition says
                // delivery failed, and the reason is the only thing that says why.
                const detail = result.content?.map(block => block?.text).filter(Boolean).join(' ') || 'no detail supplied';

                throw new Error(`Memory Core refused the digest: ${detail}`)
            }
        } catch (error) {
            // The reporter failing is not the suite passing. `pending` already stands on disk, so
            // the red survives even if THIS write also fails — the receipt degrades from `failed`
            // to `pending`, never to `sent`.
            console.error(`[nightlyE2eRunner] RED digest delivery FAILED: ${error?.message ?? error}`);
            await writeRunReceipt({
                digest       : 'failed',
                digestError  : String(error?.message ?? error),
                unresolvedRed: carriedRed,
                statePath    : plane.statePath,
                logPath, nowIso, outcomes, red
            }).catch(() => {});
            throw error
        } finally {
            // The transport is per-run, so it closes on every path. A leaked connection would keep an
            // unattended process alive past its work, and `launchd` would treat that as a run still
            // in flight rather than a finished one.
            await client?.close?.().catch(() => {});
        }

        // Written only after delivery RESOLVED. `sent` is recorded, never derived.
        //
        // The carry is dropped here and ONLY here: a digest has now actually reached the swarm, so the
        // fact an earlier one did not is no longer load-bearing — the suite's red state is reported and
        // actionable. Carrying it past a successful delivery would make the field permanent noise, and
        // a field that is always set stops being read.
        await writeRunReceipt({digest: 'sent', logPath, nowIso, outcomes, red, statePath: plane.statePath, unresolvedRed: null});
        console.error('[nightlyE2eRunner] RED digest sent to AGENT:* (wakeSuppressed: false).');
        return {red: true, sent: true};
    } finally {
        process.off('unhandledRejection', onUnhandled);
        await fs.remove(plane.lockPath).catch(() => {});
    }
}

/**
 * @summary Opens an authenticated MCP client against the containerized Memory Core.
 *
 * The `memory-core` client entry is already declared (`ai/mcp/client/config.mjs`) as
 * `streamable-http` against the local ingress with a required bearer credential, so this adds no
 * transport surface — it consumes the one every other host-side client uses.
 *
 * Nothing is caught here on purpose. A missing credential, an unreachable ingress, or a rejected
 * token must reach the caller so the receipt records `failed` and the process exits non-zero. The
 * failure this replaces was the opposite: an in-process write to a host store no reader serves,
 * which returned success every time.
 *
 * The credential is checked BEFORE construction, and that ordering is load-bearing rather than
 * stylistic. `Neo.create()` runs `initAsync()` inside a detached promise with no rejection handler
 * (`src/core/Base.mjs:314`), so a throw in there never reaches `ready()` — the ready promise simply
 * never resolves. An unattended run would then HANG until the 6h stale-lock steal instead of
 * recording a failed delivery, which is a strictly worse failure than the silent one this leaf
 * exists to remove. Validating first keeps the loud path loud.
 * @returns {Promise<Object>} A connected client exposing `callTool` and `close`.
 */
async function connectMemoryCore() {
    if (!process.env[REMOTE_MCP_CREDENTIAL_ENV_VAR]?.trim()) {
        throw new Error(
            `nightlyE2eRunner: ${REMOTE_MCP_CREDENTIAL_ENV_VAR} is missing or empty — the RED digest cannot reach Memory Core. ` +
            `An unattended run needs it in the LaunchAgent's EnvironmentVariables; see ai/scripts/lifecycle/nightly-e2e/README.md.`
        );
    }

    // A unit process must never reach the live fleet. Every arm in the runner's suite is supposed to
    // inject a `connect` stub, but that is DISCIPLINE, and discipline failed: on a host carrying a
    // valid credential, arms that omitted the stub sent nine real `AGENT:*` digests — each one
    // `wakeSuppressed: false`, so each woke every seat. A safety property the caller must remember is
    // not a safety property.
    //
    // This was invisible until delivery started working. Before the MCP-client conversion these sends
    // went to a host store nobody serves, so the suite's side effect existed and reached no one.
    if (process.env.UNIT_TEST_MODE === 'true') {
        throw new Error(
            'nightlyE2eRunner: refusing to open a live Memory Core connection under UNIT_TEST_MODE. ' +
            'Inject a `connect` seam in the spec; the real transport is not reachable from a unit run.'
        );
    }

    const client = Neo.create(Client, {serverName: 'memory-core'});

    await client.ready();

    return client
}

/**
 * @summary Rejects a connection attempt that never settles, so an unreachable dependency is a
 * failure rather than a hang.
 *
 * `Client.ready()` can only ever RESOLVE: `Neo.create` runs `initAsync` in a detached promise with no
 * rejection handler (`src/core/Base.mjs:314`), and `#readyPromise` is settled solely by
 * `afterSetIsReady`. So a rejected credential, an unreachable ingress, or a failed handshake leaves
 * it pending forever, and awaiting it alone would hang the unattended run to the 6h stale-lock
 * steal — the silence this leaf exists to remove, with extra steps.
 *
 * The deadline wraps the SEAM rather than living inside the default connect, because the guarantee
 * belongs to the runner: a caller that supplies its own connection must not be able to remove the
 * runner's only protection against never being answered.
 *
 * The `setTimeout` here is a self-naming failure deadline, not a wait — the happy path resolves in
 * milliseconds and never observes it.
 * @param {Promise} attempt The in-flight connection.
 * @param {Number}  deadlineMs
 * @returns {Promise<Object>} The connected client.
 */
async function connectWithinDeadline(connect, deadlineMs, onLateRejection) {
    let timer;

    try {
        return await new Promise((resolve, reject) => {
            // THE LOAD-BEARING LINE. `Neo.create` runs `initAsync` detached, so a rejected credential
            // surfaces as an UNHANDLED rejection — and Node's default policy kills the process on the
            // spot. Verified against the live ingress with an invalid token: a fatal
            // `StreamableHTTPError: … HTTP 401` and exit 1, before any `catch` in this module runs.
            //
            // A deadline cannot help with that: the process is gone before it fires. The receipt is
            // left at `pending` and — worse — the lock survives, so the NEXT six hours of runs abort
            // believing one is still in flight. A crash is not a quiet failure; it is a failure that
            // takes the next runs with it.
            //
            // Owning the process's rejection policy for the duration of the connect is the
            // entrypoint's job, and this is the only place that can turn that crash back into a value.
            // Scoped to the window and removed in `finally`, so it cannot swallow anything later.
            onLateRejection.deliver = reject;

            // Not a wait — a self-naming failure deadline for the case that does stay pending, since
            // `ready()` has no reject path of its own (`src/core/Base.mjs:305`, settled only by
            // `afterSetIsReady`).
            timer = setTimeout(() => reject(new Error(
                `nightlyE2eRunner: the Memory Core connection did not settle within ${deadlineMs}ms — ` +
                `unreachable ingress or a stalled handshake. Framework readiness cannot report which, ` +
                `because initialization rejection is not wired into it.`
            )), deadlineMs);

            Promise.resolve(connect()).then(resolve, reject)
        })
    } finally {
        clearTimeout(timer);
        onLateRejection.deliver = null
    }
}

/**
 * @summary Reads the previous run's receipt, distinguishing "no prior run" from "prior run
 * unreadable".
 *
 * The two are not the same fact and must not collapse: an absent receipt is a clean first run, while
 * an unparseable one means the delivery chain is broken and this run cannot know what preceded it.
 * Returning `null` for both would silently promote the broken case to the clean one — the precise
 * inference this module exists to prevent.
 * @param {String} statePath Absolute receipt path from {@link bindPlane}.
 * @returns {Promise<{state: String, receipt: (Object|null)}>} `absent` | `read` | `unreadable`.
 */
async function readPriorReceipt(statePath) {
    if (!(await fs.pathExists(statePath))) {
        return {state: 'absent', receipt: null};
    }

    try {
        return {state: 'read', receipt: await fs.readJson(statePath)}
    } catch (error) {
        return {state: 'unreadable', receipt: null, error: String(error?.message ?? error)}
    }
}

/**
 * @summary Resolves the undelivered red this run must carry forward, so a later green cannot erase it.
 *
 * Without this the receipt is write-only across runs: every invocation stamps a fresh document, so a
 * green night silently overwrites a red one whose digest never left the host. The red would be gone
 * from the only surface that recorded it, and the reader would see an unbroken green.
 *
 * The EARLIEST unreported red wins — a carry already standing on the prior receipt outranks the prior
 * run itself, because the first miss is the one a reader must not lose to a chain of later ones.
 * @param {Object} prior Result of {@link readPriorReceipt}.
 * @returns {(Object|null)} Carry-forward block, or `null` when nothing is owed.
 */
function resolveCarriedRed({state, receipt, error}) {
    // Unreadable is not clean. Fail closed: the reader learns the chain broke rather than inheriting
    // a green it never earned.
    if (state === 'unreadable') {
        return {at: null, digest: 'unknown', reason: 'prior receipt unreadable', ...(error ? {digestError: error} : {})};
    }

    if (state === 'absent' || !receipt) return null;

    if (receipt.unresolvedRed) return receipt.unresolvedRed;

    if (receipt.red === true && (receipt.digest === 'pending' || receipt.digest === 'failed')) {
        return {
            at    : receipt.at ?? null,
            digest: receipt.digest,
            ...(receipt.digestError ? {digestError: receipt.digestError} : {}),
            ...(receipt.logPath ? {logPath: receipt.logPath} : {})
        };
    }

    return null
}

/**
 * @summary Writes the run receipt with an explicit delivery disposition.
 *
 * `digest` is always present and always recorded rather than inferred: `not-required` for green,
 * then `pending` → `sent` | `failed` across the delivery attempt. A reader can therefore separate
 * "no digest was owed", "one is owed and unresolved", and "one failed" — where a missing field
 * would have collapsed all three into whatever the reader chose to assume.
 *
 * `unresolvedRed` extends that guarantee ACROSS runs: it names a red whose digest never left, and it
 * survives every later write until a delivery actually resolves. Delivery disposition answers "did
 * THIS run report?"; the carry answers "did any earlier run fail to?" — and only the second question
 * is destroyed by a subsequent green.
 * @param {Object}   options
 * @param {String}   options.digest `not-required` | `pending` | `sent` | `failed`.
 * @param {String}   [options.digestError] Delivery failure message, when `digest` is `failed`.
 * @param {String}   options.logPath
 * @param {String}   options.nowIso
 * @param {Object[]} options.outcomes
 * @param {Boolean}  options.red
 * @param {String}   options.statePath Absolute receipt path from {@link bindPlane}.
 * @param {Object}   [options.unresolvedRed] Earlier undelivered red carried into this receipt.
 * @returns {Promise<void>}
 */
async function writeRunReceipt({digest, digestError, logPath, nowIso, outcomes, red, statePath, unresolvedRed}) {
    await fs.writeJson(statePath, {
        at     : nowIso,
        red,
        digest,
        ...(digestError ? {digestError} : {}),
        ...(unresolvedRed ? {unresolvedRed} : {}),
        configs: outcomes.map(o => ({config: o.config, failing: o.failures.length, ran: o.ran, note: o.note})),
        logPath
    }, {spaces: 2})
}

async function main() {
    const outcome = await runNightlyE2e();
    // Exit 0 on a clean run OR a clean-but-red run (the digest carries the signal; the process itself succeeded).
    // A thrown error (below) is the only non-zero exit — an infra failure of the RUNNER, distinct from a suite red.
    console.error(`[nightlyE2eRunner] Done: ${JSON.stringify(outcome)}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    main().catch(error => {
        console.error('[nightlyE2eRunner] Fatal:', error.stack);
        process.exit(1);
    });
}
