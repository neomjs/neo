/**
 * @summary Wake daemon for Neo.mjs wake-event delivery.
 *
 * Polls SQLite GraphLog for new wake-relevant entries, coalesces matching
 * events per active WAKE_SUBSCRIPTION, and delivers digests through the
 * configured harness adapter. Designed to run as a long-lived background
 * process with one instance per `.neo-ai-data/wake-daemon/` directory,
 * enforced by the daemon PID lock.
 *
 * Scheduled Agent OS maintenance triggers belong to `ai/daemons/orchestrator/daemon.mjs`
 * so this daemon stays focused on wake delivery only.
 *
 * **Diagnostic log persistence:**
 * All informational and error lines are written to both stdout for live
 * terminal observability and `.neo-ai-data/wake-daemon/wake-daemon.log` for
 * post-hoc wake-failure investigation.
 *
 * **Rotation:** Daily rotation via `.YYYY-MM-DD` suffix on the previous day's
 * file; archive files older than `LOG_RETENTION_DAYS` are pruned at startup.
 *
 * **Line format:** `[ISO-timestamp] [PID:NNN] [LEVEL] message` — greppable
 * post-hoc, per-line correlation with daemon process and event chronology.
 *
 */
// Neo namespace bootstrap (entry-point invariant): `Neo` + `core/_export` populate
// `globalThis.Neo` so any consumed class file relying on `Neo.setupClass()` works
// at module-load. `InstanceManager` binds `Neo.find` / `Neo.findFirst` / `Neo.get`
// aliases + sets `Base.instanceManagerAvailable=true` + consumes pre-singleton
// `Neo.idMap`. All 3 MUST run before consumed class imports.
import Neo                                       from '../../../src/Neo.mjs';
import * as core                                 from '../../../src/core/_export.mjs';
import InstanceManager                           from '../../../src/manager/Instance.mjs';
import AiConfig                                  from '../../config.mjs';
import {writeFileAtomicSync}                     from '../../services/shared/atomicFileWrite.mjs';
import memoryCoreConfig                          from '../../mcp/server/memory-core/config.mjs';
import {assertConfigFresh}                       from '../../scripts/setup/initServerConfigs.mjs';
import {buildWakeDigest, getHighestWakePriority} from './wakeDigestBuilder.mjs';
import {withOutboxLock}                          from './outboxLock.mjs';
import {DAEMON_EXIT_CRASH, DAEMON_EXIT_OK}       from '../shared/daemonExit.mjs';
import nodeCrypto                                from 'node:crypto';

import fs                               from 'fs-extra';
import os                               from 'os';
import path                             from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawn, execSync, spawnSync }   from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
import {
    initializeDatabase,
    getLastSyncId,
    writeLastSyncId,
    getActiveShapeCSubscriptions,
    getGraphLogEntries,
    getNodesData,
    getEdgesData,
    getDbNode,
    getActiveHarnessPresence,
    isHarnessPresenceFresh
} from './queries.mjs';
import {
    applyHarnessMetadataDefaults
} from '../../scripts/lifecycle/harnessRouting.mjs';
import {normalizeAgentIdentityNodeId} from '../../graph/normalizeAgentIdentityNodeId.mjs';
import {
    getDefaultInstanceTarget,
    resolveGuiInstancePid
} from './instanceResolver.mjs';
import {
    HEARTBEAT_PULSE_ENTITY_TYPE,
    match,
    TASK_STATE_CHANGED_ENTITY_TYPE
} from '../../services/memory-core/heartbeatPulseEvaluator.mjs';
import {
    computeFlushDelayMs,
    computeFlushHoldMs,
    partitionMessageWakesByFreshness,
    resolveCoalesceWindowMs
} from '../../services/memory-core/wakeCoalescePolicy.mjs';
import {
    HEAVY_DELTA_SETTLE_MS,
    isHeavyDeltaPoll,
    shouldDeferFlush
} from './flushDeferPolicy.mjs';
import {
    claimUnwokenMessages,
    clampWatermark,
    filterEventsByWatermark,
    maxLogId
} from './wokenWatermark.mjs';
import {IDENTITIES} from '../../graph/identityRoots.mjs';

// Config-derived paths + PID_FILE (below) are declared here but ASSIGNED in initConfigDerivedState()
// (called from the guarded main(), never at module-load): a stale memory-core overlay would otherwise
// crash these derefs with a cryptic `undefined` at import, before assertConfigFresh can report it.
let DB_PATH;
let DAEMON_DATA_DIR;
let STATE_FILE;
let LOG_FILE;
let WOKEN_WATERMARK_FILE;
let DELIVERY_FAILURE_STATE_FILE;
let   terminalDeliveryFailures           = {};
let   terminalDeliveryFailuresNeedRepair = false;
const LOG_RETENTION_DAYS                 = 30;
const POLL_INTERVAL_MS                   = 3000;
const CODEX_APP_SERVER_ADAPTER           = 'codex-app-server';
const OPENCODE_SERVER_ADAPTER            = 'opencode-server';
const OPENCODE_REBIND_SETTLE_MS          = 50;
const KIMI_SERVER_ADAPTER                = 'kimi-server';
const KIMI_PULL_BRIDGE_ADAPTER           = 'kimi-pull-bridge';
const CODEX_TURN_START_PROOF_TIMEOUT_MS  = Number(process.env.WAKE_CODEX_TURN_START_PROOF_TIMEOUT_MS) || 45000;
const CODEX_TURN_START_PROOF_POLL_MS     = Number(process.env.WAKE_CODEX_TURN_START_PROOF_POLL_MS) || 1000;
const CODEX_WAKE_SUBMIT_NONCE_PREFIX     = 'NEO_WAKE_SUBMIT_NONCE:';
const WOKEN_MESSAGE_IDS_STATE_KEY        = '__messageIdsByIdentity';

const identityParticipationById = new Map(
    IDENTITIES
        .filter(identity => identity.type === 'AgentIdentity')
        .map(identity => [
            normalizeAgentIdentityNodeId(identity.id),
            identity.properties?.participationStatus || 'active'
        ])
);

/**
 * @summary Loads durable GraphLog watermarks plus stable per-identity message wake claims.
 *
 * Legacy files contain only top-level `subscriptionId: logId` pairs. The reserved
 * `__messageIdsByIdentity` key extends that shape without invalidating older daemon readers: they
 * preserve the unknown object while continuing to consume the numeric subscription keys.
 *
 * @returns {{watermarks: Object<String, Number>, messageIdsByIdentity: Map<String, Set<String>>}}
 */
function loadWokenState() {
    try {
        if (fs.existsSync(WOKEN_WATERMARK_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(WOKEN_WATERMARK_FILE, 'utf8'));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const rawHistory = parsed[WOKEN_MESSAGE_IDS_STATE_KEY];
                delete parsed[WOKEN_MESSAGE_IDS_STATE_KEY];

                const messageIdsByIdentity = new Map();
                if (rawHistory && typeof rawHistory === 'object' && !Array.isArray(rawHistory)) {
                    for (const [identity, messageIds] of Object.entries(rawHistory)) {
                        if (Array.isArray(messageIds)) {
                            messageIdsByIdentity.set(identity, new Set(messageIds.filter(Boolean)));
                        }
                    }
                }

                return {watermarks: parsed, messageIdsByIdentity};
            }
        }
    } catch (e) {
        // Corrupt state is non-fatal: worst case is one cycle of already-woken backlog being
        // re-counted, self-healing as the state re-persists. Daemon liveness never gates on it.
    }
    return {watermarks: {}, messageIdsByIdentity: new Map()};
}

/**
 * @summary Drops message wake claims whose mailbox record is now read.
 *
 * Message claims need to survive only while the stable message remains unread. Pruning on every
 * state write keeps the durable file proportional to the unread already-woken set while preserving
 * replay protection across daemon restarts.
 *
 * @returns {void}
 */
function pruneReadWokenMessageIds() {
    if (!db) return;

    for (const [identity, messageIds] of wokenMessageIdsByIdentity) {
        for (const messageId of messageIds) {
            if (isMessageReadFor(db, messageId, identity)) messageIds.delete(messageId);
        }
        if (messageIds.size === 0) wokenMessageIdsByIdentity.delete(identity);
    }
}

/**
 * @summary Best-effort persist of GraphLog watermarks plus per-identity message wake claims.
 * @returns {void}
 */
function persistWokenState() {
    try {
        pruneReadWokenMessageIds();

        const messageIdsByIdentity = Object.fromEntries(
            [...wokenMessageIdsByIdentity]
                .filter(([, messageIds]) => messageIds.size > 0)
                .map(([identity, messageIds]) => [identity, [...messageIds].sort()])
        );
        const state = {
            ...wokenWatermark,
            ...(Object.keys(messageIdsByIdentity).length > 0
                ? {[WOKEN_MESSAGE_IDS_STATE_KEY]: messageIdsByIdentity}
                : {})
        };

        fs.writeFileSync(WOKEN_WATERMARK_FILE, JSON.stringify(state), 'utf8');
    } catch (e) {
        // best-effort; the in-memory watermark + stable-id history still dedup this process
    }
}

/**
 * Per-subscription already-woken high-water-mark: `subId → highest GraphLog logId the recipient
 * has already been woken for`. A digest counts/prioritizes only events ABOVE this mark, so a
 * re-queued already-woken backlog (heavy-delta re-include / cursor reset) contributes zero to the
 * count and cannot spoof a HIGH digest from a stale message. Durable across restart; composes
 * with — does not replace — the `readAt` reconcile + the heavy-delta defer.
 * @type {Object<String, Number>}
 */
let wokenWatermark = {};  // loaded from disk in initConfigDerivedState() (after WOKEN_WATERMARK_FILE is assigned)

/**
 * Stable per-identity application-level dedup: `agentIdentity → Set<MESSAGE id>`.
 *
 * Unlike GraphLog `logId`, a MESSAGE id survives projection replay. Claims are recorded before the
 * first adapter await so overlapping subscription routes cannot race into two physical prompts.
 * Read messages are pruned when state persists; unread claims remain durable across daemon restart.
 * @type {Map<String, Set<String>>}
 */
let wokenMessageIdsByIdentity = new Map();

/**
 * Rotates `wake-daemon.log` if its mtime falls on a calendar day different from today's.
 * Renames the previous-day file to `wake-daemon.log.YYYY-MM-DD` so the active file always
 * holds the current day's lines. Best-effort: failures surface to stderr and the
 * daemon continues (log integrity is not allowed to gate daemon liveness).
 * @protected
 */
function rotateLogIfNewDay() {
    if (!fs.existsSync(LOG_FILE)) return;
    try {
        const stats    = fs.statSync(LOG_FILE);
        const fileDay  = stats.mtime.toISOString().split('T')[0];
        const todayDay = new Date().toISOString().split('T')[0];
        if (fileDay !== todayDay) {
            const archivePath = `${LOG_FILE}.${fileDay}`;
            fs.renameSync(LOG_FILE, archivePath);
        }
    } catch (e) {
        // Log rotation failure is non-fatal; surface to stderr only
        process.stderr.write(`[Wake Daemon] Log rotation failed: ${e.message}\n`);
    }
}

/**
 * Prunes archived log files (`wake-daemon.log.*`) older than `LOG_RETENTION_DAYS` from
 * `DAEMON_DATA_DIR`. Runs once at daemon startup. Best-effort: per-file unlink
 * failures are silently swallowed (best to lose a stale archive than gate startup).
 * @protected
 */
function pruneOldLogs() {
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    try {
        const entries = fs.readdirSync(DAEMON_DATA_DIR);
        for (const entry of entries) {
            // Match `wake-daemon.log.YYYY-MM-DD` archive files only — leave `wake-daemon.log` alone
            if (!entry.startsWith('wake-daemon.log.') || entry === 'wake-daemon.log') continue;
            const fullPath = path.join(DAEMON_DATA_DIR, entry);
            try {
                const stats = fs.statSync(fullPath);
                if (stats.mtime.getTime() < cutoff) {
                    fs.unlinkSync(fullPath);
                }
            } catch (e) {
                // Per-entry failure is non-fatal
            }
        }
    } catch (e) {
        // Directory listing failure is non-fatal
    }
}

/**
 * Persistent + console log writer. Writes a single line to BOTH stdout (live
 * terminal observability) AND the persistent `wake-daemon.log` file (post-hoc audit
 * trail). Format: `[ISO-timestamp] [PID:NNN] [LEVEL] message`. Daily rotation
 * is checked on every call.
 *
 * Failures on file-write are silently swallowed — daemon liveness MUST NOT
 * depend on log integrity. Failures on console-write propagate naturally.
 *
 * @param {String} level   One of 'INFO' | 'ERROR' (used to dispatch console.log vs console.error and to embed in the line prefix).
 * @param {String} message The message body. Should NOT include a trailing newline — `writeLog` appends one.
 * @protected
 */
function writeLog(level, message) {
    rotateLogIfNewDay();
    const timestamp = new Date().toISOString();
    const line      = `[${timestamp}] [PID:${process.pid}] [${level}] ${message}`;

    // File write — best-effort, never throws
    try {
        fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
    } catch (e) {
        // Best-effort; daemon must stay alive even if file-write fails
    }

    // Console write — preserves live terminal observability
    if (level === 'ERROR') {
        console.error(line);
    } else {
        console.log(line);
    }
}

/**
 * @summary Load the daemon-owned terminal delivery-failure receipts. A malformed file is left in
 * place so the independent Fleet observer can report the source as unreadable; the daemon starts
 * with an empty in-memory set and repairs it on the next authoritative write.
 * @returns {Object<String,Object>}
 * @private
 */
function loadTerminalDeliveryFailures() {
    terminalDeliveryFailuresNeedRepair = false;
    if (!fs.existsSync(DELIVERY_FAILURE_STATE_FILE)) return {};

    try {
        const parsed = JSON.parse(fs.readFileSync(DELIVERY_FAILURE_STATE_FILE, 'utf8'));

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new TypeError('root must be an object');
        }

        for (const [subscriptionId, receipt] of Object.entries(parsed)) {
            if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) ||
                receipt.subscriptionId !== subscriptionId ||
                typeof receipt.agentIdentity !== 'string' || receipt.agentIdentity.length === 0 ||
                typeof receipt.errorClass !== 'string' || !/^[a-z0-9-]{1,80}$/.test(receipt.errorClass) ||
                typeof receipt.failedAt !== 'string' || Number.isNaN(Date.parse(receipt.failedAt))
            ) {
                throw new TypeError(`invalid receipt '${subscriptionId}'`);
            }
        }

        return parsed;
    } catch (error) {
        terminalDeliveryFailuresNeedRepair = true;
        writeLog('ERROR', `[Wake Daemon] Terminal delivery-failure receipt file is malformed; preserving it for operator diagnosis (${error.message}).`);
        return {};
    }
}

/**
 * @summary Persist terminal delivery-failure receipts atomically with owner-only permissions.
 * Receipt rows contain only seat identity, subscription id, bounded error class, and timestamp —
 * never adapter errors, coordinates, envelope paths, digests, or credentials.
 * @returns {void}
 * @private
 */
function persistTerminalDeliveryFailures() {
    try {
        // The former scratch was `${file}.${pid}.tmp` — unique per process but not per call, and the
        // explicit chmod after write existed because the mode was applied to a file the umask had
        // already touched. The primitive creates at 0o600 with `wx` and cleans up its own scratch.
        writeFileAtomicSync(DELIVERY_FAILURE_STATE_FILE, JSON.stringify(terminalDeliveryFailures, null, 2) + '\n');
        terminalDeliveryFailuresNeedRepair = false;
    } catch (error) {
        writeLog('ERROR', `[Wake Daemon] Could not persist terminal delivery-failure receipts (${error.message}).`);
    }
}

/**
 * @summary Record one retry-cap exhaustion on the independent operator-health surface.
 * @param {Object} subscription WAKE_SUBSCRIPTION node.
 * @param {String} identity Recipient seat identity.
 * @param {String} errorClass Bounded non-secret failure classification.
 * @returns {void}
 * @private
 */
function recordTerminalDeliveryFailure(subscription, identity, errorClass) {
    const subscriptionId = subscription.id;

    terminalDeliveryFailures[subscriptionId] = {
        agentIdentity: subscription.properties?.agentIdentity || identity,
        subscriptionId,
        errorClass   : String(errorClass || 'delivery-failed').slice(0, 80),
        failedAt     : new Date().toISOString()
    };
    persistTerminalDeliveryFailures();
}

/**
 * @summary Clear a terminal receipt after a confirmed delivery on the same subscription.
 * @param {String} subscriptionId
 * @returns {void}
 * @private
 */
