/**
 * @summary Bridge daemon for Neo.mjs wake-event delivery.
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
 * terminal observability and `.neo-ai-data/wake-daemon/bridge.log` for
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
import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import InstanceManager from '../../../src/manager/Instance.mjs';
import AiConfig        from '../../config.mjs';

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
    initializeDatabase,
    getLastSyncId,
    getActiveShapeCSubscriptions,
    getGraphLogEntries,
    getNodesData,
    getEdgesData,
    getDbNode
} from './queries.mjs';
import {applyHarnessMetadataDefaults} from '../../scripts/lifecycle/harnessRouting.mjs';
import {getDefaultInstancePid, getInstancePid} from './instanceResolver.mjs';

const DB_PATH                  = process.env.NEO_AI_DB_PATH || '.neo-ai-data/sqlite/memory-core-graph.sqlite';
const DAEMON_DATA_DIR          = process.env.NEO_AI_DAEMON_DIR || '.neo-ai-data/wake-daemon';
const STATE_FILE               = path.join(DAEMON_DATA_DIR, 'lastSyncId');
const LOG_FILE                 = path.join(DAEMON_DATA_DIR, 'bridge.log');
const LOG_RETENTION_DAYS       = 30;
const POLL_INTERVAL_MS         = 3000;
const DEFAULT_COALESCE_WINDOW_MS = 30000; // 30 seconds
const WAKE_PRIORITY_RANKS      = {
    low   : 0,
    normal: 1,
    high  : 2
};

// Ensure daemon data dir exists
fs.ensureDirSync(DAEMON_DATA_DIR);

/**
 * Rotates `bridge.log` if its mtime falls on a calendar day different from today's.
 * Renames the previous-day file to `bridge.log.YYYY-MM-DD` so the active file always
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
        process.stderr.write(`[Bridge Daemon] Log rotation failed: ${e.message}\n`);
    }
}

/**
 * Prunes archived log files (`bridge.log.*`) older than `LOG_RETENTION_DAYS` from
 * `DAEMON_DATA_DIR`. Runs once at daemon startup. Best-effort: per-file unlink
 * failures are silently swallowed (best to lose a stale archive than gate startup).
 * @protected
 */
function pruneOldLogs() {
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    try {
        const entries = fs.readdirSync(DAEMON_DATA_DIR);
        for (const entry of entries) {
            // Match `bridge.log.YYYY-MM-DD` archive files only — leave `bridge.log` alone
            if (!entry.startsWith('bridge.log.') || entry === 'bridge.log') continue;
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
 * terminal observability) AND the persistent `bridge.log` file (post-hoc audit
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

// One-shot prune at startup; reaper for archived logs older than retention window
pruneOldLogs();

const PID_FILE = path.join(DAEMON_DATA_DIR, 'bridge-daemon.pid');
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
                        if (cmd.includes('daemons/bridge/daemon.mjs')) {
                            writeLog('INFO', `[Bridge Daemon] Found existing instance (PID: ${oldPid}). Sending SIGTERM...`);
                            process.kill(oldPid, 'SIGTERM');
                        } else {
                            writeLog('INFO', `[Bridge Daemon] Stale PID file found. PID ${oldPid} used by a different process. Proceeding.`);
                            isAlive = false; // We won't wait for it to exit
                        }
                    } catch (psErr) {
                        writeLog('INFO', `[Bridge Daemon] Could not verify process name. Sending SIGTERM to PID ${oldPid} to be safe...`);
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
                        writeLog('INFO', `[Bridge Daemon] PID ${oldPid} did not exit after 3s. Escalating to SIGKILL...`);
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
            writeLog('ERROR', `[Bridge Daemon] Failed to check existing PID file: ${e.message || e}`);
        }
    }

    // Write new PID using atomic wx claim
    try {
        fs.writeFileSync(PID_FILE, process.pid.toString(), { encoding: 'utf8', flag: 'wx' });
    } catch (e) {
        if (e.code === 'EEXIST') {
            writeLog('ERROR', `[Bridge Daemon] Failed to claim PID file (EEXIST). Another instance started simultaneously. Exiting.`);
            process.exit(1);
        } else {
            throw e;
        }
    }

    // Cleanup on exit
    let cleanedUp = false;
    const cleanup = () => {
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
        writeLog('ERROR', `[Bridge Daemon] Uncaught exception: ${err && err.stack ? err.stack : err}`);
        cleanup(); // Calls process.exit() automatically
    });
}

