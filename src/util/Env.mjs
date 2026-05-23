/**
 * Pure value-decoders for environment-variable substrate.
 *
 * Substrate-tier landing: env-parser primitive at Neo.util.X namespace (Tier-1 Neo substrate),
 * NOT on domain classes. Consolidates `ai/mcp/server/shared/helpers/EnvConfig.mjs`
 * (was Tier-2 MCP-shared), `ai/daemons/services/CadenceEngine.parseInterval` (was Tier-3
 * domain), and `ai/daemons/services/PrimaryRepoSyncService.parseEnabledFlag` (was Tier-3
 * domain).
 *
 * Decoders know NOTHING about specific configs, defaults, or domain consumers — they only
 * answer "env var absent (undefined) / decoded value / invalid (warn + undefined)". Fallback
 * policy lives at the consumer call-site (e.g., `Env.parseNumber(process.env.X, 'X') ?? AiConfig.X`).
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
     * Bulk-apply env→config bindings.
     *
     * Binding shapes:
     * - `{<dotted.path>: <envVarName>}` — implicit `parseString` parser
     * - `{<dotted.path>: {var: <envVarName>, parse: <parserFn>}}` — typed parser
     *
     * Bindings whose env var is absent or whose parser returns undefined are skipped
     * (leaves the existing `data` value untouched). Uses `Neo.ns()` for namespace-walk;
     * warns + skips if an intermediate is not an object.
     *
     * Note: binding paths are developer-authored at source level (NOT env-value-derived);
     * env values become typed leaf values via the parser, never path keys. No prototype-
     * pollution attack surface from env input.
     *
     * @param {Object} data Mutable config object.
     * @param {Object} envBindings Path → binding map.
     * @param {Object} [env=process.env]
     * @param {Function} [warn=console.warn]
     */
    applyEnvBindings(data, envBindings, env = process.env, warn = console.warn) {
        for (const [path, binding] of Object.entries(envBindings)) {
            const { var: varName, parse } = typeof binding === 'string'
                ? { var: binding, parse: Env.parseString }
                : binding;

            const raw = env[varName];
            if (Neo.isEmpty(raw)) continue;

            const result = parse(raw, varName, warn);
            if (result === undefined) continue;

            const keys     = path.split('.');
            const finalKey = keys.pop();
            const parent   = keys.length ? Neo.ns(keys, false, data) : data;

            if (Neo.isObject(parent)) {
                parent[finalKey] = result;
            } else {
                warn(`[Neo.util.Env] Cannot bind ${varName} to "${path}" — intermediate is not an object.`);
            }
        }
    },

    /**
     * Decode env value as boolean.
     *
     * Token semantics (case-insensitive, trimmed):
     * - true:  `'true'`, `'yes'`, `'on'`, `'1'`
     * - false: `'false'`, `'no'`, `'off'`, `'0'`
     * - other: warn + undefined
     *
     * @param {String|undefined} rawValue
     * @param {String} envVarName
     * @param {Function} [warn=console.warn]
     * @returns {Boolean|undefined}
     */
    parseBool(rawValue, envVarName, warn = console.warn) {
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
     * load-bearing for the `Env.parseNumber(...) ?? AiConfig.X` consumer pattern.
     *
     * @param {String|undefined} rawValue
     * @param {String} envVarName
     * @param {Function} [warn=console.warn]
     * @returns {Number|undefined}
     */
    parseNumber(rawValue, envVarName, warn = console.warn) {
        if (Neo.isEmpty(rawValue)) return;
        const num = Number(rawValue);
        if (!Number.isFinite(num)) {
            warn(`[Neo.util.Env] Invalid ${envVarName}="${rawValue}" (must be a finite number); falling back.`);
            return;
        }
        return num;
    },

    /**
     * Decode env value as port (integer 1..65535).
     * @param {String|undefined} rawValue
     * @param {String} envVarName
     * @param {Function} [warn=console.warn]
     * @returns {Number|undefined}
     */
    parsePort(rawValue, envVarName, warn = console.warn) {
        if (Neo.isEmpty(rawValue)) return;
        const num = Number(rawValue);
        if (!Number.isInteger(num) || num <= 0 || num > 65535) {
            warn(`[Neo.util.Env] Invalid ${envVarName}="${rawValue}" (must be integer in 1..65535); falling back.`);
            return;
        }
        return num;
    },

    /**
     * Identity passthrough — signals "we explicitly want the raw string".
     * @param {String|undefined} rawValue
     * @returns {String|undefined}
     */
    parseString(rawValue) {
        return rawValue;
    },

    /**
     * Decode env value as URL, normalized (trailing slash stripped).
     * @param {String|undefined} rawValue
     * @param {String} envVarName
     * @param {Function} [warn=console.warn]
     * @returns {String|undefined}
     */
    parseUrl(rawValue, envVarName, warn = console.warn) {
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
