import {recordTurnPresenceOverMcp}        from './recordTurnPresenceOverMcp.mjs';
import {resolveTurnPresenceRuntimeConfig} from './TurnPresenceConfig.mjs';
import {normalizeAgentIdentityNodeId}     from '../../../../graph/normalizeAgentIdentityNodeId.mjs';

const WAKE_SUBMIT_NONCE_PATTERN = /NEO_WAKE_SUBMIT_NONCE:([0-9a-fA-F-]{36})/;

function normalizeWakeSubmitNonce(value) {
    if (!value || typeof value !== 'string') return null;

    const trimmed = value.trim();
    return /^[0-9a-fA-F-]{36}$/.test(trimmed) ? trimmed.toLowerCase() : null;
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
 * @summary Emits a turn-presence beacon into the store the deployment serves, without importing Neo
 * singletons.
 *
 * ## Why this goes over the service instead of opening the store
 *
 * The earlier implementation resolved `rootDir` from `import.meta.url` and opened the resulting path
 * with `better-sqlite3`. Both halves were wrong together: the path followed whichever *checkout* the
 * hook file physically lived in, and the write **succeeded** there. In a containerized deployment the
 * served graph is a Docker named volume with no host-visible path, so every beacon landed in a private
 * file no reader ever queries — and nothing failed, because a writable SQLite file accepts writes
 * happily. Measured before this changed: 7192 accumulated intervals from 9 distinct agents in one
 * maintainer checkout, none of them readable — and their newest timestamps spread across four separate
 * days, because each seat writes the checkout its own hook file lives in.
 *
 * That is why an unreachable plane must produce a **named skip** here rather than any fallback write.
 * A beacon in a store nobody reads is strictly worse than no beacon at all: it makes an unmeasured
 * state look measured, which is the failure this whole path is being repaired for.
 *
 * ## The freshness policy deliberately does not live here any more
 *
 * `freshMs` / `ttlMs` / `noteMaxChars` were previously resolved hook-side and written into the node.
 * The service owns those bounds, so computing them again here was a second copy of a policy that only
 * one party is authoritative for. It now sends the event and lets the server stamp the interval.
 *
 * @param {Object} options
 * @param {Object} options.plane Injected `{baseUrl, credential}` for the deployment's Memory Core. The
 * hook adapter is the entrypoint that resolves these; this module reads no config of its own.
 * @param {'start'|'progress'|'terminal'} [options.action='start'] Event kind.
 * @param {Object} [options.env=process.env] Environment source.
 * @param {*} [options.hookPayload] Raw hook payload, used for optional wake nonce extraction.
 * @param {String} [options.note] Bounded diagnostic note.
 * @param {String|Date|Number} [options.now] Clock override for tests.
 * @param {Function} [options.record=recordTurnPresenceOverMcp] Transport seam.
 * @param {String} [options.source='harness-hook'] Hook source identifier.
 * @param {'completed'|'blocked'|'aborted'|'stale'} [options.terminalState='completed'] Terminal state.
 * @param {String} [options.turnId] Stable active-turn identifier; the server resolves it when omitted.
 * @param {String} [options.wakeSubmitNonce] Optional explicit wake-submit nonce.
 * @returns {Promise<Object>} `{status}` — `recorded`, or `skipped` with a `reason` naming what was
 * missing. Never a silent success.
 */
export async function recordTurnPresenceFromHook({
    plane,
    action = 'start',
    env = process.env,
    hookPayload,
    note,
    now,
    record = recordTurnPresenceOverMcp,
    source = 'harness-hook',
    terminalState = 'completed',
    turnId,
    wakeSubmitNonce = extractWakeSubmitNonce(hookPayload)
} = {}) {
    const agentIdentity = normalizeAgentIdentityNodeId(env.NEO_AGENT_IDENTITY);

    if (!agentIdentity) {
        return {status: 'skipped', reason: 'no NEO_AGENT_IDENTITY in the hook environment', action};
    }

    const validActions = ['start', 'progress', 'terminal'];
    if (!validActions.includes(action)) {
        throw new Error(`Invalid turn presence action '${action}'. Must be one of: ${validActions.join(', ')}.`);
    }

    const baseUrl = String(plane?.baseUrl ?? '').trim();

    // A named skip, never a guessed endpoint: an unconfigured plane is a state the caller can express,
    // and guessing localhost would either fail obscurely or publish against whatever is listening.
    if (!baseUrl) {
        return {
            status: 'skipped',
            reason: 'no Memory Core plane is configured, so there is no served store to record presence in',
            action,
            agentIdentity
        };
    }

    const {hookWriteTimeoutMs: timeoutMs} = resolveTurnPresenceRuntimeConfig({env});
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return {status: 'skipped', reason: 'turn-presence hook write timeout is not configured', action, agentIdentity};
    }

    const recorded = await record({
        baseUrl,
        identity  : agentIdentity,
        credential: plane?.credential ?? '',
        deadlineMs: timeoutMs,
        action,
        note,
        source,
        wakeSubmitNonce,
        ...(now           !== undefined ? {now}           : {}),
        ...(turnId        !== undefined ? {turnId}        : {}),
        ...(action === 'terminal'       ? {terminalState} : {})
    });

    return {...recorded, status: recorded?.status ?? 'recorded', action};
}