function clearTerminalDeliveryFailure(subscriptionId) {
    if (!Object.hasOwn(terminalDeliveryFailures, subscriptionId)) {
        if (terminalDeliveryFailuresNeedRepair) persistTerminalDeliveryFailures();
        return;
    }

    delete terminalDeliveryFailures[subscriptionId];
    persistTerminalDeliveryFailures();
}

/**
 * @summary Remove receipts whose exact subscriptions are no longer active, preventing a retired
 * route from suppressing a later subscription for the same seat identity.
 * @param {Object[]} subscriptions Current active WAKE_SUBSCRIPTION rows.
 * @returns {void}
 * @private
 */
function pruneTerminalDeliveryFailures(subscriptions) {
    const activeIds = new Set(subscriptions.map(subscription => subscription.id));
    let   changed   = false;

    for (const subscriptionId of Object.keys(terminalDeliveryFailures)) {
        if (!activeIds.has(subscriptionId)) {
            delete terminalDeliveryFailures[subscriptionId];
            changed = true;
        }
    }

    if (changed) persistTerminalDeliveryFailures();
}

let PID_FILE;  // assigned in initConfigDerivedState() (← DAEMON_DATA_DIR); the one-shot log prune runs there too
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function enforceSingleton() {
    if (fs.existsSync(PID_FILE)) {
        try {
            const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
            if (!isNaN(oldPid) && oldPid > 0 && oldPid !== process.pid) {
                let isAlive = false;
                try {
                    process.kill(oldPid, 0);
                    isAlive = true;
                } catch (e) {
                    // Process is not alive
                }

                if (isAlive) {
                    try {
                        // Use ps -p to verify the PID hasn't been recycled by a non-daemon process
                        const cmd = execSync(`ps -p ${oldPid} -o command=`).toString().trim();
                        if (cmd.includes('daemons/wake/daemon.mjs')) {
                            writeLog('INFO', `[Wake Daemon] Found existing instance (PID: ${oldPid}). Sending SIGTERM...`);
                            process.kill(oldPid, 'SIGTERM');
                        } else {
                            writeLog('INFO', `[Wake Daemon] Stale PID file found. PID ${oldPid} used by a different process. Proceeding.`);
                            isAlive = false; // We won't wait for it to exit
                        }
                    } catch (psErr) {
                        writeLog('INFO', `[Wake Daemon] Could not verify process name. Sending SIGTERM to PID ${oldPid} to be safe...`);
                        process.kill(oldPid, 'SIGTERM');
                    }
                }

                if (isAlive) {
                    // Wait up to 3s for graceful exit
                    let alive = true;
                    for (let i = 0; i < 30; i++) {
                        await wait(100);
                        try {
                            process.kill(oldPid, 0);
                        } catch (e) {
                            alive = false;
                            break;
                        }
                    }
                    if (alive) {
                        writeLog('INFO', `[Wake Daemon] PID ${oldPid} did not exit after 3s. Escalating to SIGKILL...`);
                        try {
                            process.kill(oldPid, 'SIGKILL');
                        } catch (e) {}
                    }
                }

                try {
                    fs.unlinkSync(PID_FILE);
                } catch (e) {}
            }
        } catch (e) {
            writeLog('ERROR', `[Wake Daemon] Failed to check existing PID file: ${e.message || e}`);
        }
    }

    // Write new PID using atomic wx claim
    try {
        fs.writeFileSync(PID_FILE, process.pid.toString(), { encoding: 'utf8', flag: 'wx' });
    } catch (e) {
        if (e.code === 'EEXIST') {
            writeLog('ERROR', `[Wake Daemon] Failed to claim PID file (EEXIST). Another instance started simultaneously. Exiting.`);
            process.exit(1);
        } else {
            throw e;
        }
    }

    // Cleanup on exit. `releasePidFile` is separated from `cleanup` deliberately: an `exit` listener
    // must RELEASE without exiting, because `cleanup` now takes an exit code. See the measured
    // bare-retains / explicit-overrides asymmetry in `../shared/daemonExit.mjs`.
    let   cleanedUp      = false;
    const releasePidFile = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        try {
            if (fs.existsSync(PID_FILE)) {
                const currentPid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
                if (currentPid === process.pid) {
                    fs.unlinkSync(PID_FILE);
                }
            }
        } catch (e) {}
    };
    const cleanup = (exitCode = DAEMON_EXIT_OK) => {
        releasePidFile();
        process.exit(exitCode);
    };

    // Each registration passes its code EXPLICITLY. `process.on('SIGINT', cleanup)` would invoke the
    // listener with the SIGNAL NAME, handing `'SIGINT'` to `process.exit`.
    process.on('SIGINT',  () => cleanup(DAEMON_EXIT_OK));
    process.on('SIGTERM', () => cleanup(DAEMON_EXIT_OK));
    process.on('exit', releasePidFile);
    process.on('uncaughtException', (err) => {
        writeLog('ERROR', `[Wake Daemon] Uncaught exception: ${err && err.stack ? err.stack : err}`);
        cleanup(DAEMON_EXIT_CRASH);
    });
}

let db;
let lastSyncId;

// In-memory queues for coalescing
// Structure: { [subscriptionId]: { timer: Timeout, queue: [events], subscription: {...}, firstQueuedAt: ms } }
const coalesceState = {};

// Epoch ms of the last CONFIRMED delivery per subscription — the post-flush refractory anchor
// (see ../../services/memory-core/wakeCoalescePolicy.mjs). Armed exclusively on a 'delivered' adapter outcome (direct or
// retry) — a skip or failure never holds the next digest at distance. Runtime-only by design:
// the refractory is an anti-chatter guard, so a daemon restart resetting it is harmless.
const lastFlushAtBySub = {};

// Subscriptions with an adapter attempt currently unresolved (direct flush or retry) — the
// atomic delivery owner: while a sub is in flight, a firing flush timer defers and its queue
// keeps absorbing arrivals, so a second digest can never dispatch behind an unresolved first
// one and the refractory always reads a settled lastFlushAtBySub.
const deliveryInFlight = new Set();

// Epoch ms of the most recent poll that observed a heavy GraphLog / data-sync delta. flushSubscription
// defers while within the settle window of this, so digests are computed against committed read-state
// (see ./flushDeferPolicy.mjs for the failure mode + policy).
let lastHeavyPollAt = 0;

/**
 * Main polling loop
 */
async function pollLoop() {
    try {
        // Fetch deltas
        const logs = getGraphLogEntries(db, lastSyncId);

        // A heavy GraphLog / data-sync delta commits in batches; mid-sync the per-message read-state
        // lookup transiently under-reports readAt, leaking already-read backlog into the digest. Flag it
        // so flushSubscription defers until the delta settles + read-state is committed.
        if (isHeavyDeltaPoll(logs.length)) {
            const wasSettled = (Date.now() - lastHeavyPollAt) >= HEAVY_DELTA_SETTLE_MS;
            lastHeavyPollAt  = Date.now();
            if (wasSettled) {
                writeLog('INFO', `[Wake Daemon] Heavy GraphLog delta in flight (${logs.length} entries); deferring digest flushes until read-state settles.`);
            }
        }

        if (logs.length > 0) {
            const invalidNodes    = new Set();
            const invalidEdges    = new Set();
            const batchBaseSyncId = lastSyncId;
            let   maxId           = lastSyncId;

            for (const trace of logs) {
                maxId = Math.max(maxId, trace.log_id);
                if (trace.entity_type === 'nodes') invalidNodes.add(trace.entity_id);
                else if (trace.entity_type === 'edges') invalidEdges.add(trace.entity_id);
            }

            const subscriptions = getActiveShapeCSubscriptions(db);
            pruneTerminalDeliveryFailures(subscriptions);

            if (subscriptions.length > 0) {
                // Fetch the actual node/edge data to evaluate filters
                const nodesData = getNodesData(db, invalidNodes);
                const edgesData = getEdgesData(db, invalidEdges);

                const nodesMap = new Map(nodesData.map(r => [r.id, JSON.parse(r.data)]));
                const edgesMap = new Map(edgesData.map(r => [r.id, JSON.parse(r.data)]));

                for (const trace of logs) {
                    const entity = trace.entity_type === 'nodes' ? nodesMap.get(trace.entity_id)
                        : trace.entity_type === 'edges' ? edgesMap.get(trace.entity_id)
                        : trace.entity_type === HEARTBEAT_PULSE_ENTITY_TYPE ? {id: trace.entity_id, type: 'HEARTBEAT_PULSE'}
                        : trace.entity_type === TASK_STATE_CHANGED_ENTITY_TYPE ? {id: trace.entity_id, type: 'TASK_STATE_CHANGED'}
                        : null;
                    if (!entity) continue; // entity might have been deleted, skipping for wake events unless it's a deletion trigger, but currently we focus on creation/updates

                    for (const sub of subscriptions) {
                        const eventPayload = evaluateSubscription(sub, trace, entity, nodesMap, edgesMap);
                        if (eventPayload) {
                            queueEvent(sub, eventPayload, batchBaseSyncId, maxId);
                        }
                    }
                }
            }

            lastSyncId = maxId;
            writeLastSyncId(STATE_FILE, lastSyncId);
        }

        // Re-attempt any wake deliveries that previously failed (live-target dispatch threw). Runs
        // every poll regardless of new GraphLog activity, independent of the lastSyncId cursor.
        await attemptDeliveryRetries();

    } catch (err) {
        writeLog('ERROR', `[Wake Daemon] Error in poll loop: ${err && err.stack ? err.stack : err}`);
    }

    setTimeout(pollLoop, POLL_INTERVAL_MS);
}

/**
 * Evaluates a GraphLog entry against a WAKE_SUBSCRIPTION trigger + filters by delegating to the
 * shared, GraphService-free `match()` evaluator — the single source of truth also consumed by
 * `WakeSubscriptionService`, so the two call-sites cannot drift. This daemon owns only its GraphLog
 * delta data source (the `entityData` accessor bag) and its flat coalescing payload shape; all
 * trigger semantics live in `match()`: unread-gating + `DELIVERED_TO` receipt-dedup for
 * `SENT_TO_ME`, the `CAN_*` permission edges (the former `HAS_PERMISSION` branch was dead — those
 * edges are created nowhere), and task `from`-OR-authoritative-`assignee` targeting. Task matches
 * retain their source-owned event id and immutable transition snapshot; generic node rewrites are
 * cache invalidation only and cannot classify themselves as transitions.
 */
function evaluateSubscription(sub, trace, entity, nodesMap, edgesMap) {
    if (!isWakeTargetEligible(sub.properties?.agentIdentity)) return null;

    const result = match(sub.properties || {}, {
        entity,
        getNode            : id    => nodesMap.get(id) ?? getDbNode(db, id),
        hasDeliveryReceipts: msgId => daemonHasDeliveryReceipts(msgId, edgesMap)
    }, trace);

    if (!result) return null;

    // heartbeat_pulse delivers through every adapter (incl. interactive osascript/tmux): emission is
    // already idle-gated upstream (WakeDecisionService.decideWake — Wake = active AND idle AND ready),
    // so the delivery layer trusts that gate rather than re-suppressing by adapter, which had dropped
    // every interactive heartbeat while only non-interactive (codex-app-server) adapters kept theirs.

    // Map the shared evaluator's {type, payload, logId} onto the daemon's flat coalescing payload.
    const {payload, logId} = result;
    switch (result.type) {
        case 'sent_to_me':
            return {
                type     : 'message',
                messageId: payload.messageId,
                from     : payload.from,
                subject  : payload.subject,
                priority : payload.priority,
                sentAt   : payload.sentAt,
                logId
            };
        case 'task_state_changed':
            return {
                type               : 'task',
                sourceEventId      : result.sourceEventId,
                taskId             : payload.taskId,
                previousState      : payload.previousState,
                newState           : payload.newState,
                originator         : payload.originator,
                assignee           : payload.assignee,
                assignmentAuthority: payload.assignmentAuthority,
                lastModifiedAt     : payload.lastModifiedAt,
                logId
            };
        case 'permission_granted':
            return {type: 'permission', scope: payload.scope, grantedBy: payload.grantedBy, logId};
        case 'heartbeat_pulse':
            return {type: 'heartbeat', targetIdentity: payload.targetIdentity, pulseId: payload.pulseId, summary: decodeHeartbeatPulseSummary(payload.pulseId), logId};
        default:
            return null;
    }
}

/**
 * @summary True when a wake subscription target may receive wake delivery.
 *
 * Unknown identities stay eligible for forks/local custom agents. Known repo
 * identities with non-active participationStatus are filtered before coalescing
 * so they never create delivery attempts or retries.
 * @param {String} identity Agent identity.
 * @returns {Boolean}
 */
function isWakeTargetEligible(identity) {
    if (!identity) return true;
    const normalizedIdentity  = normalizeAgentIdentityNodeId(identity),
          participationStatus = identityParticipationById.get(normalizedIdentity);

    return !participationStatus || participationStatus === 'active';
}

/**
 * Heartbeat-pulse summary sources that encode structured content in the pulse id as
 * `<source>.<base64url-JSON>`. A plain uuid pulse (no '.') carries no summary.
 * @type {String[]}
 */
const HEARTBEAT_PULSE_SUMMARY_SOURCES = ['github-notification', 'idle-out-nudge'];

/**
 * @summary Decodes optional structured content embedded in a heartbeat-pulse id, for any known
 * summary source. Id format: `<source>.<base64url-JSON>` (e.g. `github-notification` or
 * `idle-out-nudge`); the decoded payload's `source` must match the id prefix (format/tamper guard).
 * @param {String} pulseId
 * @returns {Object|null}
 */
