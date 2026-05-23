import 'dotenv/config';
import Env from '../../src/util/Env.mjs';

/**
 * Single declaration per env var: name → parser. Adding a new env var means
 * one entry here, then `env.<NAME>` everywhere downstream. Renaming an env var
 * means one edit here — consumers reference the canonical key, not the literal
 * string at every call-site.
 *
 * @type {Object<String, Function>}
 */
const bindings = {
    NEO_ORCHESTRATOR_POLL_INTERVAL_MS                   : Env.parseNumber,
    NEO_ORCHESTRATOR_SUMMARY_SWEEP_INTERVAL_MS          : Env.parseNumber,
    NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS                : Env.parseNumber,
    NEO_ORCHESTRATOR_BACKUP_INTERVAL_MS                 : Env.parseNumber,
    NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_INTERVAL_MS       : Env.parseNumber,
    NEO_ORCHESTRATOR_DREAM_INTERVAL_MS                  : Env.parseNumber,
    NEO_ORCHESTRATOR_GOLDEN_PATH_INTERVAL_MS            : Env.parseNumber,
    NEO_ORCHESTRATOR_SWARM_HEARTBEAT_INTERVAL_MS        : Env.parseNumber,
    NEO_ORCHESTRATOR_KB_SYNC_ENABLED                    : Env.parseBool,
    NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED           : Env.parseBool,
    NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED              : Env.parseBool,
    NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED            : Env.parseBool,
    NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED: Env.parseBool
};

/**
 * @summary Builds a typed env-var registry from a name → parser binding map.
 *
 * Iterates bindings, runs each parser against the source env, returns an object
 * keyed by env-var name with decoded values. Absent or invalid values map to
 * `undefined` so consumers can chain with `??` against config defaults.
 *
 * @param {Object} options
 * @param {Object<String, Function>} options.bindings env-var name → parser function.
 * @param {Object} [options.source=process.env] Source env object (override for tests).
 * @returns {Object<String, *>}
 */
export function buildEnv({bindings: bindingMap, source = process.env}) {
    const result = {};
    for (const [name, parse] of Object.entries(bindingMap)) {
        result[name] = parse(source[name], name);
    }
    return result;
}

/**
 * Eager-bound env-var registry. Loaded once at module load (after `dotenv/config`
 * has merged any local `.env` file into `process.env`). Consumers import this
 * default export and reference `env.NEO_X` instead of `Env.parseX(process.env.X, 'X')`.
 *
 * @example
 * import env from 'neo.mjs/ai/config/env.mjs';
 * get pollIntervalMs() {
 *     return env.NEO_ORCHESTRATOR_POLL_INTERVAL_MS ?? AiConfig.orchestrator.intervals.pollMs;
 * }
 *
 * @type {Object<String, *>}
 */
const env = buildEnv({bindings});

export default env;
export {bindings};
