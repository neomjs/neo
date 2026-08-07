/**
 * @module test/playwright/unit/ai/services/denyBrainTierPackages.loader
 * @summary Resolve hook that denies every Brain-tier-only package, simulating a Body install.
 *
 * The Body install tier gets `npm install`; the Brain tier additionally runs `npm run install-brain`
 * (`package.brain.json`). A developer or CI job on the Body tier therefore has these packages
 * ABSENT — which is the environment `ai/services.mjs` must remain importable in, and the one no
 * full-install CI run can reproduce.
 *
 * Denial is by exact specifier and subpath, and it throws the same `ERR_MODULE_NOT_FOUND` code Node
 * raises for a genuinely missing package, so the code under test cannot tell this apart from the
 * real thing.
 */

const DENIED = (process.env.NEO_DENIED_PACKAGES || 'chromadb,better-sqlite3,@chroma-core/default-embed')
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);

/**
 * @param {String} specifier
 * @param {Object} context
 * @param {Function} nextResolve
 * @returns {Promise<Object>}
 */
export async function resolve(specifier, context, nextResolve) {
    if (DENIED.some(pkg => specifier === pkg || specifier.startsWith(`${pkg}/`))) {
        const error = new Error(`DENIED_BRAIN_TIER_PACKAGE: ${specifier}`);

        error.code = 'ERR_MODULE_NOT_FOUND';
        throw error
    }

    return nextResolve(specifier, context)
}