function decodeHeartbeatPulseSummary(pulseId = '') {
    const separator = pulseId.indexOf('.');
    if (separator <= 0) return null;

    const source = pulseId.slice(0, separator);
    if (!HEARTBEAT_PULSE_SUMMARY_SOURCES.includes(source)) return null;

    try {
        const parsed = JSON.parse(Buffer.from(pulseId.slice(separator + 1), 'base64url').toString('utf8'));
        return parsed?.source === source ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * Does a MESSAGE carry any `DELIVERED_TO` receipt edges? Drives the shared evaluator's
 * `SENT_TO -> AGENT:*` receipt-dedup gate (receipt-backed broadcasts wake via `DELIVERED_TO`
 * instead). Checks the in-delta edges first, then falls back to the persisted graph.
 * @param {String} messageId MESSAGE node id.
 * @param {Map}    edgesMap  GraphLog delta edges keyed by id.
 * @returns {Boolean}
 */
function daemonHasDeliveryReceipts(messageId, edgesMap) {
    for (const edge of edgesMap.values()) {
        if (edge.source === messageId && edge.type === 'DELIVERED_TO') return true;
    }
    const stmt = db.prepare("SELECT 1 FROM Edges WHERE source = ? AND type = 'DELIVERED_TO' LIMIT 1");
    return !!stmt.get(messageId);
}

/**
 * Queues an event for coalescing.
 * Applies tuple-based deduplication (type + identity-tuple) to prevent duplicate
 * wake event triggers within a single coalescing window.
 * @param {Object} subscription          The target subscription node.
 * @param {Object} eventPayload          The wake event to queue.
 * @param {Number} watermarkResetCeiling Highest trusted GraphLog id before this batch.
 * @param {Number} watermarkGraphTip     Highest trusted GraphLog id observed in this batch.
 */
function queueEvent(subscription, eventPayload, watermarkResetCeiling = 0, watermarkGraphTip = watermarkResetCeiling) {
    const subId = subscription.id;
    if (!coalesceState[subId]) {
        coalesceState[subId] = {
            subscription,
            firstQueuedAt: Date.now(),
            queue        : [],
            timer        : null,
            watermarkGraphTip,
            watermarkResetCeiling
        };
    } else {
        coalesceState[subId].watermarkGraphTip = Math.min(
            coalesceState[subId].watermarkGraphTip ?? watermarkGraphTip,
            watermarkGraphTip
        );
        coalesceState[subId].watermarkResetCeiling = Math.min(
            coalesceState[subId].watermarkResetCeiling ?? watermarkResetCeiling,
            watermarkResetCeiling
        );
    }

    // Deduplicate within the coalescing window. Task identity is the durable source event id;
    // clocks and current node state are payload, not an identity reconstruction mechanism.
    const isDuplicate = coalesceState[subId].queue.some(existing => {
        if (existing.type !== eventPayload.type) return false;

        if (eventPayload.type === 'message') {
            return existing.messageId === eventPayload.messageId;
        } else if (eventPayload.type === 'task') {
            return existing.sourceEventId === eventPayload.sourceEventId;
        } else if (eventPayload.type === 'permission') {
            return existing.scope === eventPayload.scope && existing.grantedBy === eventPayload.grantedBy;
        } else if (eventPayload.type === 'heartbeat') {
            return existing.pulseId === eventPayload.pulseId;
        }
        return false;
    });

    if (!isDuplicate) {
        coalesceState[subId].queue.push(eventPayload);
    }

    // ROLLING re-arm on EVERY queued event (not only the first): a trailing arrival extends the
    // quiet window and joins THIS digest instead of arming the next wake — the fixed-window
    // wake-per-message cadence at inter-turn message spacing was the dominant token waste.
    // The hard cap measured from firstQueuedAt bounds total latency, and a recent
    // delivered flush raises the delay to the post-flush refractory boundary (anti-chatter).
    // All three decisions are pure policy in ../../services/memory-core/wakeCoalescePolicy.mjs; the window default is the
    // AiConfig leaf (per-subscription override unchanged; 0 = explicit immediate dispatch,
    // exempt from refractory and cap by contract).
    const windowMs = resolveCoalesceWindowMs({
        overrideSeconds: subscription.properties?.harnessTargetMetadata?.coalesceWindow,
        defaultSeconds : AiConfig.orchestrator.wakeDispatch.coalesceWindowSeconds
    });

    if (windowMs === 0) {
        flushSubscription(subId);
    } else {
        const state = coalesceState[subId];

        clearTimeout(state.timer);
        state.timer = setTimeout(() => {
            flushSubscription(subId);
        }, computeFlushDelayMs({
            now          : Date.now(),
            windowMs,
            firstQueuedAt: state.firstQueuedAt,
            lastFlushAt  : lastFlushAtBySub[subId] ?? 0,
            refractoryMs : AiConfig.orchestrator.wakeDispatch.flushRefractorySeconds * 1000,
            capMs        : AiConfig.orchestrator.wakeDispatch.flushHardCapSeconds * 1000
        }));
    }
}

/**
 * @summary Whether `messageId` is already read by `recipient` — for reconciling the wake digest
 * against actual mailbox read-status. Mirrors `MailboxService.getReadAtForMessage`: the per-recipient
 * `DELIVERED_TO` edge's `readAt` when that edge exists (broadcasts + delivered DMs), else the MESSAGE
 * node's own `readAt` (direct DM). Read-status is independent of the GraphLog delta that fires the wake,
 * so a large delta (resync / data-sync jump) otherwise re-counts already-read rows as "new".
 * @param {Object} db better-sqlite3 handle (the wake daemon's graph store).
 * @param {String} messageId
 * @param {String} recipient The agent identity the wake targets.
 * @returns {Boolean} true when the message has been read by the recipient.
 * @private
 */
function isMessageReadFor(db, messageId, recipient) {
    const edge = db.prepare(
        `SELECT json_extract(data, '$.properties.readAt') AS readAt
         FROM Edges WHERE source = ? AND target = ? AND type = 'DELIVERED_TO' LIMIT 1`
    ).get(messageId, recipient);

    if (edge !== undefined) {
        return edge.readAt != null;
    }

    const node = db.prepare(
        `SELECT json_extract(data, '$.properties.readAt') AS readAt FROM Nodes WHERE id = ? LIMIT 1`
    ).get(messageId);

    return node ? node.readAt != null : false;
}

/**
 * @summary Emits bounded stale-wake observability without copying mailbox content into daemon logs.
 * @param {Object} opts
 * @param {String} opts.identity Target agent identity.
 * @param {String} opts.subId Subscription id fallback.
 * @param {String} opts.phase Delivery phase (`initial` or `retry`).
 * @param {Object[]} opts.suppressed Suppressed message events.
 * @param {Number|null} opts.oldestAgeMs Oldest parseable non-future age.
 * @returns {void}
 * @private
 */
function logSuppressedMessageWakes({identity, subId, phase, suppressed, oldestAgeMs}) {
    if (suppressed.length === 0) return;

    writeLog('INFO',
        `[Wake Daemon] Suppressed ${suppressed.length} stale/invalid message wake event(s) for ` +
        `${identity || subId} at ${phase} delivery; oldestAgeMs=${oldestAgeMs ?? 'unknown'}.`
    );
}

// WAKE_LANE_DIRECTIVE — the standing lifecycle-first directive, appended in buildWakeDigest ONLY to
// pure-heartbeat digests (the idle-watchdog nudge; message / task / permission wakes omit it — they
// already carry actionable content). Its single canonical, testable authority is `./wakeLaneDirective.mjs`
// (imported above); keep the wording there, not duplicated here, so the discussion / ticket / source cannot silently drift.

/**
 * @summary Flushes the coalesced wake queue into a priority-tagged digest.
 *
 * The digest header carries the highest coalesced message priority so agent policy can
 * interrupt immediately for `high` wakes while deferring `normal` and `low` wakes until
 * the active lifecycle task has completed its required handoff.
 */
async function flushSubscription(subId) {
    const state = coalesceState[subId];
    if (!state) return;

    // Defer while a heavy GraphLog / data-sync delta is still settling: mid-sync the per-message
    // read-state lookup is transiently inconsistent, so already-read backlog would leak into the
    // "N new messages" count and spoof a HIGH digest priority. Keep the coalesced queue intact + re-arm;
    // the cap inside shouldDeferFlush guarantees a genuine wake is delayed, never dropped.
    if (shouldDeferFlush({now: Date.now(), lastHeavyPollAt, deferCount: state.deferCount})) {
        state.deferCount = (state.deferCount || 0) + 1;
        state.timer      = setTimeout(() => flushSubscription(subId), HEAVY_DELTA_SETTLE_MS);
        return;
    }

    // One delivery owner per subscription: an unresolved adapter attempt (direct or retry) defers
    // this flush — the queue stays intact and keeps absorbing arrivals, and the short re-check
    // lands after the in-flight attempt resolves (the defer idiom above, at poll cadence).
    if (deliveryInFlight.has(subId)) {
        state.timer = setTimeout(() => flushSubscription(subId), POLL_INTERVAL_MS);
        return;
    }

    // Flush-time refractory gate: this timer's delay was computed at ARM time, so it cannot have
    // seen a delivery that CONFIRMED after arming — canonically, events queued while the previous
    // digest was in flight. Re-armed to the boundary here (cap still beats refractory), those
    // events land as the NEXT properly-spaced digest instead of a back-to-back double prompt.
    const flushWindowMs = resolveCoalesceWindowMs({
        overrideSeconds: state.subscription.properties?.harnessTargetMetadata?.coalesceWindow,
        defaultSeconds : AiConfig.orchestrator.wakeDispatch.coalesceWindowSeconds
    });
    const holdMs = computeFlushHoldMs({
        now          : Date.now(),
        windowMs     : flushWindowMs,
        firstQueuedAt: state.firstQueuedAt,
        lastFlushAt  : lastFlushAtBySub[subId] ?? 0,
        refractoryMs : AiConfig.orchestrator.wakeDispatch.flushRefractorySeconds * 1000,
        capMs        : AiConfig.orchestrator.wakeDispatch.flushHardCapSeconds * 1000
    });

    if (holdMs > 0) {
        state.timer = setTimeout(() => flushSubscription(subId), holdMs);
        return;
    }

    const { queue, subscription, watermarkGraphTip, watermarkResetCeiling } = state;
    delete coalesceState[subId]; // reset

    if (queue.length === 0) return;

    const identity = subscription.properties?.agentIdentity;

    let messages = [], tasks = [], permissions = [], heartbeats = [];
    for (const ev of queue) {
        if (ev.type === 'message') messages.push(ev);
        else if (ev.type === 'task') tasks.push(ev);
        else if (ev.type === 'permission') permissions.push(ev);
        else if (ev.type === 'heartbeat') heartbeats.push(ev);
    }

    // A large GraphLog delta (resync / data-sync jump) re-includes already-read message rows, so the raw
    // delta over-counts "new messages" and can spoof a HIGH digest priority. Reconcile against actual
    // read-status: keep only genuinely-unread messages for the count / preview / priority — without
    // dropping real wakes (unread messages, tasks, permissions, and heartbeats all still fire).
    messages = messages.filter(ev => !isMessageReadFor(db, ev.messageId, identity));

    // Already-woken GraphLog dedup: drop events the recipient was already woken for
    // (logId <= the per-subscription watermark) so a re-queued backlog can't inflate the "N new" count
    // or spoof a HIGH digest from a stale message. Composes with the readAt reconcile above + the
    // heavy-delta defer at the top — reconciling on the right axis (already-woken, not merely unread).
    const watermark = clampWatermark(wokenWatermark[subId] ?? 0, watermarkGraphTip, watermarkResetCeiling);
    messages    = filterEventsByWatermark(messages,    watermark);
    tasks       = filterEventsByWatermark(tasks,       watermark);
    permissions = filterEventsByWatermark(permissions, watermark);
    heartbeats  = filterEventsByWatermark(heartbeats,  watermark);

    // Stable application-level dedup: GraphLog can re-emit the same immutable MESSAGE under a later
    // logId, so a numeric watermark alone cannot guarantee one physical wake per message/identity.
    // Claim synchronously before awaiting the adapter: another active route for this same identity
    // then sees the claim and cannot race a second prompt. The duplicate events remain "consumed"
    // below so their newer logIds still advance that route's numeric watermark.
    const messageHistory = identity
        ? (wokenMessageIdsByIdentity.get(identity) || new Set())
        : new Set();
    if (identity && !wokenMessageIdsByIdentity.has(identity)) {
        wokenMessageIdsByIdentity.set(identity, messageHistory);
    }
    const messageClaims     = claimUnwokenMessages(messages, messageHistory),
          duplicateMessages = messageClaims.duplicates;
    messages = messageClaims.claimed;

    // Canonical mailbox-age gate: stable-id claims happen first so an old replay is durably consumed,
    // then only still-live messages may affect digest count, preview, or priority. Mailbox state stays
    // untouched; old unread material remains available to explicit inbox recovery.
    const messageFreshness = partitionMessageWakesByFreshness(messages);
    messages = messageFreshness.eligible;
    logSuppressedMessageWakes({
        identity,
        subId,
        phase      : 'initial',
        suppressed : messageFreshness.suppressed,
        oldestAgeMs: messageFreshness.oldestAgeMs
    });

    // Mixed-wake heartbeat suppression (digest content only): a heartbeat is the idle-watchdog nudge,
    // but when it coalesces with an actionable wake (message / task / permission) the agent is already
    // being woken — so the redundant heartbeat is dropped FROM THE DIGEST. A heartbeat-only queue still
    // delivers, including through interactive osascript/tmux adapters: this is the correctly-scoped
    // successor to the per-adapter evaluateSubscription drop that had killed ALL interactive heartbeats.
    // `consumedHeartbeats` keeps the dropped logIds for the watermark below so a re-queued backlog
    // cannot re-deliver them.
    const consumedHeartbeats = heartbeats;
    if (messages.length > 0 || tasks.length > 0 || permissions.length > 0) {
        heartbeats = [];
    }

    const consumedMessages = [...messages, ...messageFreshness.suppressed, ...duplicateMessages];

    // Nothing genuinely-new survived (the delta was entirely already-read or already-woken) → suppress.
    // A stable-id duplicate may carry a newer GraphLog row, so consume that position before returning.
    if (messages.length === 0 && tasks.length === 0 && permissions.length === 0 && heartbeats.length === 0) {
        const consumedMax = maxLogId(consumedMessages);
        if (consumedMax !== null && consumedMax > (wokenWatermark[subId] ?? 0)) {
            wokenWatermark[subId] = consumedMax;
            persistWokenState();
        }
        return;
    }

    const events = {messages, tasks, permissions, heartbeats};

    // Hoisted so the watermark advance below can see an UNKNOWN attempt: an un-abortable transport
    // that timed out may or may not have reached the seat, so its events must not be marked handled.
    let flushOutcome = null;

    if (pendingDeliveryRetries.has(subId)) {
        // Merge-don't-stack: an undelivered digest for this subscription is still pending retry —
        // the seat has NOT seen that block, so dispatching a second one would stack two [WAKE]
        // blocks into one eventual prompt (the observed double-block delivery). Merge this flush's
        // surviving events into the pending entry instead (enqueueDeliveryRetry unions; the
        // watermark advance below still runs) — the retry path delivers ONE union digest when the
        // target recovers. Presence-aware mid-turn detection deliberately stays OUT of this
        // daemon (the presence-aware wake-policy layer owns it); this covers the
        // daemon-observable undelivered state.
        enqueueDeliveryRetry(subscription, identity, events);
    } else {
        const deliveryEvidence = buildWakeDeliveryEvidence(events);
        const digest           = buildWakeDigest(identity, events);

        // Delivery to per-harness adapter, under the per-subscription in-flight reservation. A
        // 'failed' outcome (the dispatch threw against a live target) re-queues for retry —
        // carrying the EVENTS, not just this digest string, so a second failure for the same
        // subscription coalesces them without loss. ONLY a confirmed 'delivered' arms the
        // refractory and emits the uniform counting line (direct and retry symmetrically); a
        // 'skipped' fail-closed refusal does neither — its branch-local log already carries why.
        deliveryInFlight.add(subId);
        let deliveryOutcome;
        try {
            deliveryOutcome = await deliverDigestBounded(subscription, digest, deliveryEvidence);
        } finally {
            deliveryInFlight.delete(subId);
        }

        flushOutcome = deliveryOutcome;

        if (deliveryOutcome === 'failed') {
            enqueueDeliveryRetry(subscription, identity, events);
        } else if (deliveryOutcome === 'delivered') {
            clearTerminalDeliveryFailure(subId);
            lastDeliveryFailureClassBySub.delete(subId);
            lastFlushAtBySub[subId] = Date.now();
            writeLog('INFO',
                `[Wake Dispatch] ${identity || subId}: outcome=delivered priority=${getHighestWakePriority(messages)} ` +
                `messages=${messages.length} tasks=${tasks.length} permissions=${permissions.length} heartbeats=${heartbeats.length}`
            );
        } else if (deliveryOutcome === 'unknown') {
            // Arm the refractory WITHOUT advancing the watermark. The two carry different claims:
            // the refractory says "do not wake this seat again soon" — prudent, because the attempt
            // may have landed; the watermark says "these events are handled" — unproven, and
            // asserting it would silently drop the wake if the orphan never arrived. Never retried
            // here: an immediate re-offer is what produced the observed 8-second duplicates. The
            // events survive below and re-enter a later flush only while they are still unread, so
            // an orphan that did land self-heals into silence once the seat reads it.
            lastFlushAtBySub[subId] = Date.now();
        }
    }

    // Advance the per-subscription watermark to the highest delivered logId so these events are not
    // re-counted if the backlog is re-queued; persist for restart durability. logId is monotonic
    // (append-only GraphLog), so genuinely-new events always land strictly above this mark.
    const deliveredMax = maxLogId([...consumedMessages, ...tasks, ...permissions, ...consumedHeartbeats]);
    let   stateChanged = messages.some(message => Boolean(message.messageId));
    if (flushOutcome !== 'unknown' && deliveredMax !== null && deliveredMax > (wokenWatermark[subId] ?? 0)) {
        wokenWatermark[subId] = deliveredMax;
        stateChanged = true;
    }
    if (stateChanged) persistWokenState();
}

/**
 * Promisified spawn wrapper for injection-safe execution
 */
function spawnAsync(command, args) {
    return new Promise((resolve, reject) => {
        const child      = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let   stderrData = '';
        child.stderr.on('data', (data) => {
            stderrData += data.toString();
        });
        child.on('close', code => {
            if (code === 0) resolve();
            else {
                const errorMsg = stderrData.trim() ? `${command} exited with code ${code}. Stderr: ${stderrData.trim()}` : `${command} exited with code ${code}`;
                reject(new Error(errorMsg));
            }
        });
        child.on('error', reject);
    });
}

/**
 * @summary Dispatches a Codex wake digest through the native Codex app-server control plane.
 *
 * This is the explicit wake-daemon route for subscriptions configured as
 * `codex-app-server`. It intentionally does not fall back to `osascript`; a route
 * explicitly configured as `codex-app-server` must fail visibly instead of
 * recreating the GUI-focus delivery path.
 *
 * `send-message-v2` command success proves app-server acceptance/injection only.
 * The Codex prompt-submission / turn-start boundary remains a wake-prompt landing
 * matrix requirement and needs live app evidence until a submit-capable app-server
 * command is available.
 *
 * @param {Object} subscription WAKE_SUBSCRIPTION node.
 * @param {String} digest Wake digest body.
 * @param {String} [evidenceLabel=''] Formatted wake scenario / route evidence for validation logs.
 * @returns {Promise<void>}
 */
async function deliverViaCodexAppServer(subscription, digest, evidenceLabel = '') {
    const meta    = subscription.properties?.harnessTargetMetadata || {};
    const appName = meta.appName;

    if (appName !== 'Codex') {
        throw new Error(`codex-app-server requires harnessTargetMetadata.appName='Codex' (received '${appName || ''}')`);
    }

    await spawnAsync(AiConfig.fleet.harnessBinaries.codex, ['debug', 'app-server', 'send-message-v2', digest]);
    writeLog('INFO', `[Wake Daemon] Dispatched ${subscription.id} via codex-app-server send-message-v2${evidenceLabel}`);
}

/**
 * @summary Dispatches a wake digest into a live OpenCode session through the seat's embedded
 * HTTP server (`POST /session/:id/prompt_async` — async, non-interactive, 204 fire-and-forget).
 *
 * Explicit route for subscriptions configured as `opencode-server`. It intentionally does not
 * fall back to `osascript`/tmux; a route explicitly configured as `opencode-server` must fail
 * visibly instead of recreating the GUI-focus delivery path (codex-app-server parity).
 *
 * **First-boot envelope contract** (what an OpenCode seat's self-registration must provide):
 * the seat side writes a JSON envelope, refreshed per session, carrying
 * `{hostname, port, sessionId, projectId, directory, username, password, updatedAt}` — the embedded
 * server's coordinates (a random localhost port per boot), the live `sessionId`, and the
 * basic-auth credentials the seat was spawned with (`OPENCODE_SERVER_USERNAME` /
 * `OPENCODE_SERVER_PASSWORD`). Default location `~/.local/share/opencode/wake-envelope.json`
 * (mode 0600), overridable via `harnessTargetMetadata.envelopePath`. The daemon re-reads the
 * envelope on every delivery, so port/session rotation needs no graph write.
 * A connection refusal authorizes at most one re-read within the same adapter invocation, and only
 * when `sessionId + projectId + directory` remain byte-identical; changed authority fails closed.
 *
 * **Two producers, one contract** — the envelope shape above is the canonical node:
 * 1. the boot hook emitted by the seat-config generator
 *    (`ai/services/fleet/generateOpenCodeSeatConfig.mjs`) — run by the seat's supervisor once
 *    the bound port is known; the reliable writer on OpenCode desktop, whose plugin loader
 *    can silently fail its dependency install. Anti-retarget is structural: only the
 *    supervisor, never a child session, runs the hook.
 * 2. `ai/services/fleet/opencodeWakeEnvelopePlugin.mjs` — the event-driven writer for
 *    TUI/CLI sessions where it loads (its child-session retarget guard stays authoritative
 *    there). Both producers write the IDENTICAL shape for the same session, so
 *    last-writer-wins is a no-op; a third producer must update this contract, never drift it.
 *
 * Probe evidence (2026-07-18, seat `@neo-kimi-phoebe`, OpenCode desktop 1.18.3): embedded
 * server on a random localhost port, basic auth accepted from the seat's spawn env, and a
 * live `prompt_async` injection into the seat's own running session (HTTP 204, wake text
 * landed as a session message).
 *
 * @param {Object} subscription WAKE_SUBSCRIPTION node.
 * @param {String} digest Wake digest body.
 * @param {String} [evidenceLabel=''] Formatted wake scenario / route evidence for validation logs.
 * @param {AbortSignal|null} [abortSignal=null] Shared attempt-bound signal from the delivery owner.
 * @returns {Promise<void>}
 */
async function deliverViaOpencodeServer(subscription, digest, evidenceLabel = '', abortSignal = null) {
    const
        meta         = subscription.properties?.harnessTargetMetadata || {},
        envelopePath = meta.envelopePath || path.join(os.homedir(), '.local', 'share', 'opencode', 'wake-envelope.json'),
        first        = await readOpenCodeWakeEnvelope(envelopePath);

    try {
        await postOpenCodeDigest(first, digest, abortSignal);
    } catch (error) {
        if (!isConnectionRefused(error) || abortSignal?.aborted) throw error;

        // A refusal proves only that the old coordinates are dead. Give the authoritative atomic
        // writer one bounded settle beat, then re-read exactly once. Session/project/directory are
        // immutable authority; only loopback coordinates + credentials may rotate.
        writeLog('WARN', `[Wake Daemon] OpenCode route for ${subscription.id} refused its stored coordinates; re-reading the authoritative envelope once.`);
        await wait(OPENCODE_REBIND_SETTLE_MS);

        const rebound = await readOpenCodeWakeEnvelope(envelopePath);

        if (rebound.sessionId !== first.sessionId ||
            rebound.projectId !== first.projectId ||
            rebound.directory !== first.directory
        ) {
            throw new Error('opencode-server authority tuple changed during coordinate rebind; refusing session retarget');
        }

        if (rebound.hostname === first.hostname &&
            rebound.port === first.port &&
            rebound.username === first.username &&
            rebound.password === first.password
        ) {
            const unchanged = new Error('opencode-server coordinates did not change after connection refusal');
            unchanged.code  = 'ECONNREFUSED';
            throw unchanged;
        }

        await postOpenCodeDigest(rebound, digest, abortSignal);
    }

    writeLog('INFO', `[Wake Daemon] Dispatched ${subscription.id} via opencode-server prompt_async${evidenceLabel}`);
}

/**
 * @summary Read and validate one OpenCode wake envelope. The authority tuple is mandatory even
 * though only coordinates drive the HTTP request: it is the no-retarget fence for a stale rebind.
 * @param {String} envelopePath
 * @returns {Promise<Object>}
 * @private
 */
async function readOpenCodeWakeEnvelope(envelopePath) {
    let envelope;

    try {
        envelope = JSON.parse(await fs.readFile(envelopePath, 'utf8'));
    } catch (error) {
        throw new Error(`opencode-server requires a readable seat envelope at '${envelopePath}' (${error.message})`);
    }

    const {hostname, port, sessionId, projectId, directory, username, password} = envelope;

    for (const [key, value] of Object.entries({
        hostname,
        sessionId,
        projectId,
        directory,
        username,
        password
    })) {
        if (typeof value !== 'string' || value.length === 0) {
            throw new Error(`opencode-server envelope at '${envelopePath}' requires '${key}' to be a non-empty string`);
        }
    }

    if (!path.isAbsolute(directory)) {
        throw new Error(`opencode-server envelope at '${envelopePath}' requires 'directory' to be absolute`);
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`opencode-server envelope at '${envelopePath}' requires 'port' to be an integer in 1..65535`);
    }
    if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
        throw new Error(`opencode-server envelope at '${envelopePath}' requires a loopback hostname (received '${hostname}')`);
    }

    return {hostname, port, sessionId, projectId, directory, username, password};
}

