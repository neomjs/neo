import {spawnSync}         from 'node:child_process'
import {redactCredentials} from './redactCredentials.mjs'
import fs                  from 'node:fs'
import path                from 'node:path'

/**
 * @module ai/services/fleet/fleetWakeStateAdapter
 * @summary Maps wake-subscription intent + wake-daemon liveness into per-agent wake-state
 * observation rows for the Fleet roster DTO — the wake axis of the S2 telltale taxonomy.
 *
 * The adapter reads OBSERVATION truth only, never control intent: subscription state comes through
 * an injected read path (the caller owns identity binding, mirroring `fleetA2AActivityAdapter`),
 * and daemon liveness comes from the wake daemon's exclusive-create PID file plus a
 * `process.kill(pid, 0)` existence probe. Terminal delivery failures come from the daemon-owned
 * atomic receipt file, independently readable even when the affected seat cannot receive A2A.
 * Watermark/state-file mtime is deliberately NOT a
 * liveness signal: the watermark advances only on delivery activity, so a quiet fleet would be
 * indistinguishable from a dead daemon. The `setWakeEnabled` control verb mutates state that this
 * producer independently observes — the two never share a source.
 *
 * Fail-honest discipline (the graduated taxonomy's honest-degradation rule): every unreadable
 * source degrades to `unknown` with a reason — absence of truth is never rendered as a healthy
 * default. The adapter itself never resolves configuration — config resolution belongs to process
 * entrypoints and this module is not one: the PID file path is injected by the composing
 * entrypoint; without it, liveness is honestly `unknown`.
 *
 * The delivery axes are RESOLVER-INJECTABLE at the same entrypoint boundary: a deployment whose
 * delivery authority is not a host daemon (a containerized plane owning delivery, with its own
 * vouching surface) injects `resolveDeliveryLiveness` / `resolveTerminalDeliveryFailures` instead
 * of file paths that would measure a process which no longer exists — an absent retired daemon's
 * PID file reads as OBSERVED not-running and would fabricate `suppressed` for every active
 * subscription. Injected resolvers carry the exact same return contracts as the built-in sources
 * and degrade identically: a throw or an out-of-contract answer becomes `unknown` with the reason
 * preserved, never a fabricated state.
 */

export const WAKE_STATES = Object.freeze(['on', 'off', 'suppressed', 'unknown'])

export const WAKE_SOURCE_LABEL = 'fleet:wakeState'

/*
 * The daemon-identity marker: the wake daemon's own launch path fragment, matched against the
 * probed process's command line. A responding PID proves that SOME process answers — the OS
 * recycles PIDs, so without a command match a reused PID would impersonate a live daemon.
 */
export const WAKE_DAEMON_COMMAND_MARKER = 'daemons/wake/daemon.mjs'

/**
 * @summary Resolves wake-daemon liveness from its PID file — observed, stale-aware,
 * reuse-aware, fail-honest.
 *
 * The daemon creates its PID file with the exclusive-create flag, so a missing file is OBSERVED
 * not-running (`alive: false`), not an unknown. A present file still requires two proofs: the
 * process probe (`ESRCH` proves the recorded process is gone — a stale file; `EPERM` proves a
 * process exists) AND a process-identity check — the OS recycles PIDs, so the responding process's
 * command line must carry the daemon's own launch marker before the probe counts as the daemon.
 * A responding PID whose command lacks the marker is OBSERVED dead-with-reuse; an unreadable
 * command line (or any other failure — unreadable file, malformed content, unexpected probe
 * error) degrades to `'unknown'` with the reason preserved.
 * @param {Object} options={}
 * @param {String|null} [options.pidFilePath] Absolute path to the daemon's PID file; `null` ⇒ unknown.
 * @param {Function} [options.readFile] `(path) => String` override for tests; defaults to `node:fs`.
 * @param {Function} [options.probeProcess] `(pid) => void` throwing ESRCH/EPERM; defaults to `process.kill(pid, 0)`.
 * @param {Function} [options.readProcessCommand] `(pid) => String|null` override for tests;
 *     defaults to a `ps -p <pid> -o command=` read. `null`/throw ⇒ identity unknown.
 * @returns {{alive: Boolean|'unknown', reason: String|null}}
 */
