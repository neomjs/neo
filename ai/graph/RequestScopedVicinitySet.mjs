import Base from '../../src/core/Base.mjs';

/**
 * Set-compatible lazy-vicinity marker keyed by both node id and the active requester
 * scope. SQLite vicinity reads are RLS-filtered, so a node loaded for tenant A cannot
 * satisfy tenant B's cache lookup. Node-wide `delete()` preserves the existing
 * cross-worker invalidation contract, while `clear()` remains the test/reset boundary.
 *
 * @class Neo.ai.graph.RequestScopedVicinitySet
 * @extends Neo.core.Base
 */
class RequestScopedVicinitySet extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.graph.RequestScopedVicinitySet'
         * @protected
         */
        className: 'Neo.ai.graph.RequestScopedVicinitySet',
        /**
         * Returns the current requester-scoped RLS cache key.
         * @member {Function|null} scopeResolver=null
         */
        scopeResolver: null
    }

    scopesByNode = new Map();

    /**
     * Marks a node vicinity loaded for the active requester scope.
     * @param {String} nodeId
     * @returns {Neo.ai.graph.RequestScopedVicinitySet}
     */
    add(nodeId) {
        let scopes = this.scopesByNode.get(nodeId);

        if (!scopes) {
            scopes = new Set();
            this.scopesByNode.set(nodeId, scopes)
        }

        scopes.add(this.scopeResolver());

        return this
    }

    /**
     * Clears all requester-scoped vicinity markers.
     */
    clear() {
        this.scopesByNode.clear()
    }

    /**
     * Invalidates every requester scope for one node.
     * @param {String} nodeId
     * @returns {Boolean}
     */
    delete(nodeId) {
        return this.scopesByNode.delete(nodeId)
    }

    /**
     * Tests whether the active requester has loaded this node's RLS-filtered vicinity.
     * @param {String} nodeId
     * @returns {Boolean}
     */
    has(nodeId) {
        return this.scopesByNode.get(nodeId)?.has(this.scopeResolver()) ?? false
    }

    /**
     * Number of node ids with at least one requester-scoped marker.
     * @returns {Number}
     */
    get size() {
        return this.scopesByNode.size
    }
}

export default Neo.setupClass(RequestScopedVicinitySet);
