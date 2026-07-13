/**
 * @summary The fail-loud graph-isolation gate for suites that WRITE graph nodes through
 * GraphService: refuse to run unless the test-database toggle is on AND the RESOLVED graph
 * target is not the production path. The second check is load-bearing — the toggle can be true
 * while an env override aliases the test path onto the production path, and a gate that trusts
 * the intent flag instead of the resolved fact would write fixtures straight into the live
 * Computed Golden Path advisory's source set (observed: fixture rows served as the top-ROI
 * release lane).
 * @param {Object} storagePaths The resolved `aiConfig.storagePaths` object.
 * @param {Boolean} storagePaths.useTestDatabase
 * @param {String}  storagePaths.graph     The RESOLVED graph db target.
 * @param {String}  storagePaths.graphProd The production graph db path.
 * @returns {void} Throws with an actionable message when isolation cannot be proven.
 */
export function assertIsolatedGraphTarget({useTestDatabase, graph, graphProd}) {
    if (useTestDatabase !== true) {
        throw new Error('graph-isolation gate: refusing to run — storagePaths.useTestDatabase is not true, so graph writes would hit the PRODUCTION database. Run through a Playwright config instead of invoking the spec bare.');
    }

    if (graph === graphProd) {
        throw new Error('graph-isolation gate: refusing to run — the RESOLVED storagePaths.graph equals storagePaths.graphProd, so graph writes would hit the PRODUCTION database even though useTestDatabase is set (a test-path env override is aliased onto the production path). Fix the NEO_MEMORY_DB_PATH_TEST override.');
    }
}