export function resolveDaemonLiveness({
    pidFilePath = null,
    readFile = path => fs.readFileSync(path, 'utf8'),
    probeProcess = pid => process.kill(pid, 0),
    readProcessCommand = readProcessCommandViaPs
} = {}) {
    if (!pidFilePath) {
        return {alive: 'unknown', reason: 'wake daemon PID file path not configured'}
    }

    let raw

    try {
        raw = readFile(pidFilePath)
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return {alive: false, reason: null}
        }
        return {alive: 'unknown', reason: normalizeReason(error)}
    }

    const pid = Number(String(raw).trim())

    if (!Number.isSafeInteger(pid) || pid <= 0) {
        return {alive: 'unknown', reason: 'malformed wake daemon PID file'}
    }

    try {
        probeProcess(pid)
    } catch (error) {
        if (error?.code === 'ESRCH') {
            return {alive: false, reason: 'stale PID file: recorded process is gone'}
        }
        if (error?.code !== 'EPERM') {
            return {alive: 'unknown', reason: normalizeReason(error)}
        }
        // EPERM: a process exists at that pid — identity still unverified, fall through.
    }

    // A responding PID is not yet the daemon: verify process identity against the launch marker,
    // or a recycled PID would impersonate a live daemon.
    let command

    try {
        command = readProcessCommand(pid)
    } catch (error) {
        return {alive: 'unknown', reason: normalizeReason(error)}
    }

    if (command == null || command === '') {
        return {alive: 'unknown', reason: 'wake daemon process identity unreadable'}
    }

    if (!String(command).includes(WAKE_DAEMON_COMMAND_MARKER)) {
        return {alive: false, reason: 'PID reused by another process: recorded daemon is gone'}
    }

    return {alive: true, reason: null}
}

/**
 * @summary Read the daemon-owned terminal delivery-failure receipts once per Fleet snapshot.
 * Missing means no terminal failure has ever been recorded; malformed/unreadable means unknown,
 * never healthy-by-default.
 * @param {Object} options={}
 * @param {String|null} [options.deliveryFailureFilePath]
 * @param {Function} [options.readDeliveryFailureFile]
 * @returns {{state: 'observed'|'unknown', reason: String|null, byIdentity: Map<String,Object[]>}}
 * @private
 */
function readTerminalDeliveryFailures({
    deliveryFailureFilePath = null,
    readDeliveryFailureFile = filePath => fs.readFileSync(filePath, 'utf8')
} = {}) {
    const byIdentity = new Map()

    if (!deliveryFailureFilePath) {
        return {
            state : 'unknown',
            reason: 'wake delivery failure file path not configured',
            byIdentity
        }
    }

    let parsed

    try {
        parsed = JSON.parse(readDeliveryFailureFile(deliveryFailureFilePath))
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return {state: 'observed', reason: null, byIdentity}
        }
        return {
            state : 'unknown',
            reason: error instanceof SyntaxError
                ? 'malformed wake delivery failure receipt file'
                : redactReason(error),
            byIdentity
        }
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {state: 'unknown', reason: 'malformed wake delivery failure receipt file', byIdentity}
    }

    for (const [subscriptionId, receipt] of Object.entries(parsed)) {
        if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) ||
            receipt.subscriptionId !== subscriptionId ||
            typeof receipt.agentIdentity !== 'string' || receipt.agentIdentity.length === 0 ||
            typeof receipt.errorClass !== 'string' || !/^[a-z0-9-]{1,80}$/.test(receipt.errorClass) ||
            typeof receipt.failedAt !== 'string' || Number.isNaN(Date.parse(receipt.failedAt))
        ) {
            return {state: 'unknown', reason: 'malformed wake delivery failure receipt file', byIdentity: new Map()}
        }

        const rows = byIdentity.get(receipt.agentIdentity) || []
        rows.push({
            subscriptionId,
            errorClass: receipt.errorClass,
            failedAt  : new Date(receipt.failedAt).toISOString()
        })
        byIdentity.set(receipt.agentIdentity, rows)
    }

    for (const rows of byIdentity.values()) {
        rows.sort((left, right) => right.failedAt.localeCompare(left.failedAt))
    }

    return {state: 'observed', reason: null, byIdentity}
}

