import fs from 'fs-extra';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { 
    initializeDatabase, 
    getLastSyncId, 
    getActiveShapeCSubscriptions, 
    getGraphLogEntries, 
    getNodesData, 
    getEdgesData, 
    getDbNode 
} from './bridge-daemon-queries.mjs';

const DB_PATH = process.env.NEO_AI_DB_PATH || '.neo-ai-data/sqlite/memory-core-graph.sqlite';
const DAEMON_DATA_DIR = process.env.NEO_AI_DAEMON_DIR || '.neo-ai-data/wake-daemon';
const STATE_FILE = path.join(DAEMON_DATA_DIR, 'lastSyncId');
const POLL_INTERVAL_MS = 3000;
const DEFAULT_COALESCE_WINDOW_MS = 30000; // 30 seconds

// Ensure daemon data dir exists
fs.ensureDirSync(DAEMON_DATA_DIR);

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
                        if (cmd.includes('bridge-daemon.mjs')) {
                            console.log(`[Bridge Daemon] Found existing instance (PID: ${oldPid}). Sending SIGTERM...`);
                            process.kill(oldPid, 'SIGTERM');
                        } else {
                            console.log(`[Bridge Daemon] Stale PID file found. PID ${oldPid} used by a different process. Proceeding.`);
                            isAlive = false; // We won't wait for it to exit
                        }
                    } catch (psErr) {
                        console.log(`[Bridge Daemon] Could not verify process name. Sending SIGTERM to PID ${oldPid} to be safe...`);
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
                        console.log(`[Bridge Daemon] PID ${oldPid} did not exit after 3s. Escalating to SIGKILL...`);
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
            console.error('[Bridge Daemon] Failed to check existing PID file:', e);
        }
    }
    
    // Write new PID using atomic wx claim
    try {
        fs.writeFileSync(PID_FILE, process.pid.toString(), { encoding: 'utf8', flag: 'wx' });
    } catch (e) {
        if (e.code === 'EEXIST') {
            console.error(`[Bridge Daemon] Failed to claim PID file (EEXIST). Another instance started simultaneously. Exiting.`);
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
        console.error('[Bridge Daemon] Uncaught exception:', err);
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
            const messageNode = nodesMap.get(entity.source) || getDbNode(db, entity.source);
            if (messageNode && messageNode.label === 'MESSAGE') {
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
    }

    return null;
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
        breakdown += `\n- ${messages.length} new messages (latest: "${latest.subject}" from ${latest.from})`;
    }
    if (tasks.length > 0) {
        const latest = tasks[tasks.length - 1];
        breakdown += `\n- ${tasks.length} task transitions (latest: ${latest.newState} on task ${latest.taskId})`;
    }
    if (permissions.length > 0) {
        const latest = permissions[permissions.length - 1];
        breakdown += `\n- ${permissions.length} permissions granted (latest: ${latest.scope} by ${latest.grantedBy})`;
    }

    const windowDuration = Date.now() - windowStart;
    
    const digest = `[WAKE] ${N} events for ${identity}: ${breakdown}\n\nSubscription: ${subId}\nWindow: ${windowDuration}ms`;
    
    // Delivery to per-harness adapter
    await deliverDigest(subscription, digest);
}

/**
 * Promisified spawn wrapper for injection-safe execution
 */
function spawnAsync(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'ignore' });
        child.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`${command} exited with code ${code}`));
        });
        child.on('error', reject);
    });
}

/**
 * Delivers the digest to the correct adapter (tmux or osascript).
 */
