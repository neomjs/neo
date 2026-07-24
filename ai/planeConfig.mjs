import path from 'node:path';

/**
 * @summary The plane-identity pure-defaults twin — the sanctioned non-entrypoint companion
 * (ticket-ref-ok: ADR 0019 §5.5 names this exact module shape) to the `plane` leaf subtree
 * in `ai/configBase.mjs`.
 *
 * Non-entrypoints (host CLI scripts, per-harness-family hook writers, host daemons) must not
 * import Neo singletons. This module carries the SAME env-var names and default literals the leaf
 * subtree declares — and the leaf subtree imports THESE constants as its declaration source, so
 * leaf↔twin drift is impossible by construction. The resolver semantics are equivalent to the
 * leaf's env layer by construction too (for strings, truthiness and the provider's emptiness
 * partition identically — `''` is the only falsy string), so the pairing test pins that
 * equivalence rather than guarding a live drift channel.
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
 * @summary The opacity predicate for plane identities — ONE rule covering the frozen default
 * (module-load guard below) and every RESOLVED value, env overrides included. A path- or
 * checkout-shaped planeId silently pre-decides the data-root placement election, so opacity
 * must hold on the values that vary, not only on the literal that cannot.
 * @param {*} value
 * @returns {Boolean}
 */
export function isOpaquePlaneId(value) {
    return typeof value === 'string' && value.length > 0 &&
        !value.includes('/') && !value.includes('\\') &&
        !value.includes(PLANE_DEFAULTS.dataRootRelative)
}

/**
 * @summary Env-layer parser for the `plane.id` leaf — the leaf reaches the SAME opacity
 * predicate the twin's resolver enforces (mirrors the `parseMemorySharingPolicy` descriptor
 * precedent: absent/empty env → `undefined`, so the declared default applies).
 * @param {String} envVarName
 * @param {Object} [options]
 * @param {Object} [options.env=process.env] Environment source.
 * @returns {String|undefined}
 */
export function parsePlaneIdEnv(envVarName, {env = process.env} = {}) {
    const rawValue = env[envVarName];
    if (rawValue === undefined || rawValue === null || rawValue === '') return;
    if (!isOpaquePlaneId(rawValue)) {
        throw new Error(
            `planeConfig: ${envVarName}="${rawValue}" is not an opaque planeId — ` +
            'no path separators or data-dir content; a path-shaped identity would pre-decide the placement election.'
        );
    }
    return rawValue
}

/**
 * @summary Resolves the plane identity without importing Neo singletons. The RESOLVED value
 * (override or default) must satisfy the opacity invariant — fail loud, never propagate a
 * path-shaped identity.
 * @param {Object} [options]
 * @param {Object} [options.env=process.env] Environment source.
 * @returns {String}
 */
export function resolvePlaneId({env = process.env} = {}) {
    const override = env[PLANE_ENV.planeId];
    const resolved = override ? override : PLANE_DEFAULTS.planeId;

    if (!isOpaquePlaneId(resolved)) {
        throw new Error(
            `planeConfig.resolvePlaneId: "${resolved}" is not an opaque planeId — ` +
            'no path separators or data-dir content; a path-shaped identity would pre-decide the placement election.'
        );
    }
    return resolved
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

// Module-load invariant: the twin is literals + env NAMES only — the frozen default must
// satisfy the same opacity predicate every resolved value passes through. Fail at load,
// not at review.
if (!isOpaquePlaneId(PLANE_DEFAULTS.planeId)) {
    throw new Error('planeConfig: PLANE_DEFAULTS.planeId must stay opaque — no path content.');
}