/**
 * @summary Submit one OpenCode digest against already-validated coordinates.
 * @param {Object} envelope Validated route envelope.
 * @param {String} digest
 * @param {AbortSignal|null} abortSignal Shared delivery-owner signal.
 * @returns {Promise<void>}
 * @private
 */
async function postOpenCodeDigest({hostname, port, sessionId, username, password}, digest, abortSignal) {
    const deliverySignal = abortSignal
        ? AbortSignal.any([abortSignal, AbortSignal.timeout(5000)])
        : AbortSignal.timeout(5000);
    const response = await fetch(`http://${hostname}:${port}/session/${encodeURIComponent(sessionId)}/prompt_async`, {
        method : 'POST',
        headers: {
            'content-type' : 'application/json',
            'authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
        },
        body    : JSON.stringify({parts: [{type: 'text', text: digest}]}),
        redirect: 'error',
        signal  : deliverySignal
    });

    if (response.status !== 204) {
        throw new Error(`opencode-server prompt_async expected HTTP 204, received ${response.status}`);
    }
}

/**
 * @summary True only for a transport-level connection refusal. HTTP failures, aborts, malformed
 * envelopes, and connection resets do not authorize a coordinate re-read.
 * @param {*} error
 * @returns {Boolean}
 * @private
 */
function isConnectionRefused(error) {
    return error?.code === 'ECONNREFUSED' || error?.cause?.code === 'ECONNREFUSED';
}

/**
 * @summary Resolves the kimi-server loopback coordinates across the two harness generations.
 *
 * Precedence (first hit wins):
 * 1. Explicit `harnessTargetMetadata.lockPath` override (test seam + operator pin).
 * 2. Legacy v0.27 `~/.kimi-code/server/lock` (`kimi server`, hard-deprecated in v0.28).
 * 3. Live scan of v0.28+ `~/.kimi-code/server/instances/{server_id}.json` (`kimi web`).
 *
 * Instance liveness is **pid-based** (`process.kill(pid, 0)`, EPERM counts as alive), NOT
 * heartbeat-based: the instance file's `heartbeat_at` is upstream-throttled — 39-minute idle
 * gaps were observed on a definitively live server (2026-07-20, seat `@neo-kimi-iris`, kimi
 * v0.28.0) — so a heartbeat freshness gate would produce false fail-closed wake drops. A
 * pid-reused candidate (wrong process at a recycled pid) degrades fail-visibly at the
 * bearer/HTTP layer downstream, never silently.
 *
 * Zero live instances → actionable error naming both generations and the `kimi web`
 * remediation. Multiple live instances → fail closed (never pick arbitrarily); the operator
 * disambiguates via `harnessTargetMetadata.lockPath`.
 *
 * @param {Object} meta The subscription's `harnessTargetMetadata` (already default-resolved).
 * @returns {Promise<{lock: Object, lockSource: String}>} The coordinate payload + its origin.
 */
async function resolveKimiServerLock(meta) {
    if (typeof meta.lockPath === 'string' && meta.lockPath.length > 0) {
        try {
            return {lock: JSON.parse(await fs.readFile(meta.lockPath, 'utf8')), lockSource: `override '${meta.lockPath}'`};
        } catch (err) {
            throw new Error(`kimi-server requires a readable server lock at '${meta.lockPath}' (${err.message})`);
        }
    }

    const legacyPath = path.join(os.homedir(), '.kimi-code', 'server', 'lock');

    try {
        return {lock: JSON.parse(await fs.readFile(legacyPath, 'utf8')), lockSource: `legacy v0.27 lock '${legacyPath}'`};
    } catch (err) {
        // v0.28+ seats never write the legacy lock — fall through to the instance scan.
    }

    const instancesDir = path.join(os.homedir(), '.kimi-code', 'server', 'instances');
    const notFound     = `kimi-server found no v0.27 lock at '${legacyPath}' and no live v0.28 instance in '${instancesDir}' — is 'kimi web' running on this seat?`;

    let entries = [];

    try {
        entries = await fs.readdir(instancesDir);
    } catch (err) {
        throw new Error(`${notFound} (${err.message})`);
    }

    const live = [];

    for (const entry of entries) {
        if (!entry.endsWith('.json')) continue;

        const instancePath = path.join(instancesDir, entry);

        try {
            const candidate = JSON.parse(await fs.readFile(instancePath, 'utf8'));

            if (Number.isInteger(candidate.pid) && candidate.pid > 0) {
                try {
                    process.kill(candidate.pid, 0);
                    live.push({candidate, instancePath});
                } catch (killErr) {
                    if (killErr.code === 'EPERM') live.push({candidate, instancePath}); // exists, owned by another user
                }
            }
        } catch (err) {
            // Unparseable instance file: not a coordinate source.
        }
    }

    if (live.length === 0) {
        throw new Error(notFound);
    }

    if (live.length > 1) {
        throw new Error(`kimi-server found ${live.length} live v0.28 instances in '${instancesDir}' and cannot pick one arbitrarily — set harnessTargetMetadata.lockPath to disambiguate`);
    }

    return {lock: live[0].candidate, lockSource: `v0.28 instance '${live[0].instancePath}'`};
}

/**
 * @summary Dispatches a wake digest into a live Kimi Code session through the seat's local
 * `kimi server` REST surface (`POST /api/v1/sessions/{id}/prompts` — submitPrompt).
 *
 * Explicit route for subscriptions configured as `kimi-server`. It intentionally does not
 * fall back to `osascript`/tmux; a route explicitly configured as `kimi-server` must fail
 * visibly instead of recreating the GUI-focus delivery path (opencode-server parity).
 *
 * **Session authority — the wake envelope** (opencode-server envelope parity): the target
 * session id comes from `~/.kimi-code/wake-envelope.json` (mode 0600, overridable via
 * `harnessTargetMetadata.envelopePath`), written by the seat's SessionStart hook
 * (`.kimi-code/hooks/wakeEnvelopeHook.mjs`) with the exact `{sessionId, cwd, updatedAt}` of
 * the live session. The daemon re-reads the envelope on every delivery, so session rotation
 * needs no graph write. Picking a session heuristically (e.g. freshest `updated_at` from the
 * session index) is deliberately NOT the path: multiple resumed/child sessions can share one
 * checkout, and a wake landing in the wrong session is a cross-session retarget. The envelope
 * is the authority; a missing/mismatched envelope fails visibly. Set `harnessTargetMetadata.cwd`
 * for multi-checkout seats (same OS user, several checkouts): the envelope refreshes per
 * session, so for a single-seat checkout the cross-check is belt-and-suspenders, but for
 * shared ones it is the stale-checkout guard.
 *
 * **Coordinate contract — two harness generations** (no seat-side writer needed — the harness
 * persists the coordinate files itself): the bearer token comes from `~/.kimi-code/server.token`
 * (persistent across restarts; rotation is harness-managed). The loopback coordinates are
 * generation-dependent: v0.27 (`kimi server`, hard-deprecated in v0.28) wrote
 * `~/.kimi-code/server/lock` (`{pid, host, port, …}`); v0.28+ (`kimi web`) writes
 * `~/.kimi-code/server/instances/{server_id}.json` (`{server_id, pid, host, port, started_at,
 * heartbeat_at, host_version}`). Discovery precedence: explicit `harnessTargetMetadata.lockPath`
 * override → legacy v0.27 lock → live v0.28 instance scan (pid-liveness; zero live → actionable
 * error, multiple live → fail closed). `lockPath` / `tokenPath` metadata stay authoritative
 * test seams. The daemon re-reads coordinates on every delivery, so server restarts and token
 * rotation need no graph write.
 *
 * Probe evidence (2026-07-19, seat `@neo-kimi-iris`, kimi v0.27.0): loopback 127.0.0.1:58627
 * with bearer auth default-on, `/openapi.json` enumerating the surface at runtime, hook stdin
 * carrying `session_id` + `cwd` for every event (official hook contract), and the submitPrompt
 * contract `{content: [{type: 'text', text}]}` → HTTP 200 with `{code: 0, data: {status:
 * running|queued|blocked}}` — HTTP 200 also wraps typed application errors, so delivery counts
 * only after parsing `code === 0`. A queued/blocked status still lands the digest in the
 * session's own queue — the seat sees it when the active turn drains.
 *
 * Probe evidence (2026-07-20, seat `@neo-kimi-iris`, kimi v0.28.0): `kimi server`
 * hard-deprecated (no `server/lock` written); `kimi web` resident on 127.0.0.1:58627 writing
 * `server/instances/{server_id}.json`; `heartbeat_at` upstream-throttled (39-min idle gaps on a
 * definitively live server) so instance liveness is pid-based, never heartbeat-based;
 * `/openapi.json` still enumerates `POST /api/v1/sessions/{id}/prompts`; a live TUI-hosted
 * session is listed by the REST surface and accepts submitPrompt (`code: 0, status:
 * "running"`).
 *
 * @param {Object} subscription WAKE_SUBSCRIPTION node.
 * @param {String} digest Wake digest body.
 * @param {String} [evidenceLabel=''] Formatted wake scenario / route evidence for validation logs.
 * @param {AbortSignal|null} [abortSignal=null] Shared attempt-bound signal from the delivery owner.
 * @returns {Promise<void>}
 */