/**
 * @summary Wraps the receipt-file source as an injected-resolver-contract reader, so a sibling
 * composition can consume the SAME file-backed authority (same parsing, same fail-honest
 * degradation) without duplicating it. The returned function matches the
 * `resolveTerminalDeliveryFailures` axis contract exactly.
 * @param {Object} options={}
 * @param {String|null} [options.deliveryFailureFilePath]
 * @param {Function} [options.readDeliveryFailureFile] Test seam, as on the snapshot reader.
 * @returns {Function} `() => {state, reason, byIdentity}`.
 */
export function createTerminalDeliveryFailuresFileReader({deliveryFailureFilePath = null, readDeliveryFailureFile} = {}) {
    return () => readTerminalDeliveryFailures({
        deliveryFailureFilePath,
        ...(readDeliveryFailureFile && {readDeliveryFailureFile})
    })
}

/**
 * @summary Default process-identity reader: the probed pid's command line via `ps` (portable across
 * macOS/Linux). Returns `null` when `ps` yields nothing (the identity stays unknown, never guessed).
 * @param {Number} pid
 * @returns {String|null}
 */
function readProcessCommandViaPs(pid) {
    const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {encoding: 'utf8'})

    if (result.status !== 0) return null

    const command = (result.stdout || '').trim()

    return command === '' ? null : command
}

/**
 * @summary Maps one agent's subscription state × daemon liveness × terminal delivery state onto
 * the graduated wake taxonomy.
 *
 * The truth table is the S2 registry contract verbatim: no subscription is OBSERVED `off`; an
 * active subscription with a live daemon and no terminal failure is `on`; an active subscription
 * with a dead daemon OR a terminal failure is `suppressed` (intent on, delivery off — the
 * blind-switch incident class); and any unknown input axis makes the output `unknown`, because
 * claiming `on` or `suppressed` without all facts would fabricate precision.
 * @param {Object} options={}
 * @param {'active'|'none'|'unknown'} options.subscriptionState One agent's wake-subscription intent.
 * @param {Boolean|'unknown'} options.daemonAlive Daemon liveness from {@link resolveDaemonLiveness}.
 * @param {'none'|'failed'|'unknown'} [options.deliveryFailureState='none'] Terminal receipt axis.
 * @returns {'on'|'off'|'suppressed'|'unknown'}
 */
export function resolveAgentWakeState({subscriptionState, daemonAlive, deliveryFailureState = 'none'}) {
    if (subscriptionState === 'none') {
        return 'off'
    }
    if (subscriptionState !== 'active') {
        return 'unknown'
    }
    // Either observed failure axis is independently sufficient to prove suppression. An unreadable
    // sibling axis cannot erase that stronger fact.
    if (daemonAlive === false || deliveryFailureState === 'failed') return 'suppressed'
    if (daemonAlive === 'unknown' || deliveryFailureState !== 'none') return 'unknown'

    return daemonAlive ? 'on' : 'unknown'
}

