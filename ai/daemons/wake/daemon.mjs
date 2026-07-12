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
import Neo                   from '../../../src/Neo.mjs';
import * as core             from '../../../src/core/_export.mjs';
import InstanceManager       from '../../../src/manager/Instance.mjs';
import AiConfig              from '../../config.mjs';
import memoryCoreConfig      from '../../mcp/server/memory-core/config.mjs';
import {assertConfigFresh}   from '../../scripts/setup/initServerConfigs.mjs';
import {WAKE_LANE_DIRECTIVE} from './wakeLaneDirective.mjs';

import fs                               from 'fs-extra';
import path                             from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawn, execSync }              from 'child_process';

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
import {HEARTBEAT_PULSE_ENTITY_TYPE, match} from '../../services/memory-core/heartbeatPulseEvaluator.mjs';
import {
    HEAVY_DELTA_SETTLE_MS,
    isHeavyDeltaPoll,
    shouldDeferFlush
} from './flushDeferPolicy.mjs';
import {clampWatermark, filterEventsByWatermark, maxLogId} from './wokenWatermark.mjs';
import {IDENTITIES}                                        from '../../graph/identityRoots.mjs';

// Config-derived paths + PID_FILE (below) are declared here but ASSIGNED in initConfigDerivedState()
// (called from the guarded main(), never at module-load): a stale memory-core overlay would otherwise
// crash these derefs with a cryptic `undefined` at import, before assertConfigFresh can report it.
let DB_PATH;
let DAEMON_DATA_DIR;
let STATE_FILE;
let LOG_FILE;
let WOKEN_WATERMARK_FILE;
const LOG_RETENTION_DAYS                = 30;
const POLL_INTERVAL_MS                  = 3000;
const DEFAULT_COALESCE_WINDOW_MS        = 30000; // 30 seconds
const CODEX_APP_SERVER_ADAPTER          = 'codex-app-server';
const CODEX_TURN_START_PROOF_TIMEOUT_MS = Number(process.env.WAKE_CODEX_TURN_START_PROOF_TIMEOUT_MS) || 45000;
const CODEX_TURN_START_PROOF_POLL_MS    = Number(process.env.WAKE_CODEX_TURN_START_PROOF_POLL_MS) || 1000;
const CODEX_WAKE_SUBMIT_NONCE_PREFIX    = 'NEO_WAKE_SUBMIT_NONCE:';
const WAKE_PRIORITY_RANKS               = {
    low   : 0,
    normal: 1,
    high  : 2
};

const identityParticipationById = new Map(
    IDENTITIES
        .filter(identity => identity.type === 'AgentIdentity')
        .map(identity => [
            normalizeAgentIdentityNodeId(identity.id),
            identity.properties?.participationStatus || 'active'
        ])
);

/**
 * @summary Loads the persisted per-subscription woken-watermark map, tolerant of a missing or
 * corrupt file (a fresh daemon starts with an empty map → first wakes fire normally).
 * @returns {Object<String, Number>}
 */
function loadWokenWatermark() {
    try {
        if (fs.existsSync(WOKEN_WATERMARK_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(WOKEN_WATERMARK_FILE, 'utf8'));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        }
    } catch (e) {
        // Corrupt watermark is non-fatal: worst case is one cycle of already-woken backlog being
        // re-counted, self-healing as the map re-persists. Daemon liveness never gates on it.
    }
    return {};
}

/**
 * @summary Best-effort persist of the woken-watermark map (mirrors the daemon's other internal
 * state writes); a write failure never gates daemon liveness.
 */
