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
 * @summary Arms this seat's wake route at session start, reporting the outcome without ever failing the session.
 *
 * A once-ever manual arming step is lost the moment a seat is re-provisioned or a harness crashes,
 * which is how seats go silently unreachable for days: every intermediate state reports healthy, so
 * nothing surfaces the gap. Running on every session start turns that outage into one idempotent
 * re-arm — the manifest builder merges additively, so repeating it neither duplicates this seat's
 * route nor withdraws a peer's.
 *
 * @param {Object} [options]
 * @param {Object} [options.env=process.env] Environment source.
 * @param {String} [options.harness='claude'] Harness key for instance-tuple derivation.
 * @param {String} [options.homeDir] Overrides `os.homedir()` for deterministic tests.
 * @param {Function} [options.listSubscriptions=readSubscriptionsOverMcp] Subscription-reader seam.
 * @param {Function} [options.arm=armSeatWakeRoute] Arming seam.
 * @returns {Promise<Object>}
 */
export async function armClaudeSeat({
    env               = process.env,
    harness           = 'claude',
    homeDir,
    listSubscriptions = readSubscriptionsOverMcp,
    arm               = armSeatWakeRoute
} = {}) {
    return arm({
        env,
        harness,
        homeDir,
        listSubscriptions: () => listSubscriptions({env}),
        manifestPath     : resolveManifestPath({env, homeDir})
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
