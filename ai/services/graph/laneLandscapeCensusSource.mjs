/**
 * @module ai/services/graph/laneLandscapeCensusSource
 * @summary The Native-Edge-Graph source adapter behind the current-state lane-landscape Bird View:
 * the open-work census read and the relation-edge read the projection consumes.
 *
 * Fully SQLite-sourced, cold-cache correct BY CONSTRUCTION. The in-memory node/edge stores are lazy,
 * so a landscape built from `nodes.get` / `getByIndex` would silently describe whatever happened to be
 * hydrated — which is exactly the picture a peer must not be handed as "the current landscape". These
 * read the source of truth directly.
 *
 * Read-only by construction: both statements are `SELECT`s and the module exposes no write path, so no
 * durable current-state cascade is constructible through this adapter.
 */

/**
 * Relation edge types the landscape projects. `PARENT_OF` carries the goal trajectory (epic → open
 * children); `BLOCKS` carries the dependency/critical path. Other edge types are not landscape
 * structure and are deliberately not read — a landscape is not the whole graph.
 * @type {String[]}
 */
const LANDSCAPE_EDGE_TYPES = Object.freeze(['PARENT_OF', 'BLOCKS']);

/**
 * @summary Binds the injected SQLite handle into the two census reads the landscape composition needs.
 *
 * The handle is injected rather than imported so the adapter stays testable and the graph service
 * remains the only owner of connection lifecycle.
 *
 * @param {Object}   params
 * @param {Function} params.getDb `() => sqliteDb` — resolves the live graph SQLite handle at call time.
 *   Read at call time, never captured at module load: a handle captured early goes stale across a
 *   store re-open and would read a dead database.
 * @returns {{queryOpenIssueNodes: Function, queryRelationEdges: Function}} The injectable census reads.
 * @throws {Error} When `getDb` is missing — an unbound source is a wiring bug, not a degradation.
 */
export function makeLandscapeCensusSource({getDb} = {}) {
    if (typeof getDb !== 'function') {
        throw new Error('makeLandscapeCensusSource: an injected `getDb` resolver is required')
    }

    /**
     * @summary Reads every OPEN issue node. The state lives either flat or under `properties` depending
     * on the row's vintage, so both shapes are matched rather than assuming one and under-reporting the
     * census — an under-reported census would present a partial landscape as the whole one.
     * @returns {Promise<Object[]>} Raw `{id, data}` rows.
     */
    const queryOpenIssueNodes = async () => {
        const db = getDb();

        if (!db) {
            throw new Error('lane landscape census: the graph SQLite handle is unavailable')
        }

        return db.prepare(`
            SELECT n.id, n.data FROM Nodes n
            WHERE n.id LIKE 'issue-%'
              AND (json_extract(n.data, '$.properties.state') = 'OPEN' OR json_extract(n.data, '$.state') = 'OPEN')
        `).all()
    };

    /**
     * @summary Reads the landscape's relation edges (parent/blocker) for the whole graph; the
     * projection is what narrows them to the open census, so this stays a single bounded read rather
     * than a per-item N+1 walk.
     * @returns {Promise<Object[]>} Raw `{source, target, type}` rows.
     */
    const queryRelationEdges = async () => {
        const db = getDb();

        if (!db) {
            throw new Error('lane landscape census: the graph SQLite handle is unavailable')
        }

        const placeholders = LANDSCAPE_EDGE_TYPES.map(() => '?').join(', ');

        return db.prepare(`SELECT source, target, type FROM Edges WHERE type IN (${placeholders})`)
            .all(...LANDSCAPE_EDGE_TYPES)
    };

    return {queryOpenIssueNodes, queryRelationEdges}
}
