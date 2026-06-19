import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
    resolveMemoryCoreGraphPath,
    resolveTurnPresenceRuntimeConfig
} from '../../ai/mcp/server/memory-core/helpers/TurnPresenceConfig.mjs';

function normalizeAgentIdentity(value) {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
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

/**
 * @summary Emits a fail-soft Codex turn-start beacon without importing Neo singletons.
 * @param {Object} options
 * @param {Object} [options.env=process.env] Environment source.
 * @param {String} [options.rootDir] Repository root.
 * @returns {Promise<void>|undefined}
 */
export async function recordTurnStarted({
    env = process.env,
    rootDir = fileURLToPath(new URL('../../', import.meta.url))
} = {}) {
    const agentIdentity = normalizeAgentIdentity(env.NEO_AGENT_IDENTITY);
    if (!agentIdentity) return;

    const {freshMs, ttlMs, noteMaxChars, hookWriteTimeoutMs: timeoutMs} = resolveTurnPresenceRuntimeConfig({env});
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return;

    return withTimeout(writeTurnStarted({
        agentIdentity,
        dbPath: resolveMemoryCoreGraphPath({env, rootDir}),
        freshMs,
        noteMaxChars,
        ttlMs
    }), timeoutMs);
}

async function writeTurnStarted({agentIdentity, dbPath, freshMs, noteMaxChars, ttlMs}) {
    const {default: Database} = await import('better-sqlite3');
    const db = new Database(dbPath, {fileMustExist: true});

    try {
        const hasNodesTable = db.prepare(`
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name = 'Nodes'
            LIMIT 1
        `).get();
        if (!hasNodesTable) return;

        const nowDate = new Date(),
              nowIso  = nowDate.toISOString(),
              turnId  = randomUUID(),
              nodeId  = `AGENT_TURN_PRESENCE:${agentIdentity}:${turnId}`,
              note    = 'codex UserPromptSubmit'.slice(0, noteMaxChars),
              node    = {
                  id        : nodeId,
                  label     : 'AGENT_TURN_PRESENCE',
                  properties: {
                      agentIdentity,
                      turnId,
                      startedAt     : nowIso,
                      lastProgressAt: nowIso,
                      freshUntil    : new Date(nowDate.getTime() + freshMs).toISOString(),
                      expiresAt     : new Date(nowDate.getTime() + ttlMs).toISOString(),
                      terminalState : null,
                      status        : 'active',
                      source        : 'codex-user-prompt-submit',
                      note,
                      updatedAt     : nowIso,
                      userId        : agentIdentity,
                      sharedEntity  : false
                  }
              };

        db.prepare(`
            INSERT INTO Nodes (id, user_id, data)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data = excluded.data, user_id = excluded.user_id
        `).run(nodeId, agentIdentity, JSON.stringify(node));
    } finally {
        db.close();
    }
}

/**
 * @summary Reads the repo-local Codex context payload injected at prompt submit.
 * @returns {String}
 */
export function readCodexContext() {
    const contextUrl = new URL('../CODEX.md', import.meta.url);
    return readFileSync(contextUrl, 'utf8').trim();
}

async function main() {
    await recordTurnStarted().catch(() => {});

    const context = readCodexContext();

    if (context) {
        process.stdout.write(`${context}\n`);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
