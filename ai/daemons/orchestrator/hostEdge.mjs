/**
 * @module ai/daemons/orchestrator/hostEdge
 * @summary The portable host-edge Orchestrator entrypoint — one cross-platform command
 * that starts a correctly-roled graphless host edge, with no OS-specific installer.
 *
 * `npm run ai:host-edge` runs this file. It applies the {@link module:ai/deploy/hostEdgeProfile}
 * posture to the process environment and then hands off to the daemon's own boot sequence, so the
 * portable path and the launchd-supervised path execute the SAME code with the SAME inputs —
 * launchd supplies restart-on-login, never the configuration.
 *
 * **Why an env fragment and not an argv/config path.** The role and its placement are deployment
 * inputs the Tier-1 leaves already bind (`NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE`,
 * `NEO_AI_DEPLOYMENT_MODE`, `NEO_AI_ORCHESTRATOR_DIR`). Producing those inputs is exactly what a
 * Compose `environment:` block or a plist `EnvironmentVariables` dict does; this module is the
 * third producer of the same shape, not a second resolver. Nothing here re-derives a leaf, holds a
 * shadow default, or mutates `AiConfig` (ticket-ref-ok: ADR 0019 §3/§5 is the mandated read-gate for
 * any AiConfig-adjacent authoring, and the sanctioned-pattern list a reviewer checks this against).
 *
 * @see ai/deploy/hostEdgeProfile.mjs
 * @see ai/daemons/orchestrator/daemon.mjs
 */
// dotenv BEFORE the posture is applied, not after: an operator's `.env` must be visible to the
// explicit-value rules below. dotenv never overwrites an already-set key, so loading it here and
// again at the daemon entrypoint is idempotent.
import 'dotenv/config';

import {buildHostEdgeEnv} from '../../deploy/hostEdgeProfile.mjs';

/**
 * @summary Env key whose value IS the declaration this entrypoint makes.
 * @type {String}
 */
const ROLE_ENV = 'NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE';

/**
 * @summary Applies the host-edge posture over an environment, yielding to explicit values.
 *
 * Every key yields to an operator override — that is what makes the LM Studio opt-out, a custom
 * state root, and the plist's machine-specific coordinate one variable each instead of a fork of
 * the profile. The ROLE is the one exception, and it is not an override but a CONTRADICTION: this
 * entrypoint's name is the declaration, so an environment that names a different role is an
 * ambiguity about which process owns host authority. Two answers to that question is the failure
 * mode the whole split exists to prevent, so it refuses rather than silently picking one.
 *
 * @param {Object} [options]
 * @param {Object} [options.env=process.env] Environment to mutate.
 * @param {Object} [options.posture=buildHostEdgeEnv()] Posture fragment to apply.
 * @returns {Object} The same environment object, for chaining in tests.
 * @throws {Error} When the environment explicitly declares a different role.
 */
export function applyHostEdgePosture({env = process.env, posture = buildHostEdgeEnv()} = {}) {
    const declaredRole = env[ROLE_ENV];

    if (declaredRole && declaredRole !== posture[ROLE_ENV]) {
        throw new Error(
            `[host-edge] Refusing to start: the environment declares ${ROLE_ENV}="${declaredRole}", ` +
            `but this entrypoint declares "${posture[ROLE_ENV]}". Run ` +
            '`node ai/daemons/orchestrator/daemon.mjs` with an explicit role instead, or unset the variable.'
        );
    }

    for (const [key, value] of Object.entries(posture)) {
        env[key] ??= value;
    }

    return env
}

if (process.argv[1] && import.meta.url === (await import('url')).pathToFileURL(process.argv[1]).href) {
    try {
        applyHostEdgePosture();
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }

    // Imported AFTER the posture is applied: the daemon's module graph resolves `AiConfig` at
    // import time, so an earlier static import would read the environment this file exists to set.
    const {bootOrchestratorCli} = await import('./daemon.mjs');

    await bootOrchestratorCli();
}
