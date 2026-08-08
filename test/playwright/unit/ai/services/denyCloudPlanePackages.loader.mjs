/**
 * @module test/playwright/unit/ai/services/denyCloudPlanePackages.loader
 * @summary Resolve hook that denies cloud-plane-only packages, simulating a host install.
 *
 * The host plane gets `npm install`; the cloud plane additionally runs `npm run install-brain`
 * (`package.brain.json`). A host process therefore has these packages ABSENT — which is the
 * environment `ai/services.host.mjs` must remain importable in, and the one no full-install CI run
 * can reproduce, because CI installs everything.
 *
 * Denial is by exact specifier and subpath, and it throws the same `ERR_MODULE_NOT_FOUND` code Node
 * raises for a genuinely missing package, so the code under test cannot tell this apart from the
 * real thing.
 *
 * Recovered from a closed, unmerged branch rather than rewritten — the original was reviewed and its
 * failure-code fidelity is the load-bearing part.
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
        const error = new Error(`DENIED_CLOUD_PLANE_PACKAGE: ${specifier}`);

        error.code = 'ERR_MODULE_NOT_FOUND';
        throw error
    }

    return nextResolve(specifier, context)
}