async function deliverViaKimiServer(subscription, digest, evidenceLabel = '', abortSignal = null) {
    const meta         = subscription.properties?.harnessTargetMetadata || {};
    const tokenPath    = meta.tokenPath    || path.join(os.homedir(), '.kimi-code', 'server.token');
    const envelopePath = meta.envelopePath || path.join(os.homedir(), '.kimi-code', 'wake-envelope.json');

    let envelope, lock, token;

    try {
        envelope = JSON.parse(await fs.readFile(envelopePath, 'utf8'));
    } catch (err) {
        throw new Error(`kimi-server requires a readable wake envelope at '${envelopePath}' (${err.message})`);
    }

    const {sessionId, cwd} = envelope;

    // Typed + authority-checked session target: a malformed envelope must never steer the digest
    // into an arbitrary session. The optional metadata cwd cross-check catches a stale envelope
    // written for a different seat checkout.
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
        throw new Error(`kimi-server envelope at '${envelopePath}' requires 'sessionId' to be a non-empty string`);
    }

    if (typeof cwd !== 'string' || cwd.length === 0) {
        throw new Error(`kimi-server envelope at '${envelopePath}' requires 'cwd' to be a non-empty string`);
    }

    if (typeof meta.cwd === 'string' && meta.cwd.length > 0 && meta.cwd !== cwd) {
        throw new Error(`kimi-server envelope at '${envelopePath}' cwd '${cwd}' does not match harnessTargetMetadata.cwd '${meta.cwd}'`);
    }

    const {lock: resolvedLock, lockSource} = await resolveKimiServerLock(meta);
    lock = resolvedLock;

    try {
        token = (await fs.readFile(tokenPath, 'utf8')).trim();
    } catch (err) {
        throw new Error(`kimi-server requires a readable bearer token at '${tokenPath}' (${err.message})`);
    }

    const {host, port} = lock;

    // Typed + authority-checked coordinates: a malformed lock must never steer the daemon's HTTP
    // client off the seat's loopback server. Delivery is globally serialized, so the fetch is
    // also deadline-bounded — one hung endpoint must not wedge every later wake route.
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
        throw new Error(`kimi-server lock from ${lockSource} requires a loopback host (received '${host}')`);
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`kimi-server lock from ${lockSource} requires 'port' to be an integer in 1..65535`);
    }

    if (token.length === 0) {
        throw new Error(`kimi-server token at '${tokenPath}' is empty`);
    }

    const deliverySignal = abortSignal
        ? AbortSignal.any([abortSignal, AbortSignal.timeout(5000)])
        : AbortSignal.timeout(5000);
    const response = await fetch(`http://${host}:${port}/api/v1/sessions/${encodeURIComponent(sessionId)}/prompts`, {
        method : 'POST',
        headers: {
            'content-type' : 'application/json',
            'authorization': `Bearer ${token}`
        },
        body    : JSON.stringify({content: [{type: 'text', text: digest}]}),
        redirect: 'error',
        signal  : deliverySignal
    });

    if (response.status !== 200) {
        throw new Error(`kimi-server submitPrompt expected HTTP 200, received ${response.status}`);
    }

    const body = await response.json();

    if (body?.code !== 0) {
        throw new Error(`kimi-server submitPrompt expected code 0, received ${JSON.stringify(body?.code ?? null)}`);
    }

    const status = body?.data?.status;
    writeLog('INFO', `[Wake Daemon] Dispatched ${subscription.id} via kimi-server submitPrompt (session ${sessionId}${status ? `, status=${status}` : ''})${evidenceLabel}`);
}

/**
 * @summary Reads a process's `ps lstart` start time — the reuse-safe half of an owner-process
 * epoch. A dead pid whose number was reassigned by the OS reports a different start time, so the
 * comparison distinguishes "alive" from "alive but a different process".
 * @param {Number} pid
 * @returns {String|null}
 */
function readProcessStartTime(pid) {
    try {
        const out = spawnSync('ps', ['-p', String(pid), '-o', 'lstart=']).stdout?.toString().trim();
        return out || null
    } catch {
        return null
    }
}

/**
 * `kimi-pull-bridge` — the pull-inversion wake route for Kimi seats. Instead of POSTing into a
 * `kimi web` process (whose prompt route materializes the serverside twin per the pinned
 * `prompts.ts` `resume()` semantics), the daemon appends one wake line to the seat's local
 * outbox. The owning interactive session's own consumer (a repo-owned poll the agent registers
 * in-process) fires via `agent.turn.steer` in the OWNING TUI process and consumes the outbox —
 * execution-owner delivery with zero inbound surface on the TUI.
 *
 * The enqueue is **durable-acceptance, not owner-acknowledgement**: this adapter returns
 * `delivered` when the entry is durably queued under the cross-process append lock with a
 * validated owner tuple — `{agentIdentity, sessionId, processEpoch}` — inside. Owner-ack (a
 * nonce-correlated consume receipt from the owner process) is the seat-side consumer's layer,
 * not this daemon's return path. `wakeId` is a content digest of the logical wake
 * (`subscriptionId` + digest body), so a retry of the same coalesced wake re-appends the SAME id
 * — the seat consumer's idempotency key on consume.
 *
 * Durability protocol (both sides, one lock): the append runs under `withOutboxLock(outboxPath)` —
 * the STRICT sibling lock with no TTL and no unlocked fall-through (a live consumer is never
 * reclaimed mid-compact, and a writer that cannot acquire within its bounded wait throws instead
 * of writing unlocked) — the same lock the consumer holds for its read-and-compact, so an append
 * can never interleave with a consume and erase either side.
 * Path confinement: the outbox must resolve inside the seat home (the envelope's directory),
 * with no symlinked parent or file; an existing outbox with a permissive mode is repaired to
 * 0600 (and the repair logged) rather than silently preserved. The owner epoch comes from the
 * wake envelope's `pid` (written by the seat's SessionStart hook as the interactive TUI's own
 * process); a dead epoch fails closed with an actionable error — a rotated seat writes a fresh
 * envelope.
 *
 * This adapter deliberately has NO web-server fallback — a route configured as
 * `kimi-pull-bridge` must fail loudly rather than deliver into the twin surface.
 * @param {Object} subscription WAKE_SUBSCRIPTION node.
 * @param {String} digest Wake digest body.
 * @param {String} [evidenceLabel=''] Formatted wake scenario / route evidence for validation logs.
 * @returns {Promise<void>}
 */
async function deliverViaKimiPullBridge(subscription, digest, evidenceLabel = '') {
    const meta         = subscription.properties?.harnessTargetMetadata || {};
    const envelopePath = meta.envelopePath || path.join(os.homedir(), '.kimi-code', 'wake-envelope.json');
    const outboxPath   = path.resolve(meta.outboxPath || path.join(os.homedir(), '.kimi-code', 'wake-outbox.jsonl'));

    let envelope;

    try {
        envelope = JSON.parse(await fs.readFile(envelopePath, 'utf8'));
    } catch (err) {
        throw new Error(`kimi-pull-bridge requires a readable wake envelope at '${envelopePath}' (${err.message})`);
    }

    const {sessionId, cwd, pid: processEpoch} = envelope;

    // Same typed + authority-checked seat contract as the kimi-server adapter, extended with the
    // owner-process epoch the pull contract queues for.
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
        throw new Error(`kimi-pull-bridge envelope at '${envelopePath}' requires 'sessionId' to be a non-empty string`);
    }

    if (typeof cwd !== 'string' || cwd.length === 0) {
        throw new Error(`kimi-pull-bridge envelope at '${envelopePath}' requires 'cwd' to be a non-empty string`);
    }

    if (typeof meta.cwd === 'string' && meta.cwd.length > 0 && meta.cwd !== cwd) {
        throw new Error(`kimi-pull-bridge envelope at '${envelopePath}' cwd '${cwd}' does not match harnessTargetMetadata.cwd '${meta.cwd}'`);
    }

    if (!Number.isInteger(processEpoch)) {
        throw new Error(`kimi-pull-bridge envelope at '${envelopePath}' requires an integer 'pid' (owner process epoch) — refresh it via the seat's SessionStart hook`);
    }

    try {
        process.kill(processEpoch, 0);
    } catch (err) {
        if (err.code === 'ESRCH') {
            throw new Error(`kimi-pull-bridge envelope at '${envelopePath}' names a dead owner process (pid ${processEpoch}) — the seat's TUI rotated; refusing to queue a wake for a stale owner`);
        }
        // EPERM = alive but unsignalable from this uid — still alive, and the seat's own process.
    }

    // Reuse-safe epoch: a dead pid whose number was reassigned by the OS fails the start-time
    // comparison. The envelope records the owner's `ps lstart` at SessionStart; a live pid with a
    // different start time is a different process.
    if (typeof envelope.pidStartedAt !== 'string' || envelope.pidStartedAt.length === 0) {
        throw new Error(`kimi-pull-bridge envelope at '${envelopePath}' requires 'pidStartedAt' (owner process start time) — refresh it via the seat's SessionStart hook`);
    }

    const liveStartedAt = readProcessStartTime(processEpoch);

    if (liveStartedAt !== envelope.pidStartedAt) {
        throw new Error(`kimi-pull-bridge envelope at '${envelopePath}' epoch mismatch for pid ${processEpoch}: recorded start '${envelope.pidStartedAt}' vs live '${liveStartedAt}' — a rotated or pid-reused owner`);
    }

    // Identity leg: the subscription's owner must be the seat's owner. The envelope carries the
    // seat's provisioned identity; a mismatch means the route targets a different seat entirely.
    if (typeof envelope.agentIdentity !== 'string' || envelope.agentIdentity.length === 0) {
        throw new Error(`kimi-pull-bridge envelope at '${envelopePath}' requires 'agentIdentity' — provision the seat identity and refresh via the SessionStart hook`);
    }

    if (subscription.properties?.agentIdentity !== envelope.agentIdentity) {
        throw new Error(`kimi-pull-bridge subscription identity '${subscription.properties?.agentIdentity}' does not match seat owner '${envelope.agentIdentity}'`);
    }

    // Path confinement: the outbox must live inside the seat home (the envelope's directory),
    // with no symlinked parent directory or symlinked outbox file. Comparisons run on realpaths —
    // on macOS the tmp root itself is a `/var` → `/private/var` symlink, so a naive literal
    // prefix check would refuse every legitimate seat path.
    const seatDir     = path.dirname(path.resolve(envelopePath)),
          realSeatDir = await fs.realpath(seatDir);

    if (!outboxPath.startsWith(seatDir + path.sep) && !outboxPath.startsWith(realSeatDir + path.sep)) {
        throw new Error(`kimi-pull-bridge outboxPath '${outboxPath}' escapes the seat home '${seatDir}' — refusing to write outside the seat authority`);
    }

    const outboxParent = path.dirname(outboxPath);

    if (await fs.pathExists(outboxParent)) {
        const realParent = await fs.realpath(outboxParent);

        if (realParent !== realSeatDir && !realParent.startsWith(realSeatDir + path.sep)) {
            throw new Error(`kimi-pull-bridge outboxPath '${outboxPath}' resolves through a symlink outside the seat home '${seatDir}'`);
        }
    }

    if (await fs.pathExists(outboxPath) && (await fs.lstat(outboxPath)).isSymbolicLink()) {
        throw new Error(`kimi-pull-bridge outboxPath '${outboxPath}' is a symbolic link — refusing to write through it`);
    }

    // Least privilege: an existing outbox with a permissive mode is repaired, never preserved.
    if (await fs.pathExists(outboxPath)) {
        const stat = await fs.stat(outboxPath);

        if ((stat.mode & 0o777) !== 0o600) {
            await fs.chmod(outboxPath, 0o600);
            writeLog('WARN', `[Wake Daemon] Repaired wake outbox permissions to 0600 at '${outboxPath}'`);
        }
    }

    const wakeId = nodeCrypto.createHash('sha256').update(`${subscription.id}:${digest}`).digest('hex').slice(0, 16),
          entry  = {
              wakeId,
              subscriptionId: subscription.id,
              agentIdentity : subscription.properties?.agentIdentity ?? null,
              sessionId,
              processEpoch,
              pidStartedAt  : envelope.pidStartedAt,
              digest,
              writtenAt     : new Date().toISOString()
          };

    await fs.ensureDir(outboxParent);
    await withOutboxLock(outboxPath, () => fs.appendFile(outboxPath, JSON.stringify(entry) + '\n', {mode: 0o600}));

    writeLog('INFO', `[Wake Daemon] Queued ${subscription.id} via kimi-pull-bridge (outbox ${outboxPath}, wake ${wakeId}, owner ${sessionId}@${processEpoch})${evidenceLabel}`);
}

/**
 * @summary Delivers a wake digest via osascript, retrying transient frontmost-loss races.
 *
 * macOS focus-stealing prevention makes a background daemon's `activate` / `set frontmost`
 * best-effort: when another app holds frontmost during the multi-second activate → paste →
 * restore sequence, `assertTargetFrontmost` aborts the osascript with a `-2700`
 * "lost frontmost status" error. Focus contention is transient, so we re-attempt the whole
 * delivery a few times before giving up.
 *
 * Phase-aware idempotency guard: the wake payload submit is attempted (`key code 36` / Enter)
 * BEFORE the "user input restore" phases. A frontmost-loss reported for a restore phase therefore
 * means the submit step already ran — only the user's draft-restore failed (cosmetic). We must NOT
 * retry that case (it would double-submit the wake). Non-race errors (syntax/permissions) re-throw
 * immediately. For Codex Desktop, an `osascript` exit proves adapter completion, not turn start.
 * @param {String[]} osascriptArgs The fully-built `osascript -e …` argument list.
 * @param {String} subscriptionId For log attribution.
 * @param {String} appName For log attribution.
 * @param {String} [evidenceLabel=''] Formatted wake scenario / route evidence for validation logs.
 * @returns {Promise<void>}
 */
async function deliverViaOsascriptWithRetry(osascriptArgs, subscriptionId, appName, evidenceLabel = '') {
    const maxAttempts = 4,
          backoffMs   = 800;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await spawnAsync('osascript', osascriptArgs);
            const attemptLabel = attempt > 1 ? ` (attempt ${attempt}/${maxAttempts})` : '',
                  outcomeLabel = appName === 'Codex' ? 'Submit attempted' : 'Delivered';
            writeLog('INFO',
                `[Wake Daemon] ${outcomeLabel} ${subscriptionId} via osascript to ${appName}${attemptLabel}${evidenceLabel}`);
            return
        } catch (err) {
            const message         = err.message || '',
                  isFrontmostRace = /lost frontmost status|-2700/.test(message),
                  afterSubmit     = /user input restore/.test(message);

            // Submit step already ran; only the draft-restore lost frontmost → do not retry.
            if (isFrontmostRace && afterSubmit) {
                const outcomeLabel = appName === 'Codex' ? 'wake submit attempted' : 'wake landed';
                writeLog('WARN',
                    `[Wake Daemon] ${subscriptionId} ${outcomeLabel} but draft-restore lost frontmost; ` +
                    `not retrying (avoids double-send)${evidenceLabel}. ${message}`);
                return
            }

            // Lost frontmost before submit → transient focus contention → retry the whole delivery.
            if (attempt < maxAttempts && isFrontmostRace) {
                writeLog('WARN',
                    `[Wake Daemon] Wake delivery ${subscriptionId} attempt ${attempt}/${maxAttempts} ` +
                    `lost frontmost before submit (focus contention); retrying in ${backoffMs}ms. ${message}`);
                await wait(backoffMs);
                continue
            }

            throw err
        }
    }
}

/**
 * @summary Classifies a queued wake digest into the scenario observed by the delivery adapter.
 * @param {Object} events Wake event arrays.
 * @returns {{scenario: String, counts: Object}}
 */
function buildWakeDeliveryEvidence({messages = [], tasks = [], permissions = [], heartbeats = []} = {}) {
    const counts = {
        messages   : messages.length,
        tasks      : tasks.length,
        permissions: permissions.length,
        heartbeats : heartbeats.length
    };

    const actionableCount = counts.messages + counts.tasks + counts.permissions;
    const correlation     = {
        messageIds   : messages.map(message => message.messageId).filter(Boolean),
        taskIds      : tasks.map(task => task.taskId).filter(Boolean),
        permissionIds: permissions.map(permission => permission.logId).filter(Boolean),
        heartbeatIds : heartbeats.map(heartbeat => heartbeat.logId).filter(Boolean)
    };

    let scenario = 'empty';
    if (counts.heartbeats > 0 && actionableCount === 0) {
        scenario = 'pure-heartbeat';
    } else if (counts.messages > 0 && counts.tasks === 0 && counts.permissions === 0 && counts.heartbeats === 0) {
        scenario = 'direct-message';
    } else if (counts.messages > 0 && counts.tasks === 0 && counts.permissions === 0 && counts.heartbeats > 0) {
        scenario = 'mixed-message-heartbeat';
    } else if (counts.heartbeats > 0 && actionableCount > 0) {
        scenario = 'mixed-actionable-heartbeat';
    } else if (actionableCount > 0) {
        scenario = 'actionable';
    }

    return {scenario, counts, correlation};
}

/**
 * @summary Formats wake-delivery evidence for live route validation logs.
 * @param {Object} evidence Scenario/count evidence from buildWakeDeliveryEvidence().
 * @param {Object} options Adapter metadata.
 * @returns {String}
 */
function formatWakeDeliveryEvidence(evidence, {adapter, adapterSource, appName}) {
    if (!evidence) return '';

    const counts = evidence.counts || {};

    const scenario       = evidence.scenario || 'unknown',
          submitBoundary = adapter === 'osascript' && appName === 'Codex'
              ? '; submitProof=attempted; turnStartProof=live-required'
              : '',
          nonceBoundary  = evidence.wakeSubmitNonce ? `; wakeSubmitNonce=${evidence.wakeSubmitNonce}` : '';

    return ` (scenario=${scenario}; route=${adapter}; adapterSource=${adapterSource}; app=${appName || ''}; ` +
        `counts=messages:${counts.messages || 0},tasks:${counts.tasks || 0},` +
        `permissions:${counts.permissions || 0},heartbeats:${counts.heartbeats || 0}${submitBoundary}${nonceBoundary})`;
}