async function deliverDigest(subscription, digest) {
    const meta = subscription.properties?.harnessTargetMetadata || {};
    // Fall back to osascript on macOS by default, tmux otherwise
    const defaultAdapter = process.platform === 'darwin' ? 'osascript' : 'tmux';
    const adapter = meta.adapter || defaultAdapter;

    try {
        if (adapter === 'tmux') {
            const tmuxSession = meta.tmuxSession || process.env.TMUX_SESSION || 'neo-agent';
            await spawnAsync('tmux', ['send-keys', '-t', tmuxSession, digest, 'C-m']);
            console.log(`[Bridge Daemon] Delivered ${subscription.id} via tmux to session ${tmuxSession}`);
        } else if (adapter === 'osascript') {
            const appName = meta.appName || 'Claude';
            let tabShortcut = meta.tabShortcut;
            // In April 2026, Claude Desktop features 3 main tabs: Chat (Cmd+1), Cowork (Cmd+2), and Code (Cmd+3).
            // We default to '3' to automatically switch to the Code tab for agentic tasks.
            // For Cursor, Cmd+L opens the Composer/Chat panel for agentic input.
            // Note: If tabShortcut is explicitly null, it is treated as a deliberate opt-out (no keystroke).
            if (tabShortcut === undefined) {
                if (appName === 'Claude') tabShortcut = '3';
                else if (appName === 'Cursor') tabShortcut = 'l';
            }
            
            const osascriptArgs = [
                '-e', 'on run argv',
                '-e', '  set wakePayload to (item 1 of argv)',
                '-e', '  try',
                '-e', '    set savedClipboard to the clipboard as string',
                '-e', '  on error',
                '-e', '    set savedClipboard to ""',
                '-e', '  end try',
                '-e', `  tell application "${appName}" to activate`,
                '-e', '  delay 0.5',
                '-e', '  tell application "System Events"',
                '-e', `    tell process "${appName}"`,
                '-e', '      set frontmost to true',
                '-e', '    end tell',
                '-e', '    delay 0.5',
                '-e', '    set currentApp to name of first application process whose frontmost is true',
                '-e', `    if currentApp is not "${appName}" then`,
                '-e', '      error "Target app failed to become frontmost"',
                '-e', '    end if',
                '-e', `    tell process "${appName}"`
            ];

            if (tabShortcut) {
                osascriptArgs.push('-e', `      keystroke "${tabShortcut}" using command down`);
                osascriptArgs.push('-e', '      delay 0.5');
            }

            osascriptArgs.push(
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
                '-e', '  set the clipboard to wakePayload',
                '-e', '  delay 0.2',
                '-e', '  tell application "System Events"',
                '-e', '    set currentApp to name of first application process whose frontmost is true',
                '-e', `    if currentApp is not "${appName}" then`,
                '-e', '      set the clipboard to savedClipboard',
                '-e', '      error "Target app lost frontmost status before paste"',
                '-e', '    end if',
                '-e', `    tell process "${appName}"`,
                '-e', '      keystroke "v" using command down',
                '-e', '      delay 0.5',
                '-e', '      key code 36',
                '-e', '      delay 1.0',
                '-e', '    end tell',
                '-e', '  end tell',
                '-e', '  if userInput is not "" then',
                '-e', '    set the clipboard to userInput',
                '-e', '    delay 0.2',
                '-e', '    tell application "System Events"',
                '-e', `      tell process "${appName}"`,
                '-e', '        keystroke "v" using command down',
                '-e', '      end tell',
                '-e', '    end tell',
                '-e', '  end if',
                '-e', '  delay 0.5',
                '-e', '  set the clipboard to savedClipboard',
                '-e', 'end run',
                digest
            );

            await spawnAsync('osascript', osascriptArgs);
            console.log(`[Bridge Daemon] Delivered ${subscription.id} via osascript to ${appName}`);
        } else if (adapter === 'test') {
            console.log(`[Bridge Daemon Test Adapter] Delivered ${subscription.id}: ${digest}`);
        } else {
            console.warn(`[Bridge Daemon] Unknown adapter '${adapter}' for subscription ${subscription.id}`);
        }
    } catch (err) {
        console.error(`[Bridge Daemon] Failed to deliver via ${adapter}:`, err.message);
    }
}

// Start loop
async function main() {
    await enforceSingleton();
    
    db = initializeDatabase(DB_PATH);
    
    // Read lastSyncId
    lastSyncId = getLastSyncId(db, STATE_FILE);
    
    console.log(`[Bridge Daemon] Started. Tail-syncing from GraphLog ID: ${lastSyncId}`);
    
    pollLoop();
}

main();