/**
 * @summary Reads the fleet-wide wake-state observation snapshot: one taxonomy row per agent plus a
 * capability envelope declaring how much of the truth was reachable.
 *
 * Liveness is resolved ONCE (the daemon is host-global) and joined onto every row; subscription
 * state is resolved per agent through the injected reader. Capability semantics: `wired/observed`
 * when both sources answered, `degraded/partial` when exactly one did, `degraded/none` when
 * neither — so a consumer can distinguish "the fleet is off" from "we cannot see".
 * @param {Object} options={}
 * @param {Object[]} [options.agents] Registry roster rows; each needs an `id`.
 * @param {Function|null} [options.resolveSubscriptionState] `(agent) => 'active'|'none'|'unknown'`
 *     (sync or async). Absent ⇒ the subscription axis is honestly `unknown` for every agent —
 *     unless the bulk reader below is provided.
 * @param {Function|null} [options.listActiveSubscriptionIdentities] Bulk alternative to the
 *     per-agent reader: `() => Iterable<String>` (sync or async) yielding the wake identities that
 *     hold an ACTIVE subscription — called ONCE per snapshot (fresh scan, no staleness, no
 *     per-agent query fan-out). The production entrypoint composes this over its trusted
 *     graph read; identity mapping runs through `wakeIdentityFor`.
 * @param {Function} [options.wakeIdentityFor] `(agent) => String` mapping a fleet roster row onto
 *     its wake identity. Default: `'@' + (githubUsername ?? id)` — the swarm's mailbox-identity
 *     convention; override at the entrypoint if the deployment maps identities differently.
 * @param {String|null} [options.pidFilePath] Wake daemon PID file path (entrypoint-resolved).
 * @param {String|null} [options.deliveryFailureFilePath] Daemon-owned terminal receipt path. When
 *     omitted beside a configured PID path, defaults to `wake-delivery-failures.json` in that same
 *     injected directory; no config or env is resolved here.
 * @param {Function|null} [options.resolveDeliveryLiveness] Axis-level replacement for the PID-file
 *     liveness source: `() => {alive: Boolean|'unknown', reason: String|null}` (sync or async).
 *     When provided, the PID-file path is not consulted for liveness — the entrypoint has named a
 *     different delivery authority. Throw or out-of-contract ⇒ `alive: 'unknown'` with the reason.
 * @param {Function|null} [options.resolveTerminalDeliveryFailures] Axis-level replacement for the
 *     receipt-file source: `() => {state: 'observed'|'unknown', reason: String|null,
 *     byIdentity: Map<String,Object[]>}` (sync or async). Same degradation contract as its file
 *     sibling; rows must be pre-sorted newest-first per identity if order matters to the caller.
 * @param {Function} [options.readFile] Test seam for {@link resolveDaemonLiveness}.
 * @param {Function} [options.readDeliveryFailureFile] Test seam for terminal receipt reads.
 * @param {Function} [options.probeProcess] Test seam for {@link resolveDaemonLiveness}.
 * @param {Function} [options.readProcessCommand] Test seam for {@link resolveDaemonLiveness}.
 * @param {Date|String} [options.capturedAt] Capture timestamp.
 * @returns {Promise<{capability: Object, states: Object[]}>} `states` rows:
 *     `{agentId, wake, confidence, source}` (+ `reason` when `wake` is `unknown`).
 */
