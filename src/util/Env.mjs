/**
 * Pure value-decoders for environment-variable substrate.
 *
 * Substrate-tier landing: env-parser primitive at Neo.util.X namespace (Tier-1 Neo substrate),
 * NOT on domain classes. The canonical home for env-parsing across the agent OS — MCP
 * server config.templates, orchestrator getters, and any other env-var consumer.
 *
 * **Single-source-of-name discipline:** every parser takes the `envVarName` as its
 * first argument and reads `env[envVarName]` internally. The canonical 2-value chain
 * is `Env.parseX('NEO_X') ?? AiConfig.X` — the env var name appears ONCE per consumer
 * call site. The earlier `Env.parseX(process.env.NEO_X, 'NEO_X')` shape duplicated the
 * name at every call site (anti-pattern); refactored 2026-05-24 after operator surfaced
 * the regression on Lane A PR #11876.
 *
 * Decoders know NOTHING about specific configs, defaults, or domain consumers — they only
 * answer "env var absent (undefined) / decoded value / invalid (warn + undefined)". Fallback
 * policy lives at the consumer call-site as `Env.parseX('NEO_X') ?? AiConfig.X`. MCP
 * server config templates use the bulk `Env.applyEnvBindings(data, envBindings, env?, warn?)`
 * shape (binding form names each var once).
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
     * Binding shapes mirror the config object shape:
     * - `{auth: {host: <envVarName>}}` — implicit `parseString` parser
     * - `{auth: {port: {var: <envVarName>, parse: <parserFn>}}}` — typed parser
     *
     * Bindings whose env var is absent or whose parser returns undefined are skipped
     * (leaves the existing `data` value untouched). Uses `Neo.assignToNs()` for the
     * final assignment; warns + skips if an intermediate is not an object.
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
        const applyBinding = (path, binding) => {
            const {var: varName, parse = Env.parseString} = typeof binding === 'string'
                ? {var: binding, parse: Env.parseString}
                : binding;

            const result = parse(varName, {env, warn});
            if (result === undefined) return;

            const parentPath = path.slice(0, -1),
                  parent     = parentPath.length ? Neo.ns(parentPath, false, data) : data;

            if (Neo.isObject(parent)) {
                Neo.assignToNs(path, result, data);
            } else {
                warn(`[Neo.util.Env] Cannot bind ${varName} to "${path.join('.')}" — intermediate is not an object.`);
            }
        };

        const walk = (bindings, path = []) => {
            for (const [key, binding] of Object.entries(bindings)) {
                const isBindingDescriptor = Neo.isObject(binding) && Object.prototype.hasOwnProperty.call(binding, 'var');

                if (key.includes('.')) {
                    throw new Error(`[Neo.util.Env] Dotted envBinding paths are not supported: "${path.concat(key).join('.')}". Use nested binding objects.`);
                }

                if (typeof binding === 'string' || isBindingDescriptor) {
                    applyBinding(path.concat(key), binding);
                } else if (Neo.isObject(binding)) {
                    walk(binding, path.concat(key));
                }
            }
        };

        walk(envBindings);
    },

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
     * load-bearing for the `Env.parseNumber('NEO_X') ?? AiConfig.X` consumer pattern.
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
