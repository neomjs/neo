/**
 * @module ai/services/graph/laneLandscapeCensusWalk
 * @summary The exhaustion-proving page walk behind the current-state lane-landscape census.
 *
 * A current-state answer cannot be sourced from a local projection. Both local stores lag the world:
 * an open pull request was absent from the Native Edge Graph AND from the synced content corpus while
 * that pull request was open, and neither store carries assignee or review truth. A census built on
 * either reports the store's silence as the world's state — which is the failure this module exists to
 * make impossible.
 *
 * So the census walks a source that owns the facts, page by page, and stops only when the source
 * itself says there is no next page. That is the difference this module encodes:
 *
 * - **Exhaustion is proven, never assumed.** `exhausted: true` means the source reported no next page.
 *   A read that merely did not throw proves nothing about completeness.
 * - **Truncation is a first-class outcome.** A failed page, a missing cursor, or a walk that hits its
 *   bound returns `exhausted: false` with a reason. Callers derive `degraded` from THAT, so a partial
 *   census can never be presented as the whole picture.
 * - **Partial results survive.** A walk that fails on page 3 still returns pages 1-2 — labelled
 *   incomplete. Honest partial evidence beats an empty answer; silently-partial evidence is worse than
 *   either, and is exactly what the reason field prevents.
 */

/**
 * @summary Walks an injected page-fetcher to exhaustion, proving completeness or naming why it could
 * not.
 *
 * The fetcher is injected rather than imported so the walk stays pure and hermetically testable: the
 * source that owns the facts binds it at the composition edge.
 *
 * @param {Object}   params
 * @param {Function} params.fetchPage `async ({cursor, limit}) => {items, hasNextPage, endCursor}` — one
 *   page from the owning source. It must report `hasNextPage` from the source itself; a fetcher that
 *   infers it (for example from `items.length === limit`) would re-introduce the assumption this walk
 *   exists to remove.
 * @param {String}   params.kind Census kind, used only in reason strings (e.g. `'open issues'`).
 * @param {Number}   params.limit Page size, injected from the caller's config — no local default.
 * @param {Number}   params.maxPages Hard walk bound, injected — a runaway cursor must terminate, and
 *   hitting the bound is an honest truncation rather than a silent stop.
 * @returns {Promise<{items: Object[], pages: Number, exhausted: Boolean, reason: String|null,
 *   unavailable: Boolean}>} `unavailable` marks the one incompleteness that is a deployment fact
 *   rather than a fault, so a consumer branches on a flag instead of string-matching the reason.
 * @throws {TypeError} When a required injection is missing — an unbound walk is a wiring bug, not a
 *   degradation, and must fail loud rather than report an empty census as complete.
 */
export async function walkCensusToExhaustion({fetchPage, kind, limit, maxPages} = {}) {
    if (typeof fetchPage !== 'function') {
        throw new TypeError('[laneLandscapeCensusWalk] an injected `fetchPage` is required')
    }
    if (typeof kind !== 'string' || kind.length === 0) {
        throw new TypeError('[laneLandscapeCensusWalk] `kind` must be a non-empty string')
    }
    if (!Number.isFinite(limit) || limit <= 0) {
        throw new TypeError('[laneLandscapeCensusWalk] `limit` must be a positive number (inject from config; no local default)')
    }
    if (!Number.isFinite(maxPages) || maxPages <= 0) {
        throw new TypeError('[laneLandscapeCensusWalk] `maxPages` must be a positive number (inject from config; no local default)')
    }

    const items = [];

    let cursor      = null,
        pages       = 0,
        exhausted   = false,
        reason      = null,
        unavailable = false;

    while (pages < maxPages) {
        let page;

        try {
            page = await fetchPage({cursor, limit})
        } catch (error) {
            // A source that is out of reach BY DESIGN is not a failed page, and saying "failed" about
            // it sends a reader hunting a fault that does not exist. The two outcomes are equally
            // incomplete and are not equally actionable, so they are rendered — and flagged —
            // differently. Duck-typed rather than `instanceof`, so the classification survives a
            // module realm boundary or a reconstructed error.
            if (error?.unavailable === true) {
                unavailable = true;
                reason      = `${kind}: unavailable on this plane (${error.message})`
            } else {
                reason = `${kind}: page ${pages + 1} failed (${error.message})`
            }

            break
        }

        if (!page || typeof page !== 'object') {
            reason = `${kind}: page ${pages + 1} returned no result`;
            break
        }

        // A source that answers with an error envelope has not proven anything about the tail; the
        // pages already collected stay, labelled incomplete.
        if (page.error) {
            reason = `${kind}: page ${pages + 1} returned an error (${page.error})`;
            break
        }

        items.push(...(Array.isArray(page.items) ? page.items : []));
        pages++;

        // The ONLY exit that proves completeness: the source itself says there is nothing after this.
        if (!page.hasNextPage) {
            exhausted = true;
            break
        }

        cursor = page.endCursor;

        // A source claiming a next page without a cursor cannot be walked further. That is truncation,
        // not completion — saying so is the whole point.
        if (typeof cursor !== 'string' || cursor.length === 0) {
            reason = `${kind}: source reported a next page without an end cursor`;
            break
        }
    }

    if (!exhausted && !reason) {
        reason = `${kind}: walk stopped at the ${maxPages}-page bound before the source reported exhaustion`
    }

    return {items, pages, exhausted, reason, unavailable}
}
