/**
 * Internal typed-parser registry for `Neo.ai.ConfigProvider`.
 *
 * Each parser reads `env[envVarName]` and decodes it to a typed value, answering exactly one
 * question: "env var absent (undefined) / decoded value / invalid (warn + undefined)". The
 * decoders know NOTHING about specific configs, defaults, or domain consumers.
 *
 * **Not consumer-facing.** These parsers are the env-decode layer that `ConfigProvider` wires into
 * its meta-leaf registry: a `leaf(default, 'NEO_X', type)` resolves its env override through the
 * `type`-keyed parser here. Application code does NOT call `Env.parseX` directly — it reads the
 * resolved value via the Provider-extending aiConfig substrate (`AiConfig.<path>`), which layers
 * the env override over the config default. See `learn/agentos/AiConfigModel.md`.
 *
 * Uses the gatekeep pattern (lightweight stateless utility — no Base inheritance, no
 * reactive configs, no lifecycle hooks), mirroring `src/core/IdGenerator.mjs` precedent.
 *
 * @namespace Neo.util.Env
 */
const Env = {
    /**
     * Tokens accepted as `true` by `parseBool` (case-insensitive after trim).
     * Covers both MCP (`'true'`) and daemon (`'yes'`/`'on'`/`'1'`) conventions.
     * @member {String[]} TRUE_TOKENS
     */
    TRUE_TOKENS: ['true', 'yes', 'on', '1'],

    /**
     * Tokens accepted as `false` by `parseBool` (case-insensitive after trim).
     * Preserves `PrimaryRepoSyncService.parseEnabledFlag` legacy semantics
     * (`'0'` / `'false'` / `'no'` / `'off'` → false).
     * @member {String[]} FALSE_TOKENS
     */
    FALSE_TOKENS: ['false', 'no', 'off', '0'],

    /**
     * Decode env value as boolean.
     *
     * Token semantics (case-insensitive, trimmed):
     * - true:  `'true'`, `'yes'`, `'on'`, `'1'`
     * - false: `'false'`, `'no'`, `'off'`, `'0'`
     * - other: warn + undefined
     *
     * @param {String} envVarName
     * @param {Object} [opts]
     * @param {Object} [opts.env=process.env]
     * @param {Function} [opts.warn=console.warn]
     * @returns {Boolean|undefined}
     */
    parseBool(envVarName, {env = process.env, warn = console.warn} = {}) {
        const rawValue = env[envVarName];
        if (Neo.isEmpty(rawValue)) return;
        const normalized = String(rawValue).trim().toLowerCase();
        if (Env.TRUE_TOKENS.includes(normalized))  return true;
        if (Env.FALSE_TOKENS.includes(normalized)) return false;
        warn(`[Neo.util.Env] Invalid ${envVarName}="${rawValue}" (must be one of true/false/yes/no/on/off/1/0); falling back.`);
    },

    /**
     * Decode env value as a finite number.
     *
     * Note: `Number(undefined)` returns `NaN` (not undefined), and `NaN ?? fallback` does
     * NOT fire `??` (only fires on nullish). The undefined-return for absent input is
     * load-bearing so a nullish-coalescing env-override fallback fires (a `NaN` would not).
     *
     * @param {String} envVarName
     * @param {Object} [opts]
     * @param {Object} [opts.env=process.env]
     * @param {Function} [opts.warn=console.warn]
     * @returns {Number|undefined}
     */
    parseNumber(envVarName, {env = process.env, warn = console.warn} = {}) {
        const rawValue = env[envVarName];
        if (Neo.isEmpty(rawValue)) return;
        const num = Number(rawValue);
        if (!Number.isFinite(num)) {
            warn(`[Neo.util.Env] Invalid ${envVarName}="${rawValue}" (must be a finite number); falling back.`);
            return;
        }
        return num;
    },

    /**
     * Decode provider keep-alive values.
     *
     * Numeric tokens stay numeric so `-1` (keep resident) and `0` (unload after
     * request) survive env binding without becoming opaque strings. Duration-style
     * tokens such as `10m` or `1h` pass through unchanged for providers that accept
     * human-readable retention windows.
     *
     * @param {String} envVarName
     * @param {Object} [opts]
     * @param {Object} [opts.env=process.env]
     * @returns {Number|String|undefined}
     */
    parseKeepAlive(envVarName, {env = process.env} = {}) {
        const rawValue = env[envVarName];
        if (Neo.isEmpty(rawValue)) return;

        const value = String(rawValue).trim();
        if (!value) return;

        const num = Number(value);
        return Number.isFinite(num) ? num : value;
    },

    /**
     * Decode env value as a comma-separated string list.
     *
     * Empty items are ignored so operators can format values as
     * `client-a, client-b` without introducing blank allowlist entries.
     *
     * @param {String} envVarName
     * @param {Object} [opts]
     * @param {Object} [opts.env=process.env]
     * @returns {String[]|undefined}
     */
    parseCsv(envVarName, {env = process.env} = {}) {
        const rawValue = env[envVarName];
        if (Neo.isEmpty(rawValue)) return;

        return String(rawValue)
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
    },

    /**
     * Decode env value as port (integer 1..65535).
     * @param {String} envVarName
     * @param {Object} [opts]
     * @param {Object} [opts.env=process.env]
     * @param {Function} [opts.warn=console.warn]
     * @returns {Number|undefined}
     */
    parsePort(envVarName, {env = process.env, warn = console.warn} = {}) {
        const rawValue = env[envVarName];
        if (Neo.isEmpty(rawValue)) return;
        const num = Number(rawValue);
        if (!Number.isInteger(num) || num <= 0 || num > 65535) {
            warn(`[Neo.util.Env] Invalid ${envVarName}="${rawValue}" (must be integer in 1..65535); falling back.`);
            return;
        }
        return num;
    },

    /**
     * Identity passthrough — reads `env[envVarName]` and returns the raw string (or
     * undefined if absent/empty). Signals "we explicitly want the raw string".
     * @param {String} envVarName
     * @param {Object} [opts]
     * @param {Object} [opts.env=process.env]
     * @returns {String|undefined}
     */
    parseString(envVarName, {env = process.env} = {}) {
        const rawValue = env[envVarName];
        if (Neo.isEmpty(rawValue)) return;
        return rawValue;
    },

    /**
     * Decode env value as URL, normalized (trailing slash stripped).
     * @param {String} envVarName
     * @param {Object} [opts]
     * @param {Object} [opts.env=process.env]
     * @param {Function} [opts.warn=console.warn]
     * @returns {String|undefined}
     */
    parseUrl(envVarName, {env = process.env, warn = console.warn} = {}) {
        const rawValue = env[envVarName];
        if (Neo.isEmpty(rawValue)) return;
        try {
            const url = new URL(rawValue);
            return url.href.endsWith('/') ? url.href.slice(0, -1) : url.href;
        } catch (e) {
            warn(`[Neo.util.Env] Invalid ${envVarName}="${rawValue}" (must be a valid URL); falling back.`);
        }
    }
};

export default Neo.gatekeep(Env, 'Neo.util.Env');