function persistWokenWatermark() {
    try {
        fs.writeFileSync(WOKEN_WATERMARK_FILE, JSON.stringify(wokenWatermark), 'utf8');
    } catch (e) {
        // best-effort; the in-memory map still dedups for the running process
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

    // Cleanup on exit
    let   cleanedUp = false;
    const cleanup   = () => {
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
        process.exit();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
    process.on('uncaughtException', (err) => {
        writeLog('ERROR', `[Wake Daemon] Uncaught exception: ${err && err.stack ? err.stack : err}`);
        cleanup(); // Calls process.exit() automatically
    });
}

let db;
let lastSyncId;

// In-memory queues for coalescing
// Structure: { [subscriptionId]: { timer: Timeout, queue: [events], subscription: {...} } }
const coalesceState = {};

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
 * edges are created nowhere), and task `from`-OR-`assignee` targeting (formerly assignee-only).
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
            return {type: 'message', messageId: payload.messageId, from: payload.from, subject: payload.subject, priority: payload.priority, logId};
        case 'task_state_changed':
            return {type: 'task', taskId: payload.taskId, newState: payload.newState, logId};
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
 * @summary Formats an optional live PR-state echo embedded in a heartbeat pulse summary.
 * @param {Object} summary Decoded heartbeat summary.
 * @returns {String}
 */
function formatPullRequestStateEcho(summary = {}) {
    const pullRequest = summary.latest?.pullRequest;
    if (!pullRequest?.state || !pullRequest?.number) return '';

    const mergedAt  = pullRequest.mergedAt  ? `, mergedAt ${pullRequest.mergedAt}`   : '',
          checkedAt = pullRequest.checkedAt ? `, checkedAt ${pullRequest.checkedAt}` : '';
    return ` [PR #${pullRequest.number}: ${pullRequest.state}${mergedAt}${checkedAt}]`
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
            queue: [],
            timer: null,
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

    // Deduplicate within the coalescing window
    const isDuplicate = coalesceState[subId].queue.some(existing => {
        if (existing.type !== eventPayload.type) return false;

        if (eventPayload.type === 'message') {
            return existing.messageId === eventPayload.messageId;
        } else if (eventPayload.type === 'task') {
            return existing.taskId === eventPayload.taskId && existing.newState === eventPayload.newState;
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

    // Start timer if not running
    if (!coalesceState[subId].timer) {
        let coalesceSeconds = subscription.properties?.harnessTargetMetadata?.coalesceWindow;
        if (coalesceSeconds === undefined || coalesceSeconds === null) coalesceSeconds = DEFAULT_COALESCE_WINDOW_MS / 1000;

        // Max 5 minutes, Min 0 seconds
        coalesceSeconds = Math.max(0, Math.min(300, coalesceSeconds));
        const windowMs = coalesceSeconds * 1000;

        if (windowMs === 0) {
            flushSubscription(subId);
        } else {
            coalesceState[subId].timer = setTimeout(() => {
                flushSubscription(subId);
            }, windowMs);
        }
    }
}

/**
 * @summary Normalizes wake digest priority values to the supported A2A priority vocabulary.
 *
 * The wake-priority digest surface intentionally reuses the existing A2A mailbox priority
 * values (`low`, `normal`, `high`) instead of introducing a transport-only urgency enum.
 * Unknown or missing priorities collapse to `normal` so malformed mailbox data cannot
 * produce ambiguous wake headers.
 *
 * @param {String} priority The raw message priority from the mailbox payload.
 * @returns {String} The normalized wake digest priority.
 * @private
 */
function normalizeWakePriority(priority) {
    return Object.hasOwn(WAKE_PRIORITY_RANKS, priority) ? priority : 'normal';
}

/**
 * @summary Projects coalesced message events into one wake digest priority.
 *
 * The wake daemon may coalesce several message events into one digest. This helper
 * preserves the strongest interruption signal by choosing the highest message priority
 * for the `[WAKE][priority:<level>]` header while keeping normal/low wakes deferrable
 * by agent policy.
 *
 * @param {Object[]} messages Coalesced message wake events.
 * @returns {String} The highest normalized wake digest priority.
 * @private
 */
function getHighestWakePriority(messages) {
    return messages.reduce((highest, message) => {
        const priority = normalizeWakePriority(message.priority);

        return WAKE_PRIORITY_RANKS[priority] > WAKE_PRIORITY_RANKS[highest] ? priority : highest;
    }, 'normal');
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

    // Already-woken dedup: drop events the recipient was already woken for
    // (logId <= the per-subscription watermark) so a re-queued backlog can't inflate the "N new" count
    // or spoof a HIGH digest from a stale message. Composes with the readAt reconcile above + the
    // heavy-delta defer at the top — reconciling on the right axis (already-woken, not merely unread).
    const watermark = clampWatermark(wokenWatermark[subId] ?? 0, watermarkGraphTip, watermarkResetCeiling);
    messages    = filterEventsByWatermark(messages,    watermark);
    tasks       = filterEventsByWatermark(tasks,       watermark);
    permissions = filterEventsByWatermark(permissions, watermark);
    heartbeats  = filterEventsByWatermark(heartbeats,  watermark);

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

    // Nothing genuinely-new survived (the delta was entirely already-read or already-woken) → suppress.
    if (messages.length === 0 && tasks.length === 0 && permissions.length === 0 && heartbeats.length === 0) {
        return;
    }

    const events           = {messages, tasks, permissions, heartbeats};
    const deliveryEvidence = buildWakeDeliveryEvidence(events);
    const digest           = buildWakeDigest(identity, events);

    // Delivery to per-harness adapter. A 'failed' outcome (the adapter dispatch threw against a live
    // target) is re-queued for retry — carrying the EVENTS, not just this digest string, so a second
    // failure for the same subscription coalesces them without loss. Successful deliveries are not
    // re-queued.
    const deliveryOutcome = await deliverDigest(subscription, digest, deliveryEvidence);
    if (deliveryOutcome === 'failed') {
        enqueueDeliveryRetry(subscription, identity, events);
    }

    // Advance the per-subscription watermark to the highest delivered logId so these events are not
    // re-counted if the backlog is re-queued; persist for restart durability. logId is monotonic
    // (append-only GraphLog), so genuinely-new events always land strictly above this mark.
    const deliveredMax = maxLogId([...messages, ...tasks, ...permissions, ...consumedHeartbeats]);
    if (deliveredMax !== null && deliveredMax > (wokenWatermark[subId] ?? 0)) {
        wokenWatermark[subId] = deliveredMax;
        persistWokenWatermark();
    }
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
const MAX_DELIVERY_RETRIES   = Number(process.env.WAKE_MAX_DELIVERY_RETRIES) || 5;
const pendingDeliveryRetries = new Map(); // subscriptionId -> {subscription, identity, events, attempts, nextAttemptAt}

/**
 * @summary Delivers the digest to the configured harness adapter.
 * @param {Object} subscription WAKE_SUBSCRIPTION node.
 * @param {String} digest Wake digest body.
 * @param {Object} [deliveryEvidence={}] Scenario/count evidence for Codex validation logs.
 * @returns {Promise<String|undefined>}
 */
async function deliverDigest(subscription, digest, deliveryEvidence = {}) {
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
            return;
        }

        if (addressType === 'webhookUrl') {
            await deliverViaWebhookUrl(subscription, dispatchDigest, instanceAddress);
            return;
        }

        if (adapter === CODEX_APP_SERVER_ADAPTER) {
            await deliverViaCodexAppServer(subscription, dispatchDigest, evidenceLabel);
            return;
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
                return;
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
                return;
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
                    return;
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
                    return;
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
        } else {
            writeLog('ERROR', `[Wake Daemon] Unknown adapter '${adapter}' for subscription ${subscription.id}`);
        }
        return 'delivered';
    } catch (err) {
        writeLog('ERROR', `[Wake Daemon] Failed to deliver via ${adapter}: ${err.message}`);
        return 'failed';
    }
    });

    return deliveryPromise;
}

/**
 * @summary Builds the `[WAKE]` digest string for a set of wake events. Extracted so the retry path
 * can rebuild a SINGLE digest over the UNION of events accumulated across same-subscription failures
 * (correct total count + max priority), rather than replaying one stale per-failure string.
 * @param {String} identity Recipient agent identity.
 * @param {Object} events `{messages, tasks, permissions, heartbeats}` arrays.
 * @returns {String}
 */
function buildWakeDigest(identity, {messages = [], tasks = [], permissions = [], heartbeats = []} = {}) {
    const N              = messages.length + tasks.length + permissions.length + heartbeats.length,
          digestPriority = getHighestWakePriority(messages);

    let breakdown = '';

    if (messages.length > 0) {
        const latest         = messages[messages.length - 1],
              latestPriority = normalizeWakePriority(latest.priority),
              prioritySuffix = latestPriority === digestPriority ? '' : `, latest priority: ${latestPriority}`;
        breakdown += `\n- ${messages.length} new messages (latest: "${latest.subject}" from ${latest.from}${prioritySuffix})`;
    }
    if (tasks.length > 0) {
        const latest = tasks[tasks.length - 1];
        breakdown += `\n- ${tasks.length} task transitions (latest: ${latest.newState} on task ${latest.taskId})`;
    }
    if (permissions.length > 0) {
        const latest = permissions[permissions.length - 1];
        breakdown += `\n- ${permissions.length} permissions granted (latest: ${latest.scope} by ${latest.grantedBy})`;
    }
    if (heartbeats.length > 0) {
        const latest  = heartbeats[heartbeats.length - 1],
              summary = latest.summary;

        let extra = '';
        if (summary?.source === 'github-notification') {
            extra = `; latest GitHub ${summary.latest?.reason || 'notification'}: "${summary.latest?.title || summary.latest?.id || 'untitled'}"${formatPullRequestStateEcho(summary)}${summary.latest?.url ? ` (${summary.latest.url})` : ''}`;
        } else if (summary?.source === 'idle-out-nudge') {
            extra = `; idle-out nudge — ${summary.reason || 'idle'}; next: ${summary.nextAction || 'claim a lane'}`;
        }

        breakdown += `\n- ${heartbeats.length} heartbeat pulses (latest GraphLog: ${latest.logId}${extra})`;
    }

    // The lifecycle-first lane directive is an IDLE-watchdog nudge — append it ONLY to pure-heartbeat
    // digests (the watchdog pulse with no actionable A2A content). A digest carrying messages / tasks /
    // permissions already has a specific event to act on, so the generic directive is noise + token waste
    // there; and message wakes vastly outnumber the heartbeat, so this gate is the dominant token saving.
    const isPureHeartbeat = heartbeats.length > 0 && messages.length === 0 && tasks.length === 0 && permissions.length === 0,
          laneDirective   = isPureHeartbeat ? `\n\n${WAKE_LANE_DIRECTIVE}` : '';

    return `[WAKE][priority:${digestPriority}] ${N} events for ${identity}: ${breakdown}${laneDirective}`;
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

        // Re-apply the read-state reconcile the initial digest used (see `flushSubscription`): a message
        // the recipient read between the failed delivery and this retry must NOT be re-delivered. The
        // watermark filter is deliberately NOT re-applied — it advanced past these events on the first
        // attempt, and the retry's whole job is to re-deliver those below-watermark events; only the
        // read-state axis is reconciled here.
        const liveMessages = entry.events.messages.filter(ev => !isMessageReadFor(db, ev.messageId, entry.identity));

        if (liveMessages.length === 0 && entry.events.tasks.length === 0 &&
            entry.events.permissions.length === 0 && entry.events.heartbeats.length === 0
        ) {
            pendingDeliveryRetries.delete(subId);
            writeLog('INFO',
                `[Wake Daemon] Retry for ${subId} dropped: all queued messages were read before re-delivery.`
            );
            continue;
        }

        const retryEvents      = {...entry.events, messages: liveMessages};
        const deliveryEvidence = buildWakeDeliveryEvidence(retryEvents);
        const digest           = buildWakeDigest(entry.identity, retryEvents);
        const outcome          = await deliverDigest(entry.subscription, digest, deliveryEvidence);

        if (outcome === 'failed') {
            entry.attempts += 1;
            if (entry.attempts >= MAX_DELIVERY_RETRIES) {
                pendingDeliveryRetries.delete(subId);
                writeLog('ERROR',
                    `[Wake Daemon] Giving up wake delivery for ${subId} after ${entry.attempts} failed attempts; wake dropped.`
                );
            } else {
                entry.nextAttemptAt = now + POLL_INTERVAL_MS * entry.attempts;
            }
        } else {
            pendingDeliveryRetries.delete(subId);
            writeLog('INFO',
                `[Wake Daemon] Wake delivery for ${subId} succeeded on retry (attempt ${entry.attempts + 1}).`
            )
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
async function deliverViaWebhookUrl(subscription, digest, webhookUrl) {
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
        })
    });

    if (!response.ok) {
        throw new Error(`webhookUrl POST failed with HTTP ${response.status}`);
    }

    writeLog('INFO', `[Wake Daemon] Delivered ${subscription.id} via webhookUrl POST`);
}

/**
 * @summary Assigns the config-derived module-scope paths (DB_PATH / DAEMON_DATA_DIR / STATE_FILE /
 * LOG_FILE / WOKEN_WATERMARK_FILE / PID_FILE) + runs their one-shot startup side-effects (data-dir
 * ensure, archived-log prune, woken-watermark load). Deferred out of module-load so the
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
    PID_FILE             = path.join(DAEMON_DATA_DIR, 'wake-daemon.pid');

    fs.ensureDirSync(DAEMON_DATA_DIR);     // data dir must exist before any state-file write
    pruneOldLogs();                        // one-shot reaper for archived logs older than retention
    wokenWatermark = loadWokenWatermark(); // restore the durable per-subscription woken high-water marks
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
