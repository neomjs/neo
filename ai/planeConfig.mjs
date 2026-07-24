import path from 'node:path';

/**
 * @summary The plane-identity pure-defaults twin — the sanctioned non-entrypoint companion
 * (ticket-ref-ok: ADR 0019 §5.5 names this exact module shape) to the `plane` leaf subtree
 * in `ai/configBase.mjs`.
 *
 * Non-entrypoints (host CLI scripts, per-harness-family hook writers, host daemons) must not
 * import Neo singletons. This module carries the SAME env-var names and default literals the leaf
 * subtree declares — and the leaf subtree imports THESE constants as its declaration source, so
 * leaf↔twin drift is impossible by construction (the pairing test pins only resolver semantics).
 *
 * The three concepts this plane API never conflates:
 * - **identity** — the opaque `planeId` (never a path, never checkout-shaped: a checkout-shaped
 *   identity would silently pre-decide the data-root placement election);
 * - **resolved evidence** — the `dataRoot` a process actually resolved at runtime;
 * - **checkout root** — `NEO_AI_CANONICAL_ROOT`, which names a checkout for provisioning-time
 *   hydration (`bootstrapWorktree.mjs`) and is explicitly NOT the plane identity.
 */
export const PLANE_ENV = Object.freeze({
    dataRoot: 'NEO_PLANE_DATA_ROOT',
    planeId : 'NEO_PLANE_ID'
});

export const PLANE_DEFAULTS = Object.freeze({
    /**
     * Relative to the injected root; the leaf side resolves it against `neoRootDir`,
     * non-entrypoint consumers inject their own discovered root.
     */
    dataRootRelative: '.neo-ai-data',
    /**
     * The institution's canonical local plane. Overlays, cloud deployments, and ephemeral
     * isolation planes override via env — a stable literal, deliberately carrying no
     * path or checkout content.
     */
    planeId: 'neo-local-canonical'
});

/**
 * @summary Resolves the plane identity without importing Neo singletons.
 * @param {Object} [options]
 * @param {Object} [options.env=process.env] Environment source.
 * @returns {String}
 */
export function resolvePlaneId({env = process.env} = {}) {
    const override = env[PLANE_ENV.planeId];
    return override ? override : PLANE_DEFAULTS.planeId
}

/**
 * @summary Resolves the plane data root without importing Neo singletons.
 * @param {Object} options
 * @param {Object} [options.env=process.env] Environment source.
 * @param {String} options.rootDir Discovered repository / deployment root the relative default anchors on.
 * @returns {String}
 */
export function resolvePlaneDataRoot({env = process.env, rootDir} = {}) {
    const override = env[PLANE_ENV.dataRoot];

    if (override) {
        return override
    }

    if (!rootDir) {
        throw new Error(
            `planeConfig.resolvePlaneDataRoot: rootDir is required when ${PLANE_ENV.dataRoot} is unset — ` +
            'a non-entrypoint consumer must inject its discovered root rather than trusting ambient cwd.'
        );
    }

    return path.resolve(rootDir, PLANE_DEFAULTS.dataRootRelative)
}

// Module-load invariant: the twin is literals + env NAMES only. A path-shaped or
// checkout-shaped planeId default would silently pre-decide the data-root placement
// election — fail at load, not at review.
if (PLANE_DEFAULTS.planeId.includes('/') || PLANE_DEFAULTS.planeId.includes(path.sep)) {
    throw new Error('planeConfig: PLANE_DEFAULTS.planeId must stay opaque — no path content.');
}