export async function readFleetWakeStateSnapshot({
    agents = [],
    resolveSubscriptionState = null,
    listActiveSubscriptionIdentities = null,
    wakeIdentityFor = agent => `@${agent.githubUsername ?? agent.id}`,
    pidFilePath = null,
    deliveryFailureFilePath = null,
    resolveDeliveryLiveness = null,
    resolveTerminalDeliveryFailures = null,
    readFile,
    readDeliveryFailureFile,
    probeProcess,
    readProcessCommand,
    capturedAt = new Date()
} = {}) {
    // The bulk reader wins when provided: one fresh scan per snapshot becomes a per-agent
    // membership resolver — same row semantics, no fan-out, no long-lived cache to go stale.
    let bulkScanFailed = false

    if (!resolveSubscriptionState && listActiveSubscriptionIdentities) {
        try {
            const identities = new Set(await listActiveSubscriptionIdentities())

            resolveSubscriptionState = agent => identities.has(wakeIdentityFor(agent)) ? 'active' : 'none'
        } catch (error) {
            const reason = redactReason(error)

            // A wholesale scan failure yields a reader that can only throw. It is a row-reason
            // carrier, NOT a source of truth — `bulkScanFailed` keeps the capability envelope from
            // counting its mere existence as partial visibility.
            bulkScanFailed          = true
            resolveSubscriptionState = () => { throw new Error(reason || 'subscription scan failed') }
        }
    }
    const liveness = resolveDeliveryLiveness
        ? await resolveInjectedLiveness(resolveDeliveryLiveness)
        : resolveDaemonLiveness({
            pidFilePath,
            ...(readFile           && {readFile}),
            ...(probeProcess       && {probeProcess}),
            ...(readProcessCommand && {readProcessCommand})
        })
    const failures = resolveTerminalDeliveryFailures
        ? await resolveInjectedFailures(resolveTerminalDeliveryFailures)
        : readTerminalDeliveryFailures({
            deliveryFailureFilePath: deliveryFailureFilePath ||
                (pidFilePath ? path.join(path.dirname(pidFilePath), 'wake-delivery-failures.json') : null),
            ...(readDeliveryFailureFile && {readDeliveryFailureFile})
        })

    const hasReader = Boolean(resolveSubscriptionState),
          states    = []

    let failedRows  = 0,
        invalidRows = 0

    for (const agent of asArray(agents)) {
        const agentId = agent?.id

        if (!agentId) continue

        // Diagnostics are ROW-LOCAL by contract: one agent's reader failure names only its own
        // row — sibling rows keep their own truth and their own reasons (no shared-state bleed).
        let subscriptionState = 'unknown',
            rowReason         = hasReader ? null : 'subscription read path unavailable'

        if (hasReader) {
            try {
                const answer = await resolveSubscriptionState(agent)

                if (answer === 'active' || answer === 'none') {
                    subscriptionState = answer
                } else if (answer === 'unknown') {
                    rowReason = 'truth source answered unknown'
                } else {
                    // An out-of-contract answer is an INVALID result, not a quiet unknown — it
                    // degrades the capability below so a broken reader cannot hide under
                    // wired/observed.
                    invalidRows++
                    rowReason = 'truth source returned an out-of-contract value'
                }
            } catch (error) {
                failedRows++
                rowReason = redactReason(error)
            }
        }

        const
            wakeIdentity        = wakeIdentityFor(agent),
            lastDeliveryFailure = failures.state === 'observed'
                ? failures.byIdentity.get(wakeIdentity)?.[0] || null
                : null,
            deliveryFailureState = failures.state === 'unknown'
                ? 'unknown'
                : (lastDeliveryFailure ? 'failed' : 'none'),
            wake = resolveAgentWakeState({
                subscriptionState,
                daemonAlive: liveness.alive,
                deliveryFailureState
            })

        const row = {
            agentId,
            wake,
            confidence: wake === 'unknown' ? 'none' : 'observed',
            source    : WAKE_SOURCE_LABEL
        }

        if (wake === 'unknown') {
            row.reason = subscriptionState === 'unknown'
                ? (rowReason || 'subscription state unreadable')
                : liveness.alive === 'unknown'
                    ? (redactReason(liveness.reason) || 'wake daemon liveness unknown')
                    : (redactReason(failures.reason) || 'terminal delivery state unreadable')
        } else if (wake === 'suppressed' && lastDeliveryFailure) {
            row.reason              = `terminal wake delivery failure: ${lastDeliveryFailure.errorClass}`
            row.lastDeliveryFailure = lastDeliveryFailure
        }

        states.push(row)
    }

    // `hasReader` proves a function exists; `readerUsable` proves it can answer. Only the latter
    // counts as truth — otherwise a throwing scan plus an unreadable daemon reports `partial`
    // visibility while observing exactly nothing.
    const livenessSourceOk = liveness.alive !== 'unknown',
          failureSourceOk  = failures.state === 'observed',
          readerUsable     = hasReader && !bulkScanFailed,
          readerClean      = readerUsable && failedRows === 0 && invalidRows === 0,
          fullyOk          = livenessSourceOk && failureSourceOk && readerClean,
          anyTruth         = livenessSourceOk || failureSourceOk || readerUsable

    return {
        capability: {
            source    : WAKE_SOURCE_LABEL,
            state     : fullyOk ? 'wired' : 'degraded',
            confidence: fullyOk ? 'observed' : (anyTruth ? 'partial' : 'none'),
            capturedAt: toIsoString(capturedAt),
            reason    : fullyOk ? null : [
                livenessSourceOk ? null : (redactReason(liveness.reason) || 'daemon liveness unknown'),
                failureSourceOk ? null : (redactReason(failures.reason) || 'terminal delivery state unreadable'),
                hasReader ? null : 'subscription read path unavailable',
                failedRows > 0 ? `subscription reader failed for ${failedRows} agent(s)` : null,
                invalidRows > 0 ? `subscription reader returned out-of-contract values for ${invalidRows} agent(s)` : null
            ].filter(Boolean).join('; ') || null
        },
        states
    }
}