/**
 * @summary Formats stable event identifiers for post-submit turn-start correlation logs.
 * @param {Object} evidence Scenario/count evidence from buildWakeDeliveryEvidence().
 * @returns {String}
 */
function formatWakeCorrelationEvidence(evidence = {}) {
    const correlation = evidence.correlation || {},
          parts       = [];

    if (correlation.messageIds?.length) {
        parts.push(`messageIds=${correlation.messageIds.slice(-3).join(',')}`);
    }
    if (correlation.taskIds?.length) {
        parts.push(`taskIds=${correlation.taskIds.slice(-3).join(',')}`);
    }
    if (correlation.permissionIds?.length) {
        parts.push(`permissionLogIds=${correlation.permissionIds.slice(-3).join(',')}`);
    }
    if (correlation.heartbeatIds?.length) {
        parts.push(`heartbeatLogIds=${correlation.heartbeatIds.slice(-3).join(',')}`);
    }
    if (evidence.wakeSubmitNonce) {
        parts.push(`wakeSubmitNonce=${evidence.wakeSubmitNonce}`);
    }

    return parts.length ? `; ${parts.join('; ')}` : '';
}

/**
 * @summary Whether a delivery adapter attempts to submit a Codex prompt and therefore needs
 * nonce-backed turn-start causality evidence.
 * @param {Object} options
 * @param {String} options.adapter Resolved wake adapter.
 * @param {String} [options.appName] Target app name.
 * @returns {Boolean}
 */
function isCodexSubmitProofAdapter({adapter, appName}) {
    return appName === 'Codex' && (adapter === 'osascript' || adapter === 'test-codex-submit');
}

/**
 * @summary Appends a hook-visible nonce to a Codex wake digest without changing wake semantics.
 * @param {String} digest Wake digest body.
 * @param {String} wakeSubmitNonce Per-submit correlation id.
 * @returns {String}
 */
function appendCodexWakeSubmitNonce(digest, wakeSubmitNonce) {
    if (!wakeSubmitNonce) return digest;
    return `${digest}\n\n<!-- ${CODEX_WAKE_SUBMIT_NONCE_PREFIX}${wakeSubmitNonce} -->`;
}

/**
 * @summary Reads the first turn-presence interval that started after a wake submit attempt.
 *
 * The Codex prompt-submit hook writes `AGENT_TURN_PRESENCE` at the actual turn boundary. Terminal
 * updates can later change `source` to `add_memory`, so source is diagnostic only. Until the wake
 * payload carries a nonce into the prompt-submit hook, this query is timestamp-window evidence: useful
 * for classifying no-turn-start failures, but not proof that the scripted Enter rather than a later
 * human Enter caused a matching turn.
 *
 * @param {Object} sqlite better-sqlite3 handle.
 * @param {String} agentIdentity Recipient AgentIdentity node id.
 * @param {String} sinceIso Submit-attempt timestamp.
 * @param {Object} [options]
 * @param {String} [options.wakeSubmitNonce] Required wake-submit nonce for causal matches.
 * @returns {Object|null}
 */
function findTurnPresenceAfter(sqlite, agentIdentity, sinceIso, {wakeSubmitNonce} = {}) {
    const params      = [agentIdentity, sinceIso];
    let   nonceFilter = '';

    if (wakeSubmitNonce) {
        nonceFilter = `AND json_extract(data, '$.properties.wakeSubmitNonce') = ?`;
        params.push(wakeSubmitNonce);
    }

    const row = sqlite.prepare(`
        SELECT data FROM Nodes
        WHERE (
            json_extract(data, '$.label') = 'AGENT_TURN_PRESENCE'
            OR json_extract(data, '$.type') = 'AGENT_TURN_PRESENCE'
        )
          AND json_extract(data, '$.properties.agentIdentity') = ?
          AND json_extract(data, '$.properties.startedAt') >= ?
          ${nonceFilter}
        ORDER BY json_extract(data, '$.properties.startedAt') ASC
        LIMIT 1
    `).get(...params);

    if (!row?.data) return null;

    try {
        return JSON.parse(row.data).properties || null;
    } catch {
        return null;
    }
}

/**
 * @summary Schedules a bounded Codex submit-attempt observer using turn-presence rows.
 *
 * This is evidence-only: it does not retry, alter the submit primitive, or gate delivery. It converts
 * `turnStartProof=live-required` into one of three durable log outcomes when the graph oracle is
 * available: `wake-submit-started`, `wake-submit-not-started`, or `wake-submit-unknown`. The started
 * outcome is reserved for a nonce-correlated turn-presence row; timestamp-window-only matches are
 * ambiguous because a later human Enter can create the same active-turn evidence.
 *
 * @param {Object} subscription WAKE_SUBSCRIPTION node.
 * @param {Date} submitAttemptedAt Timestamp immediately before the submit adapter ran.
 * @param {Object} deliveryEvidence Scenario/count/correlation evidence.
 * @returns {void}
 */
function scheduleCodexTurnStartProof(subscription, submitAttemptedAt, deliveryEvidence = {}) {
    const timeoutMs = CODEX_TURN_START_PROOF_TIMEOUT_MS,
          pollMs    = Math.max(50, CODEX_TURN_START_PROOF_POLL_MS);

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return;

    const agentIdentity   = subscription.properties?.agentIdentity,
          submitIso       = submitAttemptedAt.toISOString(),
          deadlineAt      = Date.now() + timeoutMs,
          correlation     = formatWakeCorrelationEvidence(deliveryEvidence),
          wakeSubmitNonce = deliveryEvidence.wakeSubmitNonce;

    if (!agentIdentity) {
        writeLog('WARN',
            `[Wake Daemon] Turn-start proof wake-submit-unknown ${subscription.id}: ` +
            `missing subscription.properties.agentIdentity${correlation}`
        );
        return;
    }
    if (!wakeSubmitNonce) {
        writeLog('WARN',
            `[Wake Daemon] Turn-start proof wake-submit-unknown ${subscription.id} ` +
            `for ${agentIdentity}: missing wakeSubmitNonce${correlation}`
        );
        return;
    }

    const poll = () => {
        try {
            const turn = findTurnPresenceAfter(db, agentIdentity, submitIso, {wakeSubmitNonce});
            if (turn) {
                const latencyMs = Math.max(0, new Date(turn.startedAt).getTime() - submitAttemptedAt.getTime());
                writeLog('INFO',
                    `[Wake Daemon] Turn-start proof wake-submit-started ${subscription.id} ` +
                    `for ${agentIdentity} after ${latencyMs}ms ` +
                    `(correlation=nonce; turnId=${turn.turnId || 'unknown'}; startedAt=${turn.startedAt}; ` +
                    `source=${turn.source || 'unknown'}${correlation})`
                );
                return;
            }

            const ambiguousTurn = findTurnPresenceAfter(db, agentIdentity, submitIso);
            if (ambiguousTurn) {
                const latencyMs = Math.max(0, new Date(ambiguousTurn.startedAt).getTime() - submitAttemptedAt.getTime());
                writeLog('WARN',
                    `[Wake Daemon] Turn-start proof wake-submit-unknown ${subscription.id} ` +
                    `for ${agentIdentity} after ${latencyMs}ms ` +
                    `(correlation=timestamp-window-without-nonce; turnId=${ambiguousTurn.turnId || 'unknown'}; ` +
                    `startedAt=${ambiguousTurn.startedAt}; source=${ambiguousTurn.source || 'unknown'}${correlation})`
                );
                return;
            }
        } catch (error) {
            writeLog('WARN',
                `[Wake Daemon] Turn-start proof wake-submit-unknown ${subscription.id} ` +
                `for ${agentIdentity}: ${error.message}${correlation}`
            );
            return;
        }

        if (Date.now() >= deadlineAt) {
            writeLog('WARN',
                `[Wake Daemon] Turn-start proof wake-submit-not-started ${subscription.id} ` +
                `for ${agentIdentity} after ${timeoutMs}ms since ${submitIso} ` +
                `(correlation=nonce${correlation})`
            );
            return;
        }

        const timer = setTimeout(poll, pollMs);
        timer.unref?.();
    };

    const timer = setTimeout(poll, pollMs);
    timer.unref?.();
}

/**
 * @summary Escapes values interpolated into AppleScript string literals.
 * @param {String} value
 * @returns {String}
 */
