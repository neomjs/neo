export const MEMORY_CORE_GRAPH_DB_ENV = 'NEO_MEMORY_DB_PATH';

export const TURN_PRESENCE_ENV = Object.freeze({
    freshMs           : 'NEO_TURN_PRESENCE_FRESH_MS',
    ttlMs             : 'NEO_TURN_PRESENCE_TTL_MS',
    noteMaxChars      : 'NEO_TURN_PRESENCE_NOTE_MAX_CHARS',
    hookWriteTimeoutMs: 'NEO_TURN_PRESENCE_HOOK_WRITE_TIMEOUT_MS'
});

export const TURN_PRESENCE_DEFAULTS = Object.freeze({
    freshMs           : 30 * 60 * 1000,
    ttlMs             : 60 * 60 * 1000,
    noteMaxChars      : 512,
    hookWriteTimeoutMs: 1500
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