/**
 * @summary Runs an injected liveness resolver under the axis contract: the answer must carry
 * `alive` as `true`/`false`/`'unknown'`, anything else — a throw included — degrades to `'unknown'`
 * with the reason preserved. An injected authority can therefore never fabricate a state the
 * built-in source could not produce.
 * @param {Function} resolver
 * @returns {Promise<{alive: Boolean|'unknown', reason: String|null}>}
 * @private
 */
async function resolveInjectedLiveness(resolver) {
    let answer

    try {
        answer = await resolver()
    } catch (error) {
        return {alive: 'unknown', reason: normalizeReason(error)}
    }

    const alive = answer?.alive

    if (alive !== true && alive !== false && alive !== 'unknown') {
        return {alive: 'unknown', reason: 'delivery liveness resolver returned an out-of-contract value'}
    }

    // A reasonless `unknown` must still name ITS source: the generic fallback strings downstream
    // talk about the wake daemon, which an injected delivery authority may not be.
    return {
        alive,
        reason: answer.reason ?? (alive === 'unknown' ? 'delivery liveness resolver answered unknown' : null)
    }
}

/**
 * @summary Runs an injected terminal-failure resolver under the axis contract: `state` must be
 * `'observed'` or `'unknown'` and `byIdentity` a Map — anything else degrades to `'unknown'` with
 * an empty map, mirroring the file source's malformed-receipt handling.
 * @param {Function} resolver
 * @returns {Promise<{state: 'observed'|'unknown', reason: String|null, byIdentity: Map<String,Object[]>}>}
 * @private
 */
async function resolveInjectedFailures(resolver) {
    let answer

    try {
        answer = await resolver()
    } catch (error) {
        return {state: 'unknown', reason: normalizeReason(error), byIdentity: new Map()}
    }

    const state = answer?.state

    if ((state !== 'observed' && state !== 'unknown') || !(answer.byIdentity instanceof Map)) {
        return {
            state     : 'unknown',
            reason    : 'terminal delivery resolver returned an out-of-contract value',
            byIdentity: new Map()
        }
    }

    return {
        state,
        reason    : answer.reason ?? (state === 'unknown' ? 'terminal delivery resolver answered unknown' : null),
        byIdentity: answer.byIdentity
    }
}

function normalizeReason(error) {
    return String(error?.message || error || 'source unavailable').replace(/\s+/g, ' ').slice(0, 240)
}

/**
 * @summary Bounds AND redacts a diagnostic before it can reach a Body-side projection: secret
 * vocabulary and token shapes are masked (the `fleetA2AActivityAdapter` discipline), whitespace
 * collapsed, length capped — a throwing transport's dump can never leak internals into a row reason.
 * @param {*} error
 * @returns {String|null}
 */
function redactReason(error) {
    if (error == null) return null

    return redactCredentials(normalizeReason(error))
}

function toIsoString(value) {
    const date = value instanceof Date ? value : new Date(value)

    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function asArray(value) {
    return Array.isArray(value) ? value : []
}