let db;
let lastSyncId;

// In-memory queues for coalescing
// Structure: { [subscriptionId]: { timer: Timeout, queue: [events], subscription: {...} } }
const coalesceState = {};

/**
 * Main polling loop
 */
async function pollLoop() {
    try {
        // Fetch deltas
        const logs = getGraphLogEntries(db, lastSyncId);

        if (logs.length > 0) {
            const invalidNodes = new Set();
            const invalidEdges = new Set();
            let maxId = lastSyncId;

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
                        : trace.entity_type === 'heartbeat_pulse' ? {id: trace.entity_id, type: 'HEARTBEAT_PULSE'}
                        : null;
                    if (!entity) continue; // entity might have been deleted, skipping for wake events unless it's a deletion trigger, but currently we focus on creation/updates

                    for (const sub of subscriptions) {
                        const eventPayload = evaluateSubscription(sub, trace, entity, nodesMap, edgesMap);
                        if (eventPayload) {
                            queueEvent(sub, eventPayload);
                        }
                    }
                }
            }

            lastSyncId = maxId;
            fs.writeFileSync(STATE_FILE, lastSyncId.toString(), 'utf8');
        }

    } catch (err) {
        writeLog('ERROR', `[Bridge Daemon] Error in poll loop: ${err && err.stack ? err.stack : err}`);
    }

    setTimeout(pollLoop, POLL_INTERVAL_MS);
}

/**
 * Evaluates a GraphLog entry against a WAKE_SUBSCRIPTION trigger + filters.
 */
function evaluateSubscription(sub, trace, entity, nodesMap, edgesMap) {
    const trigger       = sub.properties?.trigger;
    const harnessTarget = sub.properties?.harnessTarget;
    const filters       = sub.properties?.filters || {};
    const agentIdentity = sub.properties?.agentIdentity;

    if (!agentIdentity) return null;

    if (trigger === 'SENT_TO_ME' && trace.entity_type === 'edges' && entity.type === 'SENT_TO') {
        // A SENT_TO edge points to the agent.
        if (entity.target === agentIdentity || entity.target === 'AGENT:*') {
            const messageNode = nodesMap.get(entity.source) || getDbNode(db, entity.source);
            if (messageNode && messageNode.label === 'MESSAGE') {
                if (messageNode.properties?.wakeSuppressed) return null;

                // Suppress same-sender broadcast wakes. The sender already has the
                // broadcast in active context, so wake-as-interrupt carries no new
                // information and inflates unread/no-op load during coordination loops.
                // Audit/outbox visibility is preserved by MailboxService listings;
                // this gates wake delivery only, not graph storage. Direct self-DMs
                // remain delivered for deliberate self-handoff flows.
                if (entity.target === 'AGENT:*' && messageNode.properties?.from === agentIdentity) {
                    return null;
                }

                // Apply filters
                if (filters.priority && messageNode.properties?.priority !== filters.priority) return null;
                if (filters.senderFilter && !filters.senderFilter.includes(messageNode.properties?.from)) return null;
                if (filters.taggedConcepts && !filters.taggedConcepts.some(c => (messageNode.properties?.taggedConcepts || []).includes(c))) return null;
                if (filters.inReplyToFilter && !filters.inReplyToFilter.includes(messageNode.properties?.inReplyTo)) return null;

                let fromIdentity = 'unknown';
                for (const edge of edgesMap.values()) {
                    if (edge.type === 'SENT_BY' && edge.source === messageNode.id) {
                        fromIdentity = edge.target;
                        break;
                    }
                }
                if (fromIdentity === 'unknown') {
                    const stmt = db.prepare("SELECT target FROM Edges WHERE source = ? AND type = 'SENT_BY' LIMIT 1");
                    const row = stmt.get(messageNode.id);
                    if (row) fromIdentity = row.target;
                }

                return {
                    type: 'message',
                    messageId: messageNode.id,
                    from: fromIdentity,
                    subject: messageNode.properties?.subject,
                    priority: messageNode.properties?.priority || 'normal',
                    logId: trace.log_id
                };
            }
        }
    } else if (trigger === 'TASK_STATE_CHANGED' && trace.entity_type === 'nodes' && entity.label === 'MESSAGE') {
        // Task state changed: a MESSAGE node representing a Task was updated.
        // We'd need to compare previous state, but GraphLog only gives us the new state.
        // For simplicity in the Bridge Daemon, we alert if the task state is assigned to the agent.
        const assignee = entity.properties?.task?.assignee;
        if (assignee === agentIdentity) {
            return {
                type: 'task',
                taskId: entity.id,
                newState: entity.properties?.task?.state,
                logId: trace.log_id
            };
        }
    } else if (trigger === 'PERMISSION_GRANTED' && trace.entity_type === 'edges' && entity.type === 'HAS_PERMISSION') {
        if (entity.target === agentIdentity) {
            return {
                type: 'permission',
                scope: entity.properties?.scope,
                grantedBy: entity.source,
                logId: trace.log_id
            };
        }
    } else if (harnessTarget === 'bridge-daemon' && trace.entity_type === 'heartbeat_pulse') {
        const pulse = parseHeartbeatPulseEntityId(trace.entity_id);
        if (pulse?.targetIdentity === agentIdentity) {
            return {
                type: 'heartbeat',
                targetIdentity: pulse.targetIdentity,
                pulseId: pulse.pulseId,
                logId: trace.log_id
            };
        }
    }

    return null;
}

