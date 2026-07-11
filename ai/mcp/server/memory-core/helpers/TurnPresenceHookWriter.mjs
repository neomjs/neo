import {randomUUID}    from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {
    resolveMemoryCoreGraphPath,
    resolveTurnPresenceRuntimeConfig
} from './TurnPresenceConfig.mjs';
import {normalizeAgentIdentityNodeId} from '../../../../graph/normalizeAgentIdentityNodeId.mjs';

const WAKE_SUBMIT_NONCE_PATTERN = /NEO_WAKE_SUBMIT_NONCE:([0-9a-fA-F-]{36})/;

function coerceDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid turn presence timestamp: ${value}`);
    }
    return date;
}

function normalizeWakeSubmitNonce(value) {
    if (!value || typeof value !== 'string') return null;

    const trimmed = value.trim();
    return /^[0-9a-fA-F-]{36}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

function buildTurnPresenceId(agentIdentity, turnId) {
    return `AGENT_TURN_PRESENCE:${agentIdentity}:${turnId}`;
}

function getTurnPresenceProperties(db, nodeId) {
    const row = db.prepare('SELECT data FROM Nodes WHERE id = ?').get(nodeId);
    if (!row?.data) return null;

    try {
        return JSON.parse(row.data).properties || null;
    } catch {
        return null;
    }
}

function findNewestActiveTurnId(db, agentIdentity, nowIso) {
    const row = db.prepare(`
        SELECT data FROM Nodes
        WHERE (
            json_extract(data, '$.label') = 'AGENT_TURN_PRESENCE'
            OR json_extract(data, '$.type') = 'AGENT_TURN_PRESENCE'
        )
          AND json_extract(data, '$.properties.agentIdentity') = ?
          AND COALESCE(json_extract(data, '$.properties.status'), 'active') = 'active'
          AND (
            json_extract(data, '$.properties.expiresAt') IS NULL
            OR json_extract(data, '$.properties.expiresAt') > ?
          )
        ORDER BY json_extract(data, '$.properties.lastProgressAt') DESC
        LIMIT 1
    `).get(agentIdentity, nowIso);

    if (!row?.data) return null;

    try {
        return JSON.parse(row.data).properties?.turnId || null;
    } catch {
        return null;
    }
}

async function withTimeout(promise, timeoutMs) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('turn presence hook timed out')), timeoutMs);
                timer.unref?.();
            })
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function writeTurnPresenceEvent({
    action,
    agentIdentity,
    dbPath,
    freshMs,
    note,
    noteMaxChars,
    now,
    source,
    terminalState,
    ttlMs,
    turnId,
    wakeSubmitNonce
}) {
    const {default: Database} = await import('better-sqlite3');
    const db                  = new Database(dbPath, {fileMustExist: true});

    try {
        const hasNodesTable = db.prepare(`
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name = 'Nodes'
            LIMIT 1
        `).get();
        if (!hasNodesTable) return {status: 'noop', reason: 'missing-nodes-table', action, agentIdentity};

        const nowDate      = coerceDate(now),
              nowIso       = nowDate.toISOString(),
              targetTurnId = turnId || (action === 'start'
                  ? randomUUID()
                  : findNewestActiveTurnId(db, agentIdentity, nowIso));

        if (!targetTurnId) {
            return {status: 'noop', reason: 'no-active-turn', action, agentIdentity};
        }

        const nodeId     = buildTurnPresenceId(agentIdentity, targetTurnId),
              current    = getTurnPresenceProperties(db, nodeId) || {},
              startedAt  = current.startedAt || nowIso,
              properties = {
                  ...current,
                  agentIdentity,
                  turnId        : targetTurnId,
                  startedAt,
                  lastProgressAt: nowIso,
                  freshUntil    : new Date(nowDate.getTime() + freshMs).toISOString(),
                  expiresAt     : new Date(nowDate.getTime() + ttlMs).toISOString(),
                  terminalState : action === 'terminal' ? terminalState : null,
                  status        : action === 'terminal' ? 'terminal' : 'active',
                  source,
                  note          : typeof note === 'string' ? note.slice(0, noteMaxChars) : null,
                  updatedAt     : nowIso,
                  userId        : agentIdentity,
                  sharedEntity  : false,
                  ...(wakeSubmitNonce ? {wakeSubmitNonce} : {})
              },
              node       = {
                  id   : nodeId,
                  label: 'AGENT_TURN_PRESENCE',
                  type : 'AGENT_TURN_PRESENCE',
                  name : `TurnPresence ${agentIdentity}`,
                  properties
              };

        db.prepare(`
            INSERT INTO Nodes (id, user_id, data)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data = excluded.data, user_id = excluded.user_id
        `).run(nodeId, agentIdentity, JSON.stringify(node));

        return {
            ...properties,
            status: 'recorded',
            action,
            id    : nodeId
        };
    } finally {
        db.close();
    }
}

/**
 * @summary Extracts a wake-submit nonce from hook payload text.
 * @param {*} value Hook payload value.
 * @param {Number} [depth=0] Recursion guard for nested payloads.
 * @returns {String|null}
 */
export function extractWakeSubmitNonce(value, depth = 0) {
    if (depth > 8 || value == null) return null;

    if (typeof value === 'string') {
        const match = value.match(WAKE_SUBMIT_NONCE_PATTERN);
        return normalizeWakeSubmitNonce(match?.[1]);
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const nonce = extractWakeSubmitNonce(item, depth + 1);
            if (nonce) return nonce;
        }
        return null;
    }

    if (typeof value === 'object') {
        for (const item of Object.values(value)) {
            const nonce = extractWakeSubmitNonce(item, depth + 1);
            if (nonce) return nonce;
        }
    }

    return null;
}

/**
 * @summary Reads a hook event payload from stdin.
 * @param {Object} [options]
 * @param {NodeJS.ReadStream} [options.stdin=process.stdin]
 * @returns {Promise<String>}
 */
export function readHookPayload({stdin = process.stdin} = {}) {
    if (stdin.isTTY) return Promise.resolve('');

    return new Promise((resolve, reject) => {
        let data = '';

        stdin.setEncoding('utf8');
        stdin.on('data',  chunk => data += chunk);
        stdin.on('end',   ()    => resolve(data));
        stdin.on('error', reject);
    });
}

/**
 * @summary Emits a fail-soft turn-presence hook write without importing Neo singletons.
 * @param {Object} options
 * @param {'start'|'progress'|'terminal'} [options.action='start'] Event kind.
 * @param {Object} [options.env=process.env] Environment source.
 * @param {*} [options.hookPayload] Raw hook payload, used for optional wake nonce extraction.
 * @param {String} [options.note] Bounded diagnostic note.
 * @param {String|Date|Number} [options.now=new Date()] Clock override for tests.
 * @param {String} [options.rootDir] Repository root.
 * @param {String} [options.source='harness-hook'] Hook source identifier.
 * @param {'completed'|'blocked'|'aborted'|'stale'} [options.terminalState='completed'] Terminal state.
 * @param {String} [options.turnId] Stable active-turn identifier.
 * @param {String} [options.wakeSubmitNonce] Optional explicit wake-submit nonce.
 * @returns {Promise<Object>|undefined}
 */
export async function recordTurnPresenceFromHook({
    action = 'start',
    env = process.env,
    hookPayload,
    note,
    now = new Date(),
    rootDir = fileURLToPath(new URL('../../../../../', import.meta.url)),
    source = 'harness-hook',
    terminalState = 'completed',
    turnId,
    wakeSubmitNonce = extractWakeSubmitNonce(hookPayload)
} = {}) {
    const agentIdentity = normalizeAgentIdentityNodeId(env.NEO_AGENT_IDENTITY);
    if (!agentIdentity) return;

    const validActions = ['start', 'progress', 'terminal'];
    if (!validActions.includes(action)) {
        throw new Error(`Invalid turn presence action '${action}'. Must be one of: ${validActions.join(', ')}.`);
    }

    const {freshMs, ttlMs, noteMaxChars, hookWriteTimeoutMs: timeoutMs} = resolveTurnPresenceRuntimeConfig({env});
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return;

    return withTimeout(writeTurnPresenceEvent({
        action,
        agentIdentity,
        dbPath: resolveMemoryCoreGraphPath({env, rootDir}),
        freshMs,
        note,
        noteMaxChars,
        now,
        source,
        terminalState,
        ttlMs,
        turnId,
        wakeSubmitNonce
    }), timeoutMs);
}
