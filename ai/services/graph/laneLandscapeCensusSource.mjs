import {walkCensusToExhaustion} from './laneLandscapeCensusWalk.mjs';

/**
 * @module ai/services/graph/laneLandscapeCensusSource
 * @summary The source adapter behind the current-state lane-landscape Bird View: a cursor-walked
 * open-work census from the source that owns the facts, plus the relation edges from the graph.
 *
 * The split is deliberate and load-bearing:
 *
 * - **The census reads the owning source, live.** A current-state answer cannot come from a local
 *   projection. Both local stores lag the world — an open pull request was absent from the Native Edge
 *   Graph AND from the synced content corpus while it was open — and neither carries assignee truth. A
 *   census over either reports the store's silence as the world's state.
 * - **The graph keeps the relations.** Parent/blocker edges are structure the graph genuinely owns, and
 *   a landscape needs them to say anything about goal trajectory or a dependency path. They are read
 *   through the graph service's visibility seam, never a raw handle: an edge between two visible nodes
 *   can itself belong to another tenant, and a landscape assembled from raw rows would disclose both the
 *   relation and its provenance.
 *
 * So every fact the landscape asserts comes from whoever owns it, at the visibility the requester is
 * entitled to, and completeness is proven by the read rather than assumed from one that did not throw.
 */

/**
 * Relation edge types the landscape projects. `PARENT_OF` carries the goal trajectory (epic → open
 * children); `BLOCKS` carries the dependency/critical path. Other edge types are not landscape
 * structure and are deliberately not read — a landscape is not the whole graph.
 * @type {String[]}
 */
const LANDSCAPE_EDGE_TYPES = Object.freeze(['PARENT_OF', 'BLOCKS']);

/**
 * @summary Builds a page reader that refuses, so a structurally unreachable source degrades the census
 * instead of either crashing the tool or inventing a complete-looking empty one.
 *
 * **Why a refusing reader rather than no reader.** `makeLandscapeCensusSource` is fail-closed on its
 * injections — an unbound source is a wiring bug, not a degradation — so simply omitting the reader
 * throws and takes the whole tool down. A deployment that legitimately cannot reach the owning source
 * is not a wiring bug, and it should not have to look like one.
 *
 * **Why not a reader that returns nothing.** The obvious stand-in, `{items: [], hasNextPage: false}`,
 * is the worse answer: the walk would read it as the source proving there is no next page, report
 * `exhausted: true`, and the landscape would confidently assert **zero** open issues and zero open
 * pull requests — indistinguishable from a genuinely empty backlog. Reporting a count the source
 * never supplied is the failure this whole seam is built to make impossible. Refusing keeps the count
 * `unknown`: the walk records `exhausted: false` with this reason, callers derive `degraded` from
 * that, and the narrative is withheld with its cause attached.
 *
 * The reason is supplied by the caller rather than composed here, for the same reason the page
 * readers themselves are injected: *why* a source is out of reach is a deployment fact owned by the
 * composition edge, and burning one plane's vocabulary into a shared graph helper would make this
 * module assert something it cannot know.
 *
 * @param {String} reason Why this deployment cannot reach the source, in the caller's own vocabulary.
 * @returns {Function} A page reader matching the `fetchIssuesPage` / `fetchPullRequestsPage` contract.
 */
export function makeRefusingCensusPageReader(reason) {
    if (typeof reason !== 'string' || reason.length === 0) {
        throw new TypeError('makeRefusingCensusPageReader: a non-empty `reason` is required — an unexplained refusal is indistinguishable from a bug')
    }

    return async () => {
        throw new CensusSourceUnavailable(reason)
    }
}

/**
 * @summary A source that is out of reach **by design** — carried as a type so the walk can render it
 * as a deployment fact rather than as a fault.
 *
 * **Why a type and not just a message.** A deliberate boundary and a genuine transient are different
 * events that call for different responses: one is a fact about where this code runs, the other is an
 * invitation to go and find a fault. Signalled with a plain `Error`, the two arrive at the walk
 * identically and are distinguishable only by reading the prose — so any consumer wanting to branch
 * would have to string-match, which is a coupling rather than a seam.
 *
 * `unavailable` is an own property rather than an `instanceof` check on purpose: the walk must classify
 * correctly even when the error crosses a module realm or is reconstructed by a transport, and a
 * duck-typed flag survives both.
 */
export class CensusSourceUnavailable extends Error {
    constructor(reason) {
        super(reason);

        this.name        = 'CensusSourceUnavailable';
        this.unavailable = true
    }
}