function escapeAppleScriptString(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Global mutex for serializing adapter deliveries.
 * Prevents concurrent osascript calls from colliding when multiple agents wake simultaneously.
 */
let deliveryPromise = Promise.resolve();

// Bounded retry store for wakes whose adapter dispatch THREW (a live-target delivery failure). The
// global lastSyncId tail cursor consumes the source GraphLog events regardless
// of delivery outcome, so a failed delivery is otherwise lost; this holds the failed EVENTS and
// rebuilds + re-attempts the digest on later poll cycles, independent of the cursor — coalescing
// repeated same-subscription failures so no earlier wake is overwritten. After the cap the wake is
// dropped with a terminal error so a persistently-failing target cannot storm or wedge the loop.
const MAX_DELIVERY_RETRIES          = Number(process.env.WAKE_MAX_DELIVERY_RETRIES) || 5;
const pendingDeliveryRetries        = new Map(); // subscriptionId -> {subscription, identity, events, attempts, nextAttemptAt}
const lastDeliveryFailureClassBySub = new Map();

/**
 * @summary Collapse an adapter error into a bounded, non-secret operator-health classification.
 * Raw messages can carry envelope paths, endpoints, or credentials and never enter the receipt.
 * @param {*} error
 * @param {String} adapter
 * @returns {String}
 * @private
 */
function classifyDeliveryFailure(error, adapter) {
    const
        code    = error?.code || error?.cause?.code,
        message = String(error?.message || '');

    if (code === 'ECONNREFUSED') return 'connection-refused';
    if (error?.name === 'AbortError' || code === 'ABORT_ERR') return 'attempt-aborted';
    if (message.includes('authority tuple changed')) return 'authority-retarget-refused';
    if (message.includes('requires a readable seat envelope') || message.includes('envelope at')) return 'invalid-envelope';
    if (message.includes('HTTP ')) return 'http-status';

    return `${adapter || 'unknown'}-delivery`.slice(0, 80);
}

/**
 * @summary The adapters whose transport receives — and therefore honours — the attempt-bound
 * `AbortSignal`. For these, aborting genuinely cancels the in-flight request, so a timeout IS
 * evidence the digest did not reach the seat and the retry path is correct.
 *
 * Membership must mirror {@link deliverDigest}'s dispatch: an adapter belongs here if and only if
 * its branch there threads `abortSignal` into the call. Adding a signal-capable branch without
 * adding it here understates verifiability (a real failure is treated as unknown — safe but
 * lossy); adding it here without threading the signal overstates it and re-opens the
 * duplicate-delivery defect this set exists to close.
 * @type {Readonly<Set<String>>}
 */
const SIGNAL_HONOURING_ADAPTERS = Object.freeze(new Set([
    OPENCODE_SERVER_ADAPTER,
    KIMI_SERVER_ADAPTER,
    'test-hang-abortable'
]));

/**
 * @summary Whether a timed-out attempt against this subscription's route carries information.
 * `webhookUrl` routes abort their `fetch`; {@link SIGNAL_HONOURING_ADAPTERS} abort theirs. Every
 * other route — `osascript`, `tmux`, `codex-app-server`, `kimi-pull-bridge` — is a spawn or an
 * un-signalled call that keeps running after the bound elapses, so its timeout says only that we
 * stopped waiting.
 * @param {Object} subscription WAKE_SUBSCRIPTION node.
 * @returns {Boolean} `true` when a timeout proves non-delivery.
 * @private
 */
function isTimeoutVerifiable(subscription) {
    const meta           = subscription.properties?.harnessTargetMetadata || {};
    const {addressType}  = resolveInstanceAddress(meta);
    const defaultAdapter = process.platform === 'darwin' ? 'osascript' : 'tmux';

    return addressType === 'webhookUrl' || SIGNAL_HONOURING_ADAPTERS.has(meta.adapter || defaultAdapter);
}

/**
 * @summary Races one adapter attempt against the `wakeDispatch.attemptTimeoutSeconds` bound —
 * every delivery call site goes through here, so a hung transport can hold the per-subscription
 * delivery owner (and therefore the flush queue behind it) at most one bound before resolving.
 * Without it, an unresponsive adapter starves the queue behind the in-flight reservation
 * indefinitely and defeats the hard cap's latency guarantee.
 *
 * **A timeout resolves to `failed` only where the abort is real** ({@link isTimeoutVerifiable}).
 * Everywhere else it resolves `unknown`: `AbortController` cannot stop a spawn, so the attempt may
 * have already landed in the seat and its outcome is unobservable from here. Feeding that case to
 * the retry path re-delivered digests the seat had already received — the observed duplicate-wake
 * defect. The prior JSDoc asserted the refractory bounded that risk; it did not, and it
 * also undercounted the affected routes as osascript/tmux when `codex-app-server` and
 * `kimi-pull-bridge` pass no signal either.
 *
 * `unknown` is deliberately NOT re-attempted and NOT counted as a loss. A wake digest is derived
 * from current unread state rather than from a queued payload, so the next natural flush re-includes
 * anything still unread and omits whatever the orphan actually delivered — the self-healing path is
 * strictly safer than a blind re-offer. A late-completing orphan still holds the GLOBAL adapter
 * mutex until it settles, so focus-collision safety is unchanged; only the per-subscription owner
 * is released.
 * @param {Object} subscription WAKE_SUBSCRIPTION node.
 * @param {String} digest Wake digest body.
 * @param {Object} [deliveryEvidence={}] Scenario/count evidence for Codex validation logs.
 * @returns {Promise<('delivered'|'skipped'|'failed'|'unknown')>}
 */
async function deliverDigestBounded(subscription, digest, deliveryEvidence = {}) {
    const timeoutMs  = AiConfig.orchestrator.wakeDispatch.attemptTimeoutSeconds * 1000;
    const controller = new AbortController();
    let   timer;

    const timeout = new Promise(resolve => {
        timer = setTimeout(() => {
            controller.abort();

            // Classified INSIDE the timeout, never on the hot path: the common case never elapses
            // the bound, and resolving the route eagerly ran address resolution on every delivery —
            // observable co-scheduled (the kimi-pull-bridge outbox-escape spec went red only in a
            // full-suite run, green in isolation).
            if (isTimeoutVerifiable(subscription)) {
                lastDeliveryFailureClassBySub.set(subscription.id, 'attempt-timeout');
                writeLog('ERROR',
                    `[Wake Daemon] Delivery attempt for ${subscription.id} exceeded ${timeoutMs}ms — ` +
                    'resolved as failed (retry path); the abort cancelled the in-flight request.'
                );
                resolve('failed');
            } else {
                writeLog('WARN',
                    `[Wake Daemon] Delivery attempt for ${subscription.id} exceeded ${timeoutMs}ms on an ` +
                    'un-abortable transport — outcome UNKNOWN, not retried: the attempt may already have ' +
                    'reached the seat. Still-unread events re-enter the next flush.'
                );
                resolve('unknown');
            }
        }, timeoutMs);
    });

    try {
        return await Promise.race([
            deliverDigest(subscription, digest, deliveryEvidence, controller.signal),
            timeout
        ]);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * @summary Delivers the digest to the configured harness adapter.
 * @param {Object} subscription WAKE_SUBSCRIPTION node.
 * @param {String} digest Wake digest body.
 * @param {Object} [deliveryEvidence={}] Scenario/count evidence for Codex validation logs.
 * @param {AbortSignal|null} [abortSignal=null] Attempt-bound signal from
 *     {@link deliverDigestBounded}, threaded into signal-capable transports (the webhook fetch).
 * @returns {Promise<('delivered'|'skipped'|'failed')>} The explicit adapter outcome:
 *     `delivered` = the adapter accepted the digest (a wake reached a seat — the ONLY outcome
 *     that arms the refractory and counts on the dispatch surface); `skipped` = a fail-closed
 *     refusal (stale presence, missing/unknown adapter metadata, unresolvable instance — the
 *     branch-local log carries why; never counts, never arms); `failed` = the dispatch THREW
 *     against a live target (the retry path's input).
 */
async function deliverDigest(subscription, digest, deliveryEvidence = {}, abortSignal = null) {
    const meta                           = subscription.properties?.harnessTargetMetadata || {};
    const {instanceAddress, addressType} = resolveInstanceAddress(meta);
    // Fall back to osascript on macOS by default, tmux otherwise
    const defaultAdapter  = process.platform === 'darwin' ? 'osascript' : 'tmux';
    const adapter         = meta.adapter || defaultAdapter;
    const adapterSource   = meta.adapter ? 'metadata' : 'platform-default';
    const wakeSubmitNonce = isCodexSubmitProofAdapter({adapter, appName: meta.appName}) ? crypto.randomUUID() : null;
    const dispatchDigest  = wakeSubmitNonce ? appendCodexWakeSubmitNonce(digest, wakeSubmitNonce) : digest;
    const proofEvidence   = wakeSubmitNonce ? {...deliveryEvidence, wakeSubmitNonce} : deliveryEvidence;
    const evidenceLabel   = formatWakeDeliveryEvidence(proofEvidence, {adapter, adapterSource, appName: meta.appName});

    // Serialize execution to prevent focus collisions (Electron-Paradox defense)
    deliveryPromise = deliveryPromise.then(async () => {

    try {
        // `userDataDir` is exempt from the freshness veto: the dispatch below resolves it through
        // `getInstancePid({userDataDir})`, which fails closed when no live process maps to the
        // address — a live liveness proof, unlike the volatile presence overlay (written once at
        // bootstrap, so the veto would otherwise drop every userDataDir wake ~5 min after boot).
        // Address types without an equivalent live oracle (`pid`, `tmuxSession`, `webhookUrl`) keep
        // the freshness gate.
        if (addressType && addressType !== 'userDataDir' && instanceAddress &&
            !assertFreshTargetPresence(subscription, {addressType})
        ) {
            return 'skipped';
        }

        if (addressType === 'webhookUrl') {
            await deliverViaWebhookUrl(subscription, dispatchDigest, instanceAddress, abortSignal);
            return 'delivered';
        }

        if (adapter === CODEX_APP_SERVER_ADAPTER) {
            await deliverViaCodexAppServer(subscription, dispatchDigest, evidenceLabel);
            return 'delivered';
        }

        if (adapter === OPENCODE_SERVER_ADAPTER) {
            await deliverViaOpencodeServer(subscription, dispatchDigest, evidenceLabel, abortSignal);
            return 'delivered';
        }

        if (adapter === KIMI_SERVER_ADAPTER) {
            await deliverViaKimiServer(subscription, dispatchDigest, evidenceLabel, abortSignal);
            return 'delivered';
        }

        if (adapter === KIMI_PULL_BRIDGE_ADAPTER) {
            await deliverViaKimiPullBridge(subscription, dispatchDigest, evidenceLabel);
            return 'delivered';
        }

        if (adapter === 'tmux') {
            const tmuxSession = addressType === 'tmuxSession' && instanceAddress
                ? instanceAddress
                : meta.tmuxSession || process.env.TMUX_SESSION || 'neo-agent';
            await spawnAsync('tmux', ['send-keys', '-t', tmuxSession, dispatchDigest, 'C-m']);
            writeLog('INFO', `[Wake Daemon] Delivered ${subscription.id} via tmux to session ${tmuxSession}${evidenceLabel}`);
        } else if (adapter === 'osascript') {
            const appName = meta.appName;
            if (!appName) {
                writeLog('ERROR',
                    `[Wake Daemon] Cannot deliver subscription ${subscription.id}: ` +
                    `harnessTargetMetadata.appName is missing/empty. ` +
                    `Skipping delivery to avoid misrouting. ` +
                    `Verify subscription template via 'manage_wake_subscription({action: \\'list\\'})' ` +
                    `or fix the AgentIdentity subscriptionTemplate.${evidenceLabel}`
                );
                return 'skipped';
            }
            const metadataWithDefaults = applyHarnessMetadataDefaults(meta);
            let   tabShortcut          = metadataWithDefaults.tabShortcut;
            let   focusSeedKey         = metadataWithDefaults.focusSeedKey;
            let   focusSeedSequence    = metadataWithDefaults.focusSeedSequence;

            // Codex Desktop fail-closed guard. The wake daemon must not drive the destructive
            // Cmd+A/Cmd+X clear path unless subscription metadata provides a verified,
            // non-mutating composer-focus primitive. Printable-key focus probes can mutate
            // drafts, so multi-step probe/undo strategies must use an explicit
            // `focusSeedSequence` implementation rather than masquerading as a single-key
            // `focusSeedKey` opt-in. The app-server adapter may eventually supersede the
            // UI-keystroke path entirely.
            if (appName === 'Codex' && !focusSeedKey) {
                writeLog('WARN',
                    `[Wake Daemon] Codex UI wake delivery refused for ${subscription.id}: ` +
                    `no validated composer-focus primitive (per #10664). ` +
                    `Subscription must opt in via meta.focusSeedKey with a verified primitive, ` +
                    `or use a submit-proven Codex app-server route.`
                );
                return 'skipped';
            }

            // Instance-addressable wake — LOCAL deployment only. When the subscription carries an
            // addressType, route through that address instead of falling back to ambiguous
            // app-activate/frontmost guessing. Fail closed (skip the wake) if the instance cannot
            // be located, so a targeted wake never lands in the wrong one.
            //
            // Instance addressing is a local-only primitive: this daemon delivers desktop-harness
            // wakes via osascript/tmux, which a headless cloud deployment has no GUI harness to
            // receive, so the daemon does not run under cloud at all. The deploymentMode === 'cloud'
            // branch below is therefore DEFENSE-IN-DEPTH, not a live path: if the gate is ever
            // evaluated under a cloud deploymentMode, REFUSE (fail closed) rather than fall through to
            // app-activate — a targeted wake must never silently degrade to an untargeted one. Uses
            // the canonical AiConfig.orchestrator.deploymentMode signal.
            let instancePid = null;
            if (addressType === 'pid' || addressType === 'userDataDir') {
                try {
                    instancePid = await resolveGuiInstancePid({
                        instanceAddress,
                        addressType,
                        deploymentMode: AiConfig.orchestrator.deploymentMode,
                        target        : 'wake daemon',
                        appName
                    });
                } catch (err) {
                    writeLog('ERROR',
                        `[Wake Daemon] Instance wake refused for ${subscription.id}: ${err.message}`
                    );
                    return 'skipped';
                }
            } else if (AiConfig.orchestrator.deploymentMode === 'local') {
                // No userDataDir = the DEFAULT instance, started as the normal macOS app (which can
                // never carry --user-data-dir without breaking its system app / menu-bar integration).
                // When a same-bundle sibling instance is running, "activate + frontmost" is ambiguous;
                // the default is uniquely identifiable by the ABSENCE of the flag, so target its pid
                // directly. A proven arg-less singleton or no matching process keeps the legacy
                // activate path; addressed-only, ambiguous, and probe-failed states fail closed
                // instead of guessing which window should receive destructive composer keystrokes.
                const defaultTarget = await getDefaultInstanceTarget({appName});

                if (defaultTarget.status === 'ambiguous' || defaultTarget.status === 'probe-failed') {
                    writeLog('ERROR',
                        `[Wake Daemon] Default-instance wake refused for ${subscription.id}: ` +
                        `process resolution status=${defaultTarget.status}; found ${defaultTarget.instanceCount} ` +
                        `${defaultTarget.bundleName}.app main processes without exactly one arg-less default. ` +
                        'Failing closed to avoid wrong-resident delivery.'
                    );
                    return 'skipped';
                }

                instancePid = defaultTarget.pid;
            }

            // [Anchor & Echo] The Electron-Paradox Defense:
            // Electron-based IDEs (Antigravity, VS Code) register their bundle names differently
            // than their underlying macOS process names (often just "Electron" to System Events).
            // Using \`tell process "\${appName}"\` will fail with exit code 1 because the process
            // name does not match the app name.
            // Fix: We activate the app via its bundle name, then dynamically ask System Events for
            // the \`first application process whose frontmost is true\`.
            //
            // [Anchor & Echo] The Key Code 36 (Enter) Defense:
            // Actionable wakes specifically use \`key code 36\` (Enter) to submit the payload after
            // pasting. This is load-bearing for Claude Desktop with Tab 3 (Claude Code) and Google
            // Antigravity. Pure-heartbeat digests for prompt-submitting adapters are filtered
            // before coalescing because a scheduler nudge must not submit into an interactive
            // composer.
            // Instance-addressed wake raises the resolved pid's process to frontmost (verified
            // addressable via System Events `whose unix id`); single-instance wakes keep the
            // app-activate path unchanged.
            const appleScriptAppName = escapeAppleScriptString(appName),
                  targetProcessId    = instancePid ? String(instancePid) : '';

            // Foreground strategy: `activate` is the robust bundle-level foregrounding — it works from
            // the headless daemon AND reclaims focus from a same-bundle sibling that holds the front.
            // For a multi-instance harness we then set frontmost on the resolved instance pid to
            // disambiguate. `set frontmost of unix id` ALONE loses to a frontmost same-bundle sibling:
            // the daemon cannot switch between same-bundle instances without first foregrounding the
            // bundle via `activate`. `AXRaise` was empirically rejected (it de-raises the target).
            const appActivateLine       = `  tell application "${appleScriptAppName}" to activate`,
                  instanceFrontmostLine = instancePid
                      ? `  tell application "System Events" to set frontmost of (first process whose unix id is ${instancePid}) to true`
                      : null;

            const osascriptArgs = [
                '-e', 'on assertTargetFrontmost(appName, targetBundleId, targetProcessId, phase)',
                '-e', '  tell application "System Events"',
                '-e', '    set frontmostProcess to first application process whose frontmost is true',
                '-e', '    if targetProcessId is not "" then',
                '-e', '      set currentPid to (unix id of frontmostProcess) as string',
                '-e', '      if currentPid is not targetProcessId then',
                '-e', '        set currentBundleId to ""',
                '-e', '        try',
                '-e', '          set currentBundleId to (bundle identifier of frontmostProcess) as string',
                '-e', '        end try',
                '-e', '        if currentBundleId is not targetBundleId then error "Target app lost frontmost status " & phase & " (pid " & currentPid & " != " & targetProcessId & ", bundle " & currentBundleId & " != " & targetBundleId & ")"',
                '-e', '      end if',
                '-e', '    else if targetBundleId is not "" then',
                '-e', '      set currentBundleId to ""',
                '-e', '      try',
                '-e', '        set currentBundleId to (bundle identifier of frontmostProcess) as string',
                '-e', '      end try',
                '-e', '      if currentBundleId is not targetBundleId then error "Target app lost frontmost status " & phase & " (bundle " & currentBundleId & " != " & targetBundleId & ")"',
                '-e', '    else',
                '-e', '      set currentApp to name of frontmostProcess',
                '-e', '      if currentApp is not appName then error "Target app lost frontmost status " & phase & " (" & currentApp & " != " & appName & ")"',
                '-e', '    end if',
                '-e', '  end tell',
                '-e', 'end assertTargetFrontmost',
                '-e', 'on run argv',
                '-e', '  set wakePayload to (item 1 of argv)',
                '-e', `  set targetAppName to "${appleScriptAppName}"`,
                '-e', '  set targetBundleId to ""',
                '-e', '  try',
                '-e', `    set targetBundleId to id of application "${appleScriptAppName}"`,
                '-e', '  end try',
                '-e', `  set targetProcessId to "${targetProcessId}"`,
                '-e', '  try',
                '-e', '    set savedClipboard to the clipboard as string',
                '-e', '  on error',
                '-e', '    set savedClipboard to ""',
                '-e', '  end try',
                '-e', '  try',
                '-e', '  set targetRaised to false',
                '-e', '  repeat 12 times',
                '-e', appActivateLine,
                ...(instanceFrontmostLine ? ['-e', instanceFrontmostLine] : []),
                '-e', '    delay 0.25',
                '-e', '    try',
                '-e', '      my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "after activation")',
                '-e', '      set targetRaised to true',
                '-e', '      exit repeat',
                '-e', '    end try',
                '-e', '  end repeat',
                '-e', '  if not targetRaised then my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "after activation")',
                '-e', '  tell application "System Events"',
                '-e', '    set frontmostProcess to first application process whose frontmost is true',
                '-e', '    tell frontmostProcess'
            ];

            if (tabShortcut) {
                if (tabShortcut.includes('shift+')) {
                    const key = tabShortcut.replace('shift+', '');
                    osascriptArgs.push('-e', `      keystroke "${key}" using {command down, shift down}`);
                } else {
                    osascriptArgs.push('-e', `      keystroke "${tabShortcut}" using command down`);
                }
                osascriptArgs.push('-e', '      delay 0.5');
            }

            if (focusSeedSequence === 'r-undo') {
                osascriptArgs.push('-e', '      keystroke "r"');
                osascriptArgs.push('-e', '      delay 0.2');
                osascriptArgs.push('-e', '      keystroke "z" using command down');
                osascriptArgs.push('-e', '      delay 0.2');
            } else if (focusSeedKey) {
                if (focusSeedKey === 'space' || focusSeedKey === ' ') {
                    osascriptArgs.push('-e', '      key code 49');
                } else {
                    osascriptArgs.push('-e', `      keystroke "${focusSeedKey}"`);
                }
                osascriptArgs.push('-e', '      delay 0.2');

                // Cleanup: revert Codex's mutating seed character so it does not corrupt
                // the user's draft. Non-mutating seeds in other harnesses must not inherit
                // this undo step without validation.
                if (appName === 'Codex' && focusSeedKey === 'r') {
                    osascriptArgs.push('-e', '      keystroke "z" using command down');
                    osascriptArgs.push('-e', '      delay 0.2');
                }
            }

            osascriptArgs.push(
                '-e', '      my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "before prompt clear")',
                '-e', '      set the clipboard to ""',
                '-e', '      keystroke "a" using command down',
                '-e', '      delay 0.2',
                '-e', '      keystroke "x" using command down',
                '-e', '      delay 0.2',
                '-e', '    end tell',
                '-e', '  end tell',
                '-e', '  try',
                '-e', '    set userInput to the clipboard as string',
                '-e', '  on error',
                '-e', '    set userInput to ""',
                '-e', '  end try',
                '-e', '  my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "before wake clipboard set")',
                '-e', '  set the clipboard to wakePayload',
                '-e', '  delay 0.2',
                '-e', '  my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "before wake paste")',
                '-e', '  tell application "System Events"',
                '-e', '    set frontmostProcess to first application process whose frontmost is true',
                '-e', '    tell frontmostProcess',
                '-e', '      keystroke "v" using command down',
                '-e', '      delay 0.5',
                // Codex Desktop can leave composer-side UI (mention/autocomplete/completion popovers)
                // active after a pasted A2A digest such as `from @neo-opus-ada)`. Escape closes that
                // transient UI so the following Enter submits the prompt instead of being consumed
                // by the composer. The longer post-Escape settle is Codex-scoped: operator
                // samples show human-delayed Enter succeeds after the scripted Enter is
                // intermittently consumed, so do not shorten this back to the generic key delay.
                ...(appName === 'Codex' ? [
                    '-e', '      key code 53',
                    '-e', '      delay 0.45'
                ] : []),
                '-e', '      key code 36',
                '-e', '      delay 1.0',
                '-e', '    end tell',
                '-e', '  end tell',
                '-e', '  if userInput is not "" then',
                '-e', '    my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "before user input restore clipboard set")',
                '-e', '    set the clipboard to userInput',
                '-e', '    delay 0.2',
                '-e', '    my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "before user input restore paste")',
                '-e', '    tell application "System Events"',
                '-e', '      set frontmostProcess to first application process whose frontmost is true',
                '-e', '      tell frontmostProcess',
                '-e', '        keystroke "v" using command down',
                '-e', '      end tell',
                '-e', '    end tell',
                '-e', '  end if',
                '-e', '  delay 0.5',
                '-e', '  set the clipboard to savedClipboard',
                '-e', '  on error errMsg',
                '-e', '    set the clipboard to savedClipboard',
                '-e', '    error errMsg',
                '-e', '  end try',
                '-e', 'end run',
                dispatchDigest
            );

            const submitAttemptedAt = new Date();
            await deliverViaOsascriptWithRetry(osascriptArgs, subscription.id, appName, evidenceLabel);
            if (appName === 'Codex') {
                scheduleCodexTurnStartProof(subscription, submitAttemptedAt, proofEvidence);
            }
        } else if (adapter === 'test') {
            writeLog('INFO', `[Wake Daemon Test Adapter] Delivered ${subscription.id}: ${dispatchDigest}`);
        } else if (adapter === 'test-codex-submit') {
            const submitAttemptedAt = new Date();
            writeLog('INFO', `[Wake Daemon] Submit attempted ${subscription.id} via test-codex-submit to Codex${evidenceLabel}`);
            scheduleCodexTurnStartProof(subscription, submitAttemptedAt, proofEvidence);
        } else if (adapter === 'test-fail') {
            // Deterministic delivery-failure hook for retry-path testing (no live target needed).
            // Log the attempted digest first so the coalesced retry content is observable, then throw.
            writeLog('INFO', `[Wake Daemon Test-Fail Adapter] Attempted ${subscription.id}: ${dispatchDigest}`);
            throw new Error('test-fail adapter: simulated delivery failure');
        } else if (adapter === 'test-hang') {
            // Deterministic LATE-COMPLETING attempt: stands in for a spawn that outlives the bound
            // and then succeeds anyway — the real orphan, which finishes typing into the seat after
            // the daemon stopped waiting. It ignores `abortSignal` (a spawn cannot be cancelled),
            // which is the property under test.
            //
            // It must SETTLE, not hang forever: an attempt that never returns keeps the GLOBAL
            // adapter mutex and no retry can follow, so a never-settling fixture cannot exhibit the
            // duplicate at all — it would test a permanent wedge instead of a late delivery.
            writeLog('INFO', `[Wake Daemon Test-Hang Adapter] Attempted ${subscription.id}: ${dispatchDigest}`);
            await new Promise(resolve => setTimeout(resolve, Number(process.env.WAKE_TEST_HANG_MS) || 3000));
        } else if (adapter === 'test-hang-abortable') {
            // The signal-honouring counterpart: hangs until the bound aborts, then rejects like a
            // cancelled fetch. Proves the retry path is preserved where the abort is real, so the
            // unknown-outcome branch cannot silently swallow genuine failures.
            writeLog('INFO', `[Wake Daemon Test-Hang-Abortable Adapter] Attempted ${subscription.id}: ${dispatchDigest}`);
            await new Promise((resolve, reject) => {
                abortSignal?.addEventListener(
                    'abort',
                    () => reject(new Error('test-hang-abortable adapter: aborted by attempt bound')),
                    {once: true}
                );
            });
        } else {
            // Pre-outcome-enum, this branch FELL THROUGH to the delivered return — an unknown
            // adapter counted as a successful dispatch. It is a refusal: nothing reached a seat.
            writeLog('ERROR', `[Wake Daemon] Unknown adapter '${adapter}' for subscription ${subscription.id}`);
            return 'skipped';
        }
        return 'delivered';
    } catch (err) {
        lastDeliveryFailureClassBySub.set(subscription.id, classifyDeliveryFailure(err, adapter));
        writeLog('ERROR', `[Wake Daemon] Failed to deliver via ${adapter}: ${err.message}`);
        return 'failed';
    }
    });

    return deliveryPromise;
}

/**
 * @summary Queues a failed wake for a bounded retry, keyed by subscription id and holding the wake
 * EVENTS (not a pre-built digest). A second failure for the same subscription COALESCES — its events
 * merge into the pending entry (the watermark advanced between flushes, so the sets are disjoint →
 * concat, no loss) and the digest is rebuilt over the union at retry time. The running attempt count
 * is preserved so the target's consecutive-failure cap still applies.
 * @param {Object} subscription WAKE_SUBSCRIPTION node.
 * @param {String} identity Recipient agent identity (for the rebuilt digest).
 * @param {Object} events `{messages, tasks, permissions, heartbeats}` arrays from the failed flush.
 * @returns {void}
 */
function enqueueDeliveryRetry(subscription, identity, events) {
    if (!isWakeTargetEligible(identity)) return;

    const subId    = subscription.id,
          existing = pendingDeliveryRetries.get(subId);

    if (existing) {
        existing.events = {
            messages   : [...existing.events.messages,    ...events.messages],
            tasks      : [...existing.events.tasks,       ...events.tasks],
            permissions: [...existing.events.permissions, ...events.permissions],
            heartbeats : [...existing.events.heartbeats,  ...events.heartbeats]
        };
        return;
    }

    pendingDeliveryRetries.set(subId, {
        subscription,
        identity,
        events,
        attempts     : 0,
        nextAttemptAt: Date.now() + POLL_INTERVAL_MS
    });
}

/**
 * @summary Re-attempts due wake-delivery retries; called once per poll cycle. A success clears the
 * entry; a repeat failure increments the attempt count with linear backoff; exceeding
 * `MAX_DELIVERY_RETRIES` drops the entry with a terminal ERROR so a persistently-unreachable target
 * cannot storm or wedge the loop.
 * @returns {Promise<void>}
 */
async function attemptDeliveryRetries() {
    if (pendingDeliveryRetries.size === 0) return;

    const now = Date.now();

    for (const [subId, entry] of pendingDeliveryRetries) {
        if (entry.nextAttemptAt > now) continue;
        if (!isWakeTargetEligible(entry.subscription.properties?.agentIdentity || entry.identity)) {
            pendingDeliveryRetries.delete(subId);
            continue;
        }

        // Snapshot-and-swap: THIS attempt delivers the snapshot while the map entry stays live
        // with an empty event set — a direct flush that finds this sub pending merges into
        // `entry.events` (the union path), and because the attempt only ever clears what it
        // took, events merged DURING the adapter await survive the outcome instead of being
        // deleted unseen (the after-await race).
        const snapshot = entry.events;
        entry.events   = {messages: [], tasks: [], permissions: [], heartbeats: []};

        // Re-apply BOTH delivery-time eligibility axes used by the initial digest: a message read
        // between attempts must not re-deliver, and a message that crosses the canonical age horizon
        // while queued must not regain urgency through retry. The watermark is deliberately NOT
        // re-applied — it advanced past these events on the first attempt, and retry exists to deliver
        // the still-eligible below-watermark snapshot.
        const attemptNow       = Date.now(),
              unreadMessages   = snapshot.messages.filter(ev => !isMessageReadFor(db, ev.messageId, entry.identity)),
              messageFreshness = partitionMessageWakesByFreshness(unreadMessages, attemptNow),
              liveMessages     = messageFreshness.eligible;

        logSuppressedMessageWakes({
            identity   : entry.identity,
            subId,
            phase      : 'retry',
            suppressed : messageFreshness.suppressed,
            oldestAgeMs: messageFreshness.oldestAgeMs
        });

        if (liveMessages.length === 0 && snapshot.tasks.length === 0 &&
            snapshot.permissions.length === 0 && snapshot.heartbeats.length === 0
        ) {
            // The swap above is synchronous, so the live entry cannot have gained events yet —
            // the entry retires whole.
            pendingDeliveryRetries.delete(subId);
            const dropReason = unreadMessages.length === 0
                ? 'all queued messages were read before re-delivery'
                : 'all queued messages became stale or invalid before re-delivery';
            writeLog('INFO', `[Wake Daemon] Retry for ${subId} dropped: ${dropReason}.`);
            continue;
        }

        const retryEvents      = {...snapshot, messages: liveMessages};
        const deliveryEvidence = buildWakeDeliveryEvidence(retryEvents);
        const digest           = buildWakeDigest(entry.identity, retryEvents);

        deliveryInFlight.add(subId);
        let outcome;
        try {
            outcome = await deliverDigestBounded(entry.subscription, digest, deliveryEvidence);
        } finally {
            deliveryInFlight.delete(subId);
        }

        const mergedDuringAwait =
            entry.events.messages.length + entry.events.tasks.length +
            entry.events.permissions.length + entry.events.heartbeats.length > 0;

        if (outcome === 'failed') {
            // Restore the undelivered snapshot INTO the live entry — union with anything merged
            // during the await (the sets are disjoint by watermark, so concat is loss-free).
            entry.events = {
                messages   : [...liveMessages,         ...entry.events.messages],
                tasks      : [...snapshot.tasks,       ...entry.events.tasks],
                permissions: [...snapshot.permissions, ...entry.events.permissions],
                heartbeats : [...snapshot.heartbeats,  ...entry.events.heartbeats]
            };
            entry.attempts += 1;
            if (entry.attempts >= MAX_DELIVERY_RETRIES) {
                pendingDeliveryRetries.delete(subId);
                recordTerminalDeliveryFailure(
                    entry.subscription,
                    entry.identity,
                    lastDeliveryFailureClassBySub.get(subId) || 'delivery-failed'
                );
                lastDeliveryFailureClassBySub.delete(subId);
                writeLog('ERROR',
                    `[Wake Daemon] Giving up wake delivery for ${subId} after ${entry.attempts} failed attempts; wake dropped.`
                );
            } else {
                entry.nextAttemptAt = now + POLL_INTERVAL_MS * entry.attempts;
            }
        } else if (outcome === 'delivered') {
            // The snapshot reached the seat: a confirmed delivery arms the refractory and counts
            // on the SAME dispatch surface as the direct path. Events merged during the await
            // stay pending as a fresh cycle (new events, new attempt budget); an unchanged entry
            // retires.
            lastFlushAtBySub[subId] = Date.now();
            clearTerminalDeliveryFailure(subId);
            lastDeliveryFailureClassBySub.delete(subId);
            writeLog('INFO',
                `[Wake Dispatch] ${entry.identity || subId}: outcome=delivered priority=${getHighestWakePriority(liveMessages)} ` +
                `messages=${liveMessages.length} tasks=${snapshot.tasks.length} permissions=${snapshot.permissions.length} ` +
                `heartbeats=${snapshot.heartbeats.length} via=retry attempt=${entry.attempts + 1}`
            );
            if (mergedDuringAwait) {
                entry.attempts      = 0;
                entry.nextAttemptAt = now + POLL_INTERVAL_MS;
            } else {
                pendingDeliveryRetries.delete(subId);
            }
        } else if (outcome === 'unknown') {
            // The bound elapsed on an un-abortable transport: the snapshot may already be in the
            // seat, and nothing here can tell. Restore it (a loss is worse than a late re-offer),
            // arm the refractory (it may have landed), and — critically — do NOT increment
            // `attempts`. An unknown outcome is not a failure, so counting it would march the entry
            // toward the terminal "wake dropped" line below, which asserts a loss that was never
            // observed. Back off harder than a known failure: if the orphan did land, the seat
            // reads those messages and they leave `liveMessages` on their own before we try again.
            entry.events = {
                messages   : [...liveMessages,         ...entry.events.messages],
                tasks      : [...snapshot.tasks,       ...entry.events.tasks],
                permissions: [...snapshot.permissions, ...entry.events.permissions],
                heartbeats : [...snapshot.heartbeats,  ...entry.events.heartbeats]
            };
            lastFlushAtBySub[subId] = Date.now();
            entry.nextAttemptAt     = now + POLL_INTERVAL_MS * (entry.attempts + 2);
            writeLog('WARN',
                `[Wake Daemon] Retry for ${subId} returned UNKNOWN (un-abortable transport timed out); ` +
                'events retained, attempt NOT counted, next offer deferred — the attempt may already have landed.'
            );
        } else {
            // 'skipped': the route refused fail-closed (stale presence, bad metadata) — the
            // refusal's branch-local log carries why, nothing counts, no refractory. Events
            // merged during the await keep their fresh cycle rather than being silently lost.
            if (mergedDuringAwait) {
                entry.attempts      = 0;
                entry.nextAttemptAt = now + POLL_INTERVAL_MS;
            } else {
                pendingDeliveryRetries.delete(subId);
            }
            writeLog('INFO',
                `[Wake Daemon] Retry for ${subId} skipped by the adapter route (fail-closed refusal); ` +
                (mergedDuringAwait ? 'events merged mid-attempt stay pending.' : 'entry retired.')
            );
        }
    }
}

/**
 * @summary Resolves generic instance-address metadata with legacy field compatibility.
 * @param {Object} meta Subscription harnessTargetMetadata.
 * @returns {{instanceAddress: (String|null), addressType: (String|null)}}
 */
function resolveInstanceAddress(meta = {}) {
    const addressType = meta.addressType
        || (meta.userDataDir ? 'userDataDir' : null);

    const instanceAddress = meta.instanceAddress
        || (addressType === 'userDataDir' ? meta.userDataDir : null);

    return {
        instanceAddress: instanceAddress || null,
        addressType    : addressType || null
    };
}

/**
 * @summary Requires fresh HarnessPresence before immediate address-specific dispatch. Applied to
 * `pid` / `tmuxSession` / `webhookUrl`; NOT applied to `userDataDir`, whose `getInstancePid`
 * resolution at dispatch is a stronger, live liveness proof (the caller exempts it).
 * @param {Object} subscription WAKE_SUBSCRIPTION node.
 * @param {Object} address Resolved address tuple.
 * @returns {Boolean}
 */
function assertFreshTargetPresence(subscription, {addressType}) {
    const presence = getActiveHarnessPresence(db, {
        subscriptionId: subscription.id,
        agentIdentity : subscription.properties?.agentIdentity
    });

    if (isHarnessPresenceFresh(presence)) return true;

    writeLog('WARN',
        `[Wake Daemon] Targeted wake refused for ${subscription.id}: ` +
        `addressType='${addressType}' requires fresh HarnessPresence. ` +
        `Failing closed; recipient will pick up the unread event on next turn.`
    );
    return false;
}

/**
 * @summary Posts a wake digest to a wake-dispatchable webhook address.
 * @param {Object} subscription WAKE_SUBSCRIPTION node.
 * @param {String} digest Wake digest body.
 * @param {String} webhookUrl Target webhook URL.
 * @returns {Promise<void>}
 */
async function deliverViaWebhookUrl(subscription, digest, webhookUrl, abortSignal = null) {
    let url;
    try {
        url = new URL(webhookUrl);
    } catch (error) {
        writeLog('ERROR',
            `[Wake Daemon] Webhook wake refused for ${subscription.id}: ` +
            `invalid webhookUrl instanceAddress. Failing closed.`
        );
        return;
    }

    const response = await fetch(url, {
        method : 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            subscriptionId: subscription.id,
            digest
        }),
        // The attempt-bound signal: a hung POST aborts when the delivery owner's timeout fires,
        // so no orphaned request outlives the timed-out attempt on this transport.
        ...(abortSignal ? {signal: abortSignal} : {})
    });

    if (!response.ok) {
        throw new Error(`webhookUrl POST failed with HTTP ${response.status}`);
    }

    writeLog('INFO', `[Wake Daemon] Delivered ${subscription.id} via webhookUrl POST`);
}

/**
 * @summary Assigns the config-derived module-scope paths (DB_PATH / DAEMON_DATA_DIR / STATE_FILE /
 * LOG_FILE / WOKEN_WATERMARK_FILE / DELIVERY_FAILURE_STATE_FILE / PID_FILE) + runs their one-shot
 * startup side-effects (data-dir ensure, archived-log prune, durable-state loads). Deferred out of module-load so the
 * assertConfigFresh guard in main() can fail-fast on a stale memory-core overlay BEFORE any
 * `memoryCoreConfig` deref crashes with a cryptic `undefined` (the stale-overlay fail-fast class).
 * @protected
 */
function initConfigDerivedState() {
    DB_PATH              = memoryCoreConfig.storagePaths.graph;
    DAEMON_DATA_DIR      = memoryCoreConfig.wakeDaemon.dataDir;
    STATE_FILE           = path.join(DAEMON_DATA_DIR, 'lastSyncId');
    LOG_FILE             = path.join(DAEMON_DATA_DIR, 'wake-daemon.log');
    WOKEN_WATERMARK_FILE = path.join(DAEMON_DATA_DIR, 'woken-watermark.json');
    DELIVERY_FAILURE_STATE_FILE = path.join(DAEMON_DATA_DIR, 'wake-delivery-failures.json');
    PID_FILE             = path.join(DAEMON_DATA_DIR, 'wake-daemon.pid');

    fs.ensureDirSync(DAEMON_DATA_DIR);     // data dir must exist before any state-file write
    pruneOldLogs();                        // one-shot reaper for archived logs older than retention
    const wokenState = loadWokenState();
    wokenWatermark            = wokenState.watermarks;
    wokenMessageIdsByIdentity = wokenState.messageIdsByIdentity;
    terminalDeliveryFailures  = loadTerminalDeliveryFailures();
}

// Start loop
async function main() {
    // Fail-fast on a stale memory-core config overlay with the actionable --migrate-config message,
    // BEFORE initConfigDerivedState() derefs memoryCoreConfig.
    const {findings} = memoryCoreConfig.validateRequiredEnv({entrypoint: 'wake-daemon'});
    await assertConfigFresh({
        requiredFindings: findings,
        serverPath      : fileURLToPath(new URL('../../mcp/server/memory-core/', import.meta.url))
    });

    initConfigDerivedState();

    await enforceSingleton();

    db = initializeDatabase(DB_PATH);
    pruneTerminalDeliveryFailures(getActiveShapeCSubscriptions(db));

    // Read lastSyncId
    lastSyncId = getLastSyncId(db, STATE_FILE);

    writeLog('INFO', `[Wake Daemon] Started. Tail-syncing from GraphLog ID: ${lastSyncId}`);

    pollLoop();
}

// Process-entry only: run the boot guard + start the daemon ONLY when this file is the main module,
// never on import — preserves the process-entry isolation invariant (mirrors the kb-* daemons). On a
// stale overlay assertConfigFresh exits 1 with the actionable message; other startup errors → stderr + exit 1.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(err => {
        process.stderr.write(`[Wake Daemon] Daemon start failed: ${err && err.stack ? err.stack : err}\n`);
        process.exit(1);
    });
}
