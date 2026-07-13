/**
 * @module ai/services/memory-core/helpers/chronologicalWindowSources
 * @summary The chronological completeness **spine** of the temporal Bird View retrieve leg: walks the
 * recency cursor to exhaustion across the requested partition, keeps only the items inside the half-open
 * window, cross-agent de-duplicates, and reports an honest coverage manifest.
 *
 * This is the backbone that PROVES which sources exist in a window — not a relevance-ranked semantic sample.
 * Completeness is earned by exhaustion: a partition is complete only when every walked identity's cursor
 * reached its end (or paged strictly past the window's start) within the runaway cap and no page fetch
 * failed. A cap hit or a fetch error yields `coverage.degraded` with a reason, so the envelope withholds any
 * narrative — a partial recency walk must never masquerade as "everything that happened."
 *
 * The page fetch is **injected** (`fetchPage`), so the pagination / window-filter / de-dup logic is pure and
 * hermetically testable while the real `query_recent_turns` adapter plugs into the same seam. Pages are
 * assumed newest-first (recency order), matching the recency cursor contract.
 */

/**
 * @summary Coerces a `Date` / ISO-8601 string / epoch-ms number to finite epoch milliseconds, or `null`.
 * (Duplicated across the temporal helpers — extract to a shared helper if a further consumer appears.)
 * @param {Date|String|Number} value
 * @returns {Number|null}
 */
function toEpochMs(value) {
    if (value instanceof Date)     return Number.isFinite(value.getTime()) ? value.getTime() : null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') return Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

    return null
}

/**
 * @summary Walks the recency cursor to exhaustion for one identity, collecting the items inside the window.
 *
 * Stops when the cursor is exhausted (`nextCursor` falsy), when a page's OLDEST item is already older than
 * the window start (chronological order guarantees no older page can re-enter the window), or when the
 * runaway page cap is hit (reported as an un-exhausted walk). A thrown page fetch ends the walk un-exhausted.
 *
 * @param {Object} options
 * @param {String} options.identity          The agent identity whose recency stream is walked.
 * @param {Number} options.windowStart       Inclusive window start (epoch ms).
 * @param {Number} options.windowEnd         Exclusive window end (epoch ms).
 * @param {Function} options.fetchPage        `async ({identity, cursor}) => {items: [{id, timestamp, ...}], nextCursor}`.
 * @param {Number} options.maxPages          Runaway page cap.
 * @returns {Promise<{items: Object[], exhausted: Boolean, pages: Number, error: (String|null)}>}
 */
async function walkIdentity({identity, windowStart, windowEnd, fetchPage, maxPages}) {
    const collected = [];
    let   cursor    = undefined,
        pages     = 0,
        exhausted = false,
        error     = null;

    while (true) {
        if (pages >= maxPages) break;   // runaway guard → left un-exhausted (degraded upstream)

        pages++;

        let page;

        try {
            page = await fetchPage({identity, cursor})
        } catch (fetchError) {
            error = fetchError instanceof Error ? fetchError.message : String(fetchError);
            break
        }

        const items = Array.isArray(page?.items) ? page.items : [];

        for (const item of items) {
            const ts = toEpochMs(item?.timestamp);

            if (ts !== null && ts >= windowStart && ts < windowEnd) {
                collected.push({...item, identity})
            }
        }

        // recency order (newest-first): once the OLDEST item on the page predates the window start, every
        // older page is out of the window too — stop, and the walk is exhausted WITHIN the window.
        const oldestTs = items.length ? toEpochMs(items[items.length - 1]?.timestamp) : null;

        if (oldestTs !== null && oldestTs < windowStart) {
            exhausted = true;
            break
        }

        if (!page?.nextCursor) {
            exhausted = true;
            break
        }

        cursor = page.nextCursor
    }

    return {items: collected, exhausted, pages, error}
}

/**
 * @summary Enumerates every Memory/session source inside a resolved window by exhausting the recency cursor.
 *
 * @param {Object} options
 * @param {Object} options.window The resolved half-open window (from `resolveTemporalWindow`).
 * @param {String[]} options.identities The agent identities to walk — one for `@<identity>`, the full roster for `unified`.
 * @param {Function} options.fetchPage `async ({identity, cursor}) => {items: [{id, timestamp, ...}], nextCursor}`.
 * @param {Number} [options.maxPagesPerIdentity=1000] Runaway page cap per identity.
 * @returns {Promise<{sources: Object[], coverage: {totalResolved: Number, identitiesWalked: Number, exhausted: Boolean, degraded: Boolean, degradedReason: (String|null)}}>}
 */
export async function enumerateChronologicalWindowSources({window, identities, fetchPage, maxPagesPerIdentity = 1000} = {}) {
    if (!window || typeof window !== 'object') {
        throw new Error('enumerateChronologicalWindowSources: a resolved `window` is required')
    }

    if (typeof fetchPage !== 'function') {
        throw new Error('enumerateChronologicalWindowSources: an injected `fetchPage` function is required')
    }

    const identityList = Array.isArray(identities) ? identities.filter(Boolean) : [];

    if (identityList.length === 0) {
        throw new Error('enumerateChronologicalWindowSources: at least one identity is required to walk')
    }

    const {windowStart, windowEnd} = window,
          byId                     = new Map(),   // cross-agent de-dup by source id (first walk wins)
          failed                   = [];
    let   allExhausted = true;

    for (const identity of identityList) {
        const walk = await walkIdentity({identity, windowStart, windowEnd, fetchPage, maxPages: maxPagesPerIdentity});

        if (!walk.exhausted) {
            allExhausted = false;
            failed.push(walk.error ? `${identity}: ${walk.error}` : `${identity}: page-cap`)
        }

        for (const item of walk.items) {
            if (!byId.has(item.id)) {
                byId.set(item.id, item)
            }
        }
    }

    const sources  = [...byId.values()],
          degraded = !allExhausted;

    return {
        sources,
        coverage: {
            totalResolved   : sources.length,
            identitiesWalked: identityList.length,
            exhausted       : allExhausted,
            degraded,
            degradedReason  : degraded ? `chronological-walk-incomplete: ${failed.join('; ')}` : null
        }
    }
}