/**
 * Parses a GraphLog-only heartbeat pulse entity id.
 * @param {String} entityId Encoded `HEARTBEAT_PULSE:<identity>:<uuid>` id.
 * @returns {{targetIdentity:String,pulseId:String}|null} Parsed pulse.
 */
function parseHeartbeatPulseEntityId(entityId) {
    const prefix = 'HEARTBEAT_PULSE:';
    if (!entityId?.startsWith(prefix)) return null;

    const body      = entityId.slice(prefix.length);
    const separator = body.lastIndexOf(':');
    if (separator <= 0 || separator === body.length - 1) return null;

    return {
        targetIdentity: body.slice(0, separator),
        pulseId       : body.slice(separator + 1)
    };
}



/**
 * Queues an event for coalescing.
 * Applies tuple-based deduplication (type + identity-tuple) to prevent duplicate
 * wake event triggers within a single coalescing window.
 * @param {Object} subscription - The target subscription node
 * @param {Object} eventPayload - The wake event to queue
 */
function queueEvent(subscription, eventPayload) {
    const subId = subscription.id;
    if (!coalesceState[subId]) {
        coalesceState[subId] = {
            subscription,
            queue: [],
            timer: null
        };
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
 * The bridge daemon may coalesce several message events into one digest. This helper
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
 * @summary Flushes the coalesced wake queue into a priority-tagged digest.
 *
 * The digest header carries the highest coalesced message priority so agent policy can
 * interrupt immediately for `high` wakes while deferring `normal` and `low` wakes until
 * the active lifecycle task has completed its required handoff.
 */
async function flushSubscription(subId) {
    const state = coalesceState[subId];
    if (!state) return;

    const { queue, subscription } = state;
    delete coalesceState[subId]; // reset

    if (queue.length === 0) return;

    const N = queue.length;
    const identity = subscription.properties?.agentIdentity;

    let messages = [], tasks = [], permissions = [], heartbeats = [];
    for (const ev of queue) {
        if (ev.type === 'message') messages.push(ev);
        else if (ev.type === 'task') tasks.push(ev);
        else if (ev.type === 'permission') permissions.push(ev);
        else if (ev.type === 'heartbeat') heartbeats.push(ev);
    }

    let breakdown = '';
    const digestPriority = getHighestWakePriority(messages);

    if (messages.length > 0) {
        const latest = messages[messages.length - 1];
        const latestPriority = normalizeWakePriority(latest.priority);
        const prioritySuffix = latestPriority === digestPriority ? '' : `, latest priority: ${latestPriority}`;
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
        const latest = heartbeats[heartbeats.length - 1];
        breakdown += `\n- ${heartbeats.length} heartbeat pulses (latest GraphLog: ${latest.logId})`;
    }

    const digest = `[WAKE][priority:${digestPriority}] ${N} events for ${identity}: ${breakdown}\n\nSubscription: ${subId}`;

    // Delivery to per-harness adapter
    await deliverDigest(subscription, digest);
}

/**
 * Promisified spawn wrapper for injection-safe execution
 */
function spawnAsync(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderrData = '';
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
 * @summary Delivers a wake digest via osascript, retrying transient frontmost-loss races.
 *
 * macOS focus-stealing prevention makes a background daemon's `activate` / `set frontmost`
 * best-effort: when another app holds frontmost during the multi-second activate → paste →
 * restore sequence, `assertTargetFrontmost` aborts the osascript with a `-2700`
 * "lost frontmost status" error. Focus contention is transient, so we re-attempt the whole
 * delivery a few times before giving up.
 *
 * Phase-aware idempotency guard: the wake payload is submitted (`key code 36` / Enter) BEFORE
 * the "user input restore" phases. A frontmost-loss reported for a restore phase therefore means
 * the wake already landed — only the user's draft-restore failed (cosmetic). We must NOT retry
 * that case (it would double-submit the wake). Non-race errors (syntax/permissions) re-throw
 * immediately.
 * @param {String[]} osascriptArgs The fully-built `osascript -e …` argument list.
 * @param {String} subscriptionId For log attribution.
 * @param {String} appName For log attribution.
 * @returns {Promise<void>}
 */
async function deliverViaOsascriptWithRetry(osascriptArgs, subscriptionId, appName) {
    const maxAttempts = 4,
          backoffMs   = 800;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await spawnAsync('osascript', osascriptArgs);
            writeLog('INFO',
                `[Bridge Daemon] Delivered ${subscriptionId} via osascript to ${appName}` +
                (attempt > 1 ? ` (attempt ${attempt}/${maxAttempts})` : ''));
            return
        } catch (err) {
            const message         = err.message || '',
                  isFrontmostRace = /lost frontmost status|-2700/.test(message),
                  afterSubmit     = /user input restore/.test(message);

            // Wake already submitted; only the draft-restore lost frontmost → delivered, do not retry.
            if (isFrontmostRace && afterSubmit) {
                writeLog('WARN',
                    `[Bridge Daemon] ${subscriptionId} wake landed but draft-restore lost frontmost; ` +
                    `not retrying (avoids double-send). ${message}`);
                return
            }

            // Lost frontmost before submit → transient focus contention → retry the whole delivery.
            if (attempt < maxAttempts && isFrontmostRace) {
                writeLog('WARN',
                    `[Bridge Daemon] Wake delivery ${subscriptionId} attempt ${attempt}/${maxAttempts} ` +
                    `lost frontmost before submit (focus contention); retrying in ${backoffMs}ms. ${message}`);
                await wait(backoffMs);
                continue
            }

            throw err
        }
    }
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

/**
 * Delivers the digest to the correct adapter (tmux or osascript).
 */
async function deliverDigest(subscription, digest) {
    const meta = subscription.properties?.harnessTargetMetadata || {};
    // Fall back to osascript on macOS by default, tmux otherwise
    const defaultAdapter = process.platform === 'darwin' ? 'osascript' : 'tmux';
    const adapter = meta.adapter || defaultAdapter;

    // Serialize execution to prevent focus collisions (Electron-Paradox defense)
    deliveryPromise = deliveryPromise.then(async () => {

    try {
        if (adapter === 'tmux') {
            const tmuxSession = meta.tmuxSession || process.env.TMUX_SESSION || 'neo-agent';
            await spawnAsync('tmux', ['send-keys', '-t', tmuxSession, digest, 'C-m']);
            writeLog('INFO', `[Bridge Daemon] Delivered ${subscription.id} via tmux to session ${tmuxSession}`);
        } else if (adapter === 'osascript') {
            const appName = meta.appName;
            if (!appName) {
                writeLog('ERROR',
                    `[Bridge Daemon] Cannot deliver subscription ${subscription.id}: ` +
                    `harnessTargetMetadata.appName is missing/empty. ` +
                    `Skipping delivery to avoid misrouting. ` +
                    `Verify subscription template via 'manage_wake_subscription({action: \\'list\\'})' ` +
                    `or fix the AgentIdentity subscriptionTemplate.`
                );
                return;
            }
            const metadataWithDefaults = applyHarnessMetadataDefaults(meta);
            let tabShortcut            = metadataWithDefaults.tabShortcut;
            let focusSeedKey           = metadataWithDefaults.focusSeedKey;
            let focusSeedSequence      = metadataWithDefaults.focusSeedSequence;

            // Codex Desktop fail-closed guard. The bridge must not drive the destructive
            // Cmd+A/Cmd+X clear path unless subscription metadata provides a verified,
            // non-mutating composer-focus primitive. Printable-key focus probes can mutate
            // drafts, so multi-step probe/undo strategies must use an explicit
            // `focusSeedSequence` implementation rather than masquerading as a single-key
            // `focusSeedKey` opt-in. The app-server adapter may eventually supersede the
            // UI-keystroke path entirely.
            if (appName === 'Codex' && !focusSeedKey) {
                writeLog('WARN',
                    `[Bridge Daemon] Codex UI wake delivery refused for ${subscription.id}: ` +
                    `no validated composer-focus primitive (per #10664). ` +
                    `Subscription must opt in via meta.focusSeedKey with a verified primitive, ` +
                    `or wait for the #10517 Codex app-server adapter.`
                );
                return;
            }

            // Instance-addressable wake — LOCAL deployment only. When the subscription carries a
            // userDataDir, two same-bundle GUI harnesses may be running; resolve the intended
            // instance's pid and raise THAT process — never the ambiguous app-activate / frontmost
            // guess. Fail closed (skip the wake) if the instance cannot be located, so a targeted
            // wake never lands in the wrong one.
            //
            // Instance addressing is a local-only primitive: this daemon delivers desktop-harness
            // wakes via osascript/tmux, which a headless cloud deployment has no GUI harness to
            // receive, so the daemon does not run under cloud at all. The deploymentMode === 'cloud'
            // branch below is therefore DEFENSE-IN-DEPTH, not a live path: if the gate is ever
            // evaluated under a cloud deploymentMode, REFUSE (fail closed) rather than fall through to
            // app-activate — a targeted wake must never silently degrade to an untargeted one. Uses
            // the canonical AiConfig.orchestrator.deploymentMode signal.
            let instancePid = null;
            if (meta.userDataDir) {
                if (AiConfig.orchestrator.deploymentMode === 'cloud') {
                    writeLog('ERROR',
                        `[Bridge Daemon] Instance wake refused for ${subscription.id}: ` +
                        `userDataDir targeting requires local deployment (deploymentMode='cloud'). ` +
                        `Failing closed — instance-addressed GUI wakes are local-only (ADR 0014).`
                    );
                    return;
                }
                instancePid = await getInstancePid({userDataDir: meta.userDataDir});
                if (!instancePid) {
                    writeLog('ERROR',
                        `[Bridge Daemon] Instance wake refused for ${subscription.id}: ` +
                        `no running process found for userDataDir='${meta.userDataDir}'. ` +
                        `Failing closed to avoid misrouting to another ${appName} instance.`
                    );
                    return;
                }
            } else if (AiConfig.orchestrator.deploymentMode !== 'cloud') {
                // No userDataDir = the DEFAULT instance, started as the normal macOS app (which can
                // never carry --user-data-dir without breaking its system app / menu-bar integration).
                // When a same-bundle sibling instance is running, "activate + frontmost" is ambiguous;
                // the default is uniquely identifiable by the ABSENCE of the flag, so target its pid
                // directly. Returns null for single-instance (or ambiguous) — the legacy activate path
                // below is then kept unchanged, so single-instance behavior is untouched.
                instancePid = await getDefaultInstancePid({appName});
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
            // We specifically use \`key code 36\` (Enter) to submit the payload after pasting.
            // This is load-bearing for Claude Desktop with Tab 3 (Claude Code) and Google Antigravity.
            // Do NOT "clean this up" or revert to \`tell process\` or try to replace the Enter key
            // without empiric validation across both harnesses.
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
                digest
            );

            await deliverViaOsascriptWithRetry(osascriptArgs, subscription.id, appName);
        } else if (adapter === 'test') {
            writeLog('INFO', `[Bridge Daemon Test Adapter] Delivered ${subscription.id}: ${digest}`);
        } else {
            writeLog('ERROR', `[Bridge Daemon] Unknown adapter '${adapter}' for subscription ${subscription.id}`);
        }
    } catch (err) {
        writeLog('ERROR', `[Bridge Daemon] Failed to deliver via ${adapter}: ${err.message}`);
    }
    });

    return deliveryPromise;
}

// Start loop
async function main() {
    await enforceSingleton();

    db = initializeDatabase(DB_PATH);

    // Read lastSyncId
    lastSyncId = getLastSyncId(db, STATE_FILE);

    writeLog('INFO', `[Bridge Daemon] Started. Tail-syncing from GraphLog ID: ${lastSyncId}`);

    pollLoop();
}

main();