/**
 * @summary Binds the injected source readers into the census + relation reads the landscape needs.
 *
 * Every impure edge is injected: the page readers so the walk stays hermetic and the owning service
 * keeps transport ownership, and the graph handle resolved at call time so a re-opened store is never
 * read through a stale capture.
 *
 * @param {Object}   params
 * @param {Function} params.fetchIssuesPage `async ({cursor, limit}) => {items, hasNextPage, endCursor}` —
 *   one page of OPEN issues, reporting `hasNextPage` from the source itself.
 * @param {Function} params.fetchPullRequestsPage Same contract, for OPEN pull requests. PRs are
 *   first-class landscape members rather than edge decoration on an issue: a lane's PR is part of its
 *   current state, and an unlinked PR is still open work the landscape must not hide.
 * @param {Function} params.listEdgeRecordsByType `({types, limit}) => {records, truncated}` — the graph
 *   service's RLS-safe edge enumeration, resolved at call time so a re-opened store is never read
 *   through a stale capture.
 * @param {Number}   params.pageLimit Page size, injected from config — no local default.
 * @param {Number}   params.maxPages Walk bound, injected from config — no local default.
 * @param {Number}   params.edgeLimit Relation-read bound, injected from config — no local default.
 * @returns {{queryOpenWorkCensus: Function, queryRelationEdges: Function}}
 * @throws {Error} When an injection is missing — an unbound source is a wiring bug, not a degradation.
 */
export function makeLandscapeCensusSource({
    fetchIssuesPage,
    fetchPullRequestsPage,
    listEdgeRecordsByType,
    pageLimit,
    maxPages,
    edgeLimit
} = {}) {
    if (typeof fetchIssuesPage !== 'function') {
        throw new Error('makeLandscapeCensusSource: an injected `fetchIssuesPage` is required')
    }
    if (typeof fetchPullRequestsPage !== 'function') {
        throw new Error('makeLandscapeCensusSource: an injected `fetchPullRequestsPage` is required')
    }
    if (typeof listEdgeRecordsByType !== 'function') {
        throw new Error('makeLandscapeCensusSource: an injected `listEdgeRecordsByType` seam is required')
    }
    if (!Number.isFinite(edgeLimit) || edgeLimit <= 0) {
        throw new Error('makeLandscapeCensusSource: a positive `edgeLimit` is required (inject it from config)')
    }

    /**
     * @summary Walks the owning source to exhaustion for both open-work families and returns one
     * kind-discriminated census plus the manifest that proves — or refuses to claim — its completeness.
     *
     * The families walk independently so one truncated family cannot erase the other's evidence, and
     * the manifest is exhausted only when BOTH reported no next page: a landscape missing an entire
     * family is not a complete landscape.
     *
     * @returns {Promise<{items: Object[], manifest: {exhausted: Boolean, pages: Number,
     *   reasons: String[], unavailable: Boolean}}>} `unavailable` separates the two ways a census can
     *   be incomplete: a deployment that cannot see the source at all, versus something that broke.
     *   Both leave `exhausted: false`, and only one is worth waking somebody for.
     */
    const queryOpenWorkCensus = async () => {
        const [issues, pullRequests] = await Promise.all([
            walkCensusToExhaustion({fetchPage: fetchIssuesPage,       kind: 'open issues',        limit: pageLimit, maxPages}),
            walkCensusToExhaustion({fetchPage: fetchPullRequestsPage, kind: 'open pull requests', limit: pageLimit, maxPages})
        ]);

        // Kind is explicit on every row rather than inferred downstream: the projection must never guess
        // what it is describing, and an unlinked PR has to survive as its own row.
        const items = [
            ...issues.items.map(item       => ({...item, kind: 'issue'})),
            ...pullRequests.items.map(item => ({...item, kind: 'pr'}))
        ];

        const families = [issues, pullRequests];

        return {
            items,
            manifest: {
                exhausted: issues.exhausted && pullRequests.exhausted,
                pages    : issues.pages + pullRequests.pages,
                reasons  : [issues.reason, pullRequests.reason].filter(Boolean),
                // Deliberately narrower than "some family was refused". This flag is what lets a
                // consumer say "nothing is broken, this plane simply cannot see that source" — so one
                // family failing for any OTHER cause has to revoke it, even while the other family was
                // cleanly refused. A mixed outcome still deserves someone looking at it, and a flag
                // that stayed true through a real fault would be the confident-wrong answer wearing a
                // different hat.
                unavailable: families.some(family => family.unavailable) &&
                             families.every(family => family.exhausted || family.unavailable)
            }
        }
    };

    /**
     * @summary Reads the landscape's relation edges (parent/blocker) — the one thing the graph owns —
     * through its visibility seam, and reports whether that read saw all of them.
     *
     * A single bounded read rather than a per-item N+1 walk; the projection narrows them to the census.
     * The manifest mirrors the item census's: a clipped edge read cannot describe a complete dependency
     * path, so it says so rather than letting a partial topology read as the whole structure.
     *
     * @returns {Promise<{edges: Object[], manifest: {exhausted: Boolean, reasons: String[]}}>}
     */
    const queryRelationEdges = async () => {
        const {records, truncated} = await listEdgeRecordsByType({types: LANDSCAPE_EDGE_TYPES, limit: edgeLimit});

        return {
            edges   : records,
            manifest: {
                exhausted: truncated !== true,
                reasons  : truncated === true ? [`landscape relations: edge read hit the ${edgeLimit}-record bound`] : []
            }
        }
    };

    return {queryOpenWorkCensus, queryRelationEdges}
}
