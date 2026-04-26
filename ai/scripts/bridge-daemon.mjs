import fs from 'fs-extra';
import path from 'path';
import Database from 'better-sqlite3';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

const DB_PATH = '.neo-ai-data/sqlite/memory-core-graph.sqlite';
const DAEMON_DATA_DIR = '.neo-ai-data/wake-daemon';
const STATE_FILE = path.join(DAEMON_DATA_DIR, 'lastSyncId');
const POLL_INTERVAL_MS = 3000;
const DEFAULT_COALESCE_WINDOW_MS = 30000; // 30 seconds

// Ensure daemon data dir exists
fs.ensureDirSync(DAEMON_DATA_DIR);

let db;
try {
    db = new Database(DB_PATH, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
} catch (err) {
    console.error(`[Bridge Daemon] Failed to open database at ${DB_PATH}. Is the graph initialized?`);
    process.exit(1);
}

// Read lastSyncId
let lastSyncId = 0;
if (fs.existsSync(STATE_FILE)) {
    lastSyncId = parseInt(fs.readFileSync(STATE_FILE, 'utf8'), 10) || 0;
} else {
    try {
        const row = db.prepare('SELECT MAX(log_id) as max_id FROM GraphLog').get();
        lastSyncId = row?.max_id || 0;
    } catch (e) {
        lastSyncId = 0;
    }
}

console.log(`[Bridge Daemon] Started. Tail-syncing from GraphLog ID: ${lastSyncId}`);

// In-memory queues for coalescing
// Structure: { [subscriptionId]: { timer: Timeout, queue: [events], subscription: {...} } }
const coalesceState = {};

/**
 * Gets active Bridge Daemon subscriptions
 */
function getActiveShapeCSubscriptions() {
    const stmt = db.prepare(`
        SELECT data 
        FROM Nodes 
        WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
          AND json_extract(data, '$.properties.harnessTarget') = 'bridge-daemon'
          AND COALESCE(json_extract(data, '$.properties.status'), 'active') != 'degraded'
    `);
    return stmt.all().map(row => JSON.parse(row.data));
}

/**
 * Main polling loop
 */
async function pollLoop() {
    try {
        // Fetch deltas
        const logs = db.prepare('SELECT log_id, entity_id, entity_type FROM GraphLog WHERE log_id > ? ORDER BY log_id ASC').all(lastSyncId);
        
        if (logs.length > 0) {
            const invalidNodes = new Set();
            const invalidEdges = new Set();
            let maxId = lastSyncId;
            
            for (const trace of logs) {
                maxId = Math.max(maxId, trace.log_id);
                if (trace.entity_type === 'nodes') invalidNodes.add(trace.entity_id);
                else if (trace.entity_type === 'edges') invalidEdges.add(trace.entity_id);
            }

            const subscriptions = getActiveShapeCSubscriptions();
            
            if (subscriptions.length > 0) {
                // Fetch the actual node/edge data to evaluate filters
                const nodesData = invalidNodes.size > 0 
                    ? db.prepare(`SELECT id, data FROM Nodes WHERE id IN (${Array.from(invalidNodes).map(() => '?').join(',')})`).all(...Array.from(invalidNodes))
                    : [];
                const edgesData = invalidEdges.size > 0 
                    ? db.prepare(`SELECT id, data, source, target, type FROM Edges WHERE id IN (${Array.from(invalidEdges).map(() => '?').join(',')})`).all(...Array.from(invalidEdges))
                    : [];
                
                const nodesMap = new Map(nodesData.map(r => [r.id, JSON.parse(r.data)]));
                const edgesMap = new Map(edgesData.map(r => [r.id, JSON.parse(r.data)]));

                for (const trace of logs) {
                    const entity = trace.entity_type === 'nodes' ? nodesMap.get(trace.entity_id) : edgesMap.get(trace.entity_id);
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
        console.error('[Bridge Daemon] Error in poll loop:', err);
    }

    setTimeout(pollLoop, POLL_INTERVAL_MS);
}

/**
 * Evaluates a GraphLog entry against a WAKE_SUBSCRIPTION trigger + filters.
 */
function evaluateSubscription(sub, trace, entity, nodesMap, edgesMap) {
    const trigger = sub.properties?.trigger;
    const filters = sub.properties?.filters || {};
    const agentIdentity = sub.properties?.agentIdentity;

    if (!agentIdentity) return null;

    if (trigger === 'SENT_TO_ME' && trace.entity_type === 'edges' && entity.type === 'SENT_TO') {
        // A SENT_TO edge points to the agent.
        if (entity.target === agentIdentity || entity.target === 'AGENT:*') {
            const messageNode = nodesMap.get(entity.source) || getDbNode(entity.source);
            if (messageNode && messageNode.label === 'MESSAGE') {
                // Apply filters
                if (filters.priority && messageNode.properties?.priority !== filters.priority) return null;
                if (filters.senderFilter && !filters.senderFilter.includes(messageNode.properties?.from)) return null;
                if (filters.taggedConcepts && !filters.taggedConcepts.some(c => (messageNode.properties?.taggedConcepts || []).includes(c))) return null;
                if (filters.inReplyToFilter && !filters.inReplyToFilter.includes(messageNode.properties?.inReplyTo)) return null;

                return {
                    type: 'message',
                    messageId: messageNode.id,
                    from: messageNode.properties?.from,
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
    }

    return null;
}

function getDbNode(id) {
    try {
        const row = db.prepare('SELECT data FROM Nodes WHERE id = ?').get(id);
        return row ? JSON.parse(row.data) : null;
    } catch (e) {
        return null;
    }
}

/**
 * Queues an event for coalescing.
 */
function queueEvent(subscription, eventPayload) {
    const subId = subscription.id;
    if (!coalesceState[subId]) {
        coalesceState[subId] = {
            subscription: subscription,
            queue: [],
            timer: null,
            windowStart: Date.now()
        };
    }

    coalesceState[subId].queue.push(eventPayload);

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
 * Flushes the queue for a subscription, building the digest and invoking the harness adapter.
 */
async function flushSubscription(subId) {
    const state = coalesceState[subId];
    if (!state) return;

    const { queue, subscription, windowStart } = state;
    delete coalesceState[subId]; // reset

    if (queue.length === 0) return;

    const N = queue.length;
    const identity = subscription.properties?.agentIdentity;
    
    let messages = [], tasks = [], permissions = [];
    for (const ev of queue) {
        if (ev.type === 'message') messages.push(ev);
        else if (ev.type === 'task') tasks.push(ev);
        else if (ev.type === 'permission') permissions.push(ev);
    }

    let breakdown = '';
    if (messages.length > 0) {
        const latest = messages[messages.length - 1];
        breakdown += `\\n- ${messages.length} new messages (latest: "${latest.subject}" from ${latest.from})`;
    }
    if (tasks.length > 0) {
        const latest = tasks[tasks.length - 1];
        breakdown += `\\n- ${tasks.length} task transitions (latest: ${latest.newState} on task ${latest.taskId})`;
    }
    if (permissions.length > 0) {
        const latest = permissions[permissions.length - 1];
        breakdown += `\\n- ${permissions.length} permissions granted (latest: ${latest.scope} by ${latest.grantedBy})`;
    }

    const windowDuration = Date.now() - windowStart;
    
    const digest = `[WAKE] ${N} events for ${identity}: ${breakdown}\\n\\nSubscription: ${subId}\\nWindow: ${windowDuration}ms`;
    
    // Delivery to per-harness adapter
    await deliverDigest(subscription, digest);
}

/**
 * Delivers the digest to the correct adapter (tmux or osascript).
 */
async function deliverDigest(subscription, digest) {
    const meta = subscription.properties?.harnessTargetMetadata || {};
    const adapter = meta.adapter || 'tmux'; // fallback to tmux if not specified

    // We escape double quotes to avoid shell injection
    const escapedDigest = digest.replace(/"/g, '\\\\\"');

    try {
        if (adapter === 'tmux') {
            const tmuxSession = meta.tmuxSession || process.env.TMUX_SESSION || 'neo-agent';
            await execAsync(`tmux send-keys -t "${tmuxSession}" "${escapedDigest}" C-m`);
            console.log(`[Bridge Daemon] Delivered ${subscription.id} via tmux to session ${tmuxSession}`);
        } else if (adapter === 'osascript') {
            const script = `
                tell application "Claude" to activate
                tell application "System Events" to keystroke "${escapedDigest}"
                tell application "System Events" to key code 36
            `;
            await execAsync(`osascript -e '${script.replace(/\\n/g, "' -e '")}'`);
            console.log(`[Bridge Daemon] Delivered ${subscription.id} via osascript`);
        } else if (adapter === 'test') {
            console.log(`[Bridge Daemon Test Adapter] Delivered ${subscription.id}: ${escapedDigest}`);
        } else {
            console.warn(`[Bridge Daemon] Unknown adapter '${adapter}' for subscription ${subscription.id}`);
        }
    } catch (err) {
        console.error(`[Bridge Daemon] Failed to deliver via ${adapter}:`, err.message);
    }
}

// Start loop
pollLoop();
