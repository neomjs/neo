import os              from 'node:os';
import path            from 'node:path';
import {pathToFileURL} from 'node:url';

import {armSeatWakeRoute}         from '../../ai/daemons/wake/armSeatWakeRoute.mjs';
import {readSubscriptionsOverMcp} from '../../ai/daemons/wake/readSubscriptionsOverMcp.mjs';

/**
 * Where the wake receiver reads its route table. Matches the `--manifest` the running receiver is
 * launched with, so publishing here is what the receiver picks up — it watches this file's directory,
 * making a successful publish its own reload trigger.
 * @type {String}
 */
export const DEFAULT_MANIFEST_RELATIVE = 'Library/Application Support/Neo/AgentOS/wake/routes.json';

/**
 * Budget for the whole MCP exchange, and the publication margin left after it.
 *
 * These exist as one derived pair rather than two unrelated numbers because that is exactly how the
 * first version was wrong: the hook's registered timeout was 15s while the reader allowed 8s to connect
 * and another 8s to list, so a slow plane could consume the caller's entire budget and be killed AFTER
 * reading subscriptions and BEFORE publishing — the worst possible moment to stop. `HOOK_TIMEOUT_MS`
 * must stay equal to the `timeout` registered in `.claude/settings.template.json`; a spec asserts it,
 * because two places holding the same number silently drift.
 * @type {Number}
 */
export const HOOK_TIMEOUT_MS = 15000;

/**
 * Margin reserved for deriving the tuple, writing the temp file, publishing the manifest, and process
 * teardown — everything after the exchange returns.
 * @type {Number}
 */
export const PUBLISH_MARGIN_MS = 5000;

/**
 * @summary The MCP exchange's total budget, derived so the outer deadline strictly exceeds inner work.
 * @param {Number} [hookTimeoutMs=HOOK_TIMEOUT_MS]
 * @param {Number} [publishMarginMs=PUBLISH_MARGIN_MS]
 * @returns {Number}
 */
export function resolveExchangeDeadlineMs(hookTimeoutMs = HOOK_TIMEOUT_MS, publishMarginMs = PUBLISH_MARGIN_MS) {
    return Math.max(1000, hookTimeoutMs - publishMarginMs)
}

/**
 * @summary Resolves the manifest path from the environment, falling back to the receiver's own default.
 * @param {Object} [options]
 * @param {Object} [options.env=process.env] Environment source.
 * @param {String} [options.homeDir] Overrides `os.homedir()` for deterministic tests.
 * @returns {String}
 */
export function resolveManifestPath({env = process.env, homeDir = os.homedir()} = {}) {
    return env.NEO_WAKE_RECEIVER_MANIFEST || path.join(homeDir, DEFAULT_MANIFEST_RELATIVE)
}

/**
 * @summary Reads the plane leaves from `AiConfig`, the one config read in this process.
 *
 * Imported lazily so the module stays loadable — and its pure helpers unit-testable — without booting
 * the Neo state Provider. The hook process is an entrypoint, so importing `AiConfig` here is the
 * sanctioned shape for an entrypoint; doing it at module scope would make every consumer of
 * `resolveManifestPath` pay for a Provider boot.
 * @returns {Promise<Object>} `{planeBase, planeBearer}`
 */
export async function readPlaneConfig() {
    // Namespace bootstrap before the config import, the entry-point invariant `devFleetServer.mjs`
    // documents: `Neo` + `core/_export` populate `globalThis.Neo` so the Provider's `setupClass`
    // succeeds at module-load. Without them `ai/config.mjs` throws `Neo is not defined`.
    await import('../../src/Neo.mjs');
    await import('../../src/core/_export.mjs');

    const {default: AiConfig} = await import('../../ai/config.mjs');

    return {planeBase: AiConfig.fleet.planeBase, planeBearer: AiConfig.fleet.planeBearer}
}

/**
 * @summary Arms this seat's wake route at session start, reporting the outcome without ever failing the session.
 *
 * A once-ever manual arming step is lost the moment a seat is re-provisioned or a harness crashes,
 * which is how seats go silently unreachable for days: every intermediate state reports healthy, so
 * nothing surfaces the gap. Running on every session start turns that outage into one idempotent
 * re-arm — the manifest builder merges additively, so repeating it neither duplicates this seat's
 * route nor withdraws a peer's.
 *
 * **This is the entrypoint, and the only place config is resolved.** It reads `AiConfig.fleet.planeBase`
 * / `fleet.planeBearer` — the same leaves `devFleetServer.mjs` reads to reach the containerized plane —
 * and injects them into pure collaborators. The reader below deliberately resolves nothing itself; an
 * earlier version re-derived the endpoint from its own env vocabulary with a hardcoded localhost
 * fallback — module-level re-derivation of a config leaf — and invented a second credential carrier
 * beside the plane's own.
 *
 * An unconfigured plane is a NAMED SKIP, never a localhost guess: `fleet.planeBase` defaults to empty
 * precisely so "not configured" is expressible, and guessing an endpoint would either fail obscurely or
 * publish against whatever happens to be listening.
 *
 * @param {Object} [options]
 * @param {Object} [options.env=process.env] Environment source.
 * @param {String} [options.harness='claude'] Harness key for instance-tuple derivation.
 * @param {String} [options.homeDir] Overrides `os.homedir()` for deterministic tests.
 * @param {Object} [options.config] Injected `{planeBase, planeBearer}`; read from `AiConfig` when absent.
 * @param {Function} [options.listSubscriptions=readSubscriptionsOverMcp] Subscription-reader seam.
 * @param {Function} [options.arm=armSeatWakeRoute] Arming seam.
 * @returns {Promise<Object>}
 */
export async function armClaudeSeat({
    env               = process.env,
    harness           = 'claude',
    homeDir,
    config,
    listSubscriptions = readSubscriptionsOverMcp,
    arm               = armSeatWakeRoute
} = {}) {
    const resolved  = config ?? await readPlaneConfig(),
          planeBase = String(resolved?.planeBase ?? '').trim().replace(/\/+$/, '');

    if (!planeBase) {
        return {
            armed : false,
            reason: 'fleet.planeBase is not configured, so there is no Memory Core plane to read subscriptions from'
        };
    }

    return arm({
        env,
        harness,
        homeDir,
        listSubscriptions: ({identity} = {}) => listSubscriptions({
            baseUrl   : `${planeBase}/mc/mcp`,
            credential: resolved?.planeBearer ?? '',
            deadlineMs: resolveExchangeDeadlineMs(),
            identity
        }),
        manifestPath: resolveManifestPath({env, homeDir})
    })
}

async function main() {
    // Never rejects: a seat that cannot arm still boots and says so on stderr, where the harness
    // captures it. Wake is an enhancement, not a precondition for starting work.
    const result = await armClaudeSeat().catch(error => ({
        armed : false,
        reason: `wake arming threw: ${error?.message || error}`
    }));

    if (result?.armed) {
        console.error(`[INFO] [wake-arming] ${result.identity} armed: ${result.routeCount} route(s) published`);
    } else {
        console.error(`[WARN] [wake-arming] seat is UNARMED — ${result?.reason || 'no reason reported'}`);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
