export const MEMORY_CORE_GRAPH_DB_ENV = 'NEO_MEMORY_DB_PATH';

export const TURN_PRESENCE_ENV = Object.freeze({
    freshMs           : 'NEO_TURN_PRESENCE_FRESH_MS',
    ttlMs             : 'NEO_TURN_PRESENCE_TTL_MS',
    noteMaxChars      : 'NEO_TURN_PRESENCE_NOTE_MAX_CHARS',
    hookWriteTimeoutMs: 'NEO_TURN_PRESENCE_HOOK_WRITE_TIMEOUT_MS'
});

/**
 * The ceiling the harness registers for `turnPresenceHook.mjs`, in milliseconds.
 *
 * **This must stay equal to the `timeout` registered for that hook in `.claude/settings.json` AND
 * `.claude/settings.template.json`** (both express it in *seconds*: `"timeout": 2`). A spec asserts
 * the equality across all three, following `wakeArmingHook`'s precedent — two places holding one
 * number drift silently, and here the drift is invisible because exceeding the outer bound kills the
 * process rather than producing a report.
 * @type {Number}
 */
export const HOOK_TIMEOUT_MS = 2000;

/**
 * Everything inside the registered ceiling that the MCP exchange never gets: process spawn, node
 * boot, this module graph's import, and teardown after the exchange returns.
 *
 * Measured on the developer host at ~100ms wall for spawn-through-import (5 samples, 90–100ms, of
 * which ~50ms is the import itself). Reserved at 500ms rather than the measurement, because the
 * consequence of under-reserving is asymmetric: the exchange would still be running when the harness
 * kills the process, which produces no report at all — strictly worse than the named skip an
 * exceeded inner deadline gives.
 * @type {Number}
 */
export const HOOK_OVERHEAD_MARGIN_MS = 500;

/**
 * @summary The MCP exchange's budget, derived so the harness ceiling strictly exceeds it.
 *
 * **The constant was never the binding constraint — the ceiling is, and that is the finding.** This
 * budget used to be a free-standing `1500`, sized when the hook opened a local SQLite file and ran one
 * `INSERT`. It now bounds a four-stage network exchange (TCP connect, TLS handshake, MCP `initialize`,
 * `tools/call`), so the obvious repair is to raise it toward the 8000ms its siblings
 * (`readSubscriptionsOverMcp`, `recordTurnPresenceOverMcp`) declare for the same class of exchange.
 *
 * **That repair is unreachable here.** Those siblings run under a 15s `SessionStart` registration;
 * this hook runs on `UserPromptSubmit` and `PostToolUse` under a **2s** one, because it fires on every
 * prompt and every tool call. An 8000ms inner deadline would sit four times beyond a ceiling that
 * terminates the process first, converting a reportable skip into a silent kill.
 *
 * So the number stays 1500 and stops being a coincidence: it is now derived from the ceiling it must
 * respect, and the derivation fails loudly if either input moves. What remains genuinely unsolved is
 * that **no budget under a 2s ceiling can cover a cold TLS exchange to a remote plane** — that is a
 * property of running a synchronous network write on a per-tool-use hook, not of this constant, and
 * it needs a deployment-shape decision rather than a larger number.
 *
 * @param {Number} [hookTimeoutMs=HOOK_TIMEOUT_MS]
 * @param {Number} [overheadMarginMs=HOOK_OVERHEAD_MARGIN_MS]
 * @returns {Number} Milliseconds available to the exchange itself.
 */
export function resolveExchangeDeadlineMs(hookTimeoutMs = HOOK_TIMEOUT_MS, overheadMarginMs = HOOK_OVERHEAD_MARGIN_MS) {
    // Clamped on BOTH sides, however the pair is later retuned. A non-positive budget would make every
    // stage skip instantly and report a timeout that never happened; a budget at or above the ceiling
    // would be terminated by the harness instead of reported, which is the silent failure this whole
    // derivation exists to prevent. `wakeArmingHook`'s sibling clamps only the lower bound and can
    // therefore return a value EQUAL to its ceiling — deliberately not copied.
    return Math.max(1, Math.min(hookTimeoutMs - overheadMarginMs, hookTimeoutMs - 1))
}

export const TURN_PRESENCE_DEFAULTS = Object.freeze({
    freshMs     : 30 * 60 * 1000,
    ttlMs       : 60 * 60 * 1000,
    noteMaxChars: 512,
    // Named `hookWrite*` from when it bounded a local file write. The name is kept because it is an
    // operator-facing env override (`NEO_TURN_PRESENCE_HOOK_WRITE_TIMEOUT_MS`) that renaming would
    // break for anyone who set it; what it actually bounds is documented above.
    hookWriteTimeoutMs: resolveExchangeDeadlineMs()
});

function resolveNumber({env, key, fallback}) {
    const envName = TURN_PRESENCE_ENV[key],
          raw     = env[envName];

    if (raw === undefined || raw === null || raw === '') {
        return fallback;
    }

    const value = Number(raw);
    if (!Number.isFinite(value)) {
        throw new Error(`${envName} must be a finite number, got ${raw}`);
    }

    return value;
}

/**
 * @summary Resolves turn-presence runtime values from the shared env/default metadata.
 * @param {Object} options
 * @param {Object} [options.env=process.env] Environment source.
 * @returns {{freshMs:Number, ttlMs:Number, noteMaxChars:Number, hookWriteTimeoutMs:Number}}
 */
export function resolveTurnPresenceRuntimeConfig({env = process.env} = {}) {
    const config = Object.fromEntries(Object.entries(TURN_PRESENCE_DEFAULTS).map(([key, fallback]) => [
        key,
        resolveNumber({env, key, fallback})
    ]));

    for (const [key, value] of Object.entries(config)) {
        if (!Number.isFinite(value) || value <= 0) {
            throw new Error(`${TURN_PRESENCE_ENV[key]} must be a positive finite number, got ${value}`);
        }
    }

    return config;
}
