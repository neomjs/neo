/**
 * @module ai/services/memory-core/helpers/reviewLoadProjection
 * @summary Pure derivation of per-reviewer open re-review loops from the plane-resident A2A
 * review-lifecycle trail.
 *
 * The swarm's review protocol makes the lifecycle pings mandatory, so the mailbox holds the
 * canonical record of who is holding what: a reviewer opens a loop with a `CHANGES_REQUESTED`
 * review-posted ping and retires it with their own later `APPROVED` one, and the author hands the
 * ball back with a re-review request addressed to the reviewer. The subject line is the protocol
 * surface — `relatedTickets` deliberately plays no part, because a review ping also lists the
 * TICKETS it resolves, and counting those would open phantom loops on issues nobody reviewed.
 *
 * The classifier is anchored on the FIRST bracket tag so that prose naming a disposition without
 * being one — a stale-approval warning quoting `APPROVED`, an author response quoting the
 * `CHANGES_REQUESTED` it answers — neither opens nor retires a loop. Messages whose subjects do not
 * follow the ping conventions are invisible to this derivation; the serving envelope declares that
 * blind class rather than pretending completeness.
 *
 * This helper performs no I/O, repair, configuration lookup, or mutation: callers pass already-read
 * message rows and receive the per-reviewer projection.
 */

/**
 * The trail horizon: a loop whose latest movement is older than this ages out of the count. A
 * months-older open loop is a stale trail, not a live obligation — the envelope declares the
 * window rather than silently keeping or silently dropping it.
 * @type {Number}
 */
export const REVIEW_LOAD_TRAIL_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

const APPROVED_PATTERN   = /\bAPPROVED\b/i;
const CHANGES_PATTERN    = /\b(?:CHANGES_REQUESTED|REQUEST_CHANGES)\b/i;
const CLOSE_TAG_PATTERN  = /^(?:review-posted|APPROVED)\b/i;
const FIRST_TAG_PATTERN  = /^\s*\[([^\]]+)]/;
const OPEN_TAG_PATTERN   = /^(?:review-posted|CHANGES_REQUESTED|REQUEST_CHANGES)\b/i;
const PR_REF_PATTERN     = /\bPR\s*#(\d+)\b/gi;
const RETURN_TAG_PATTERN = /^(?:re-?review|review-response|author[- ]response)\b/i;

/**
 * @summary Derives the per-reviewer re-review load from raw mailbox message rows.
 *
 * A loop `(reviewer, PR)` opens on the reviewer's `CHANGES_REQUESTED` ping and retires on their
 * own later `APPROVED` ping for the same PR — any later reviewer, any later round, only the same
 * identity closes what it opened. A fresh `CHANGES_REQUESTED` on an open loop re-arms it (the ball
 * is the author's again) and moves its clock. A re-review-class ping addressed TO the reviewer
 * marks the loop `returned`: the ball is provably back with its holder.
 *
 * @param {Object[]} messages Raw rows: `{from, to, subject, sentAt}` (missing fields skip a row).
 * @param {Object} [options]
 * @param {Number} [options.horizonMs=REVIEW_LOAD_TRAIL_HORIZON_MS] Trail window; older movement
 *     does not participate.
 * @param {Date|String|Number} [options.now=Date.now()] Clock source (unit-test seam).
 * @returns {Map<String, {open: Number, returned: Number, loops: Object[]}>} Reviewer identity →
 *     its load. `loops` rides oldest-first so the stalest obligation surfaces at the head. A
 *     reviewer with no open loops has NO map entry — the absent entry IS the zero.
 */
export function deriveReviewLoad(messages, {horizonMs = REVIEW_LOAD_TRAIL_HORIZON_MS, now = Date.now()} = {}) {
    const
        nowMs   = now instanceof Date ? now.getTime() : new Date(now).getTime(),
        floorMs = nowMs - horizonMs,
        loops   = new Map();

    const sorted = (Array.isArray(messages) ? messages : [])
        .slice()
        .sort((a, b) => new Date(a?.sentAt || 0).getTime() - new Date(b?.sentAt || 0).getTime());

    for (const message of sorted) {
        const {from, to, sentAt, subject} = message ?? {};

        if (!from || !subject || !sentAt) continue;

        const sentMs = new Date(sentAt).getTime();
        if (!Number.isFinite(sentMs) || sentMs < floorMs || sentMs > nowMs) continue;

        const refs = [...String(subject).matchAll(PR_REF_PATTERN)].map(match => Number(match[1]));
        if (refs.length === 0) continue;

        const firstTag = subject.match(FIRST_TAG_PATTERN)?.[1] ?? '';

        const
            approvedAt = subject.search(APPROVED_PATTERN),
            changesAt  = subject.search(CHANGES_PATTERN);

        // The disposition a subject IS beats the disposition it QUOTES: when both vocabularies
        // appear, the earlier mention carries the verdict — "APPROVED — all CHANGES_REQUESTED
        // items verified" retires the loop it names, it does not open one.
        if (changesAt > -1 && (approvedAt === -1 || changesAt < approvedAt) && OPEN_TAG_PATTERN.test(firstTag)) {
            for (const pr of refs) {
                loops.set(`${from}|${pr}`, {pr, returned: false, reviewer: from, since: new Date(sentMs).toISOString()});
            }
        } else if (approvedAt > -1 && CLOSE_TAG_PATTERN.test(firstTag)) {
            for (const pr of refs) {
                loops.delete(`${from}|${pr}`);
            }
        } else if (to && RETURN_TAG_PATTERN.test(firstTag)) {
            for (const pr of refs) {
                const loop = loops.get(`${to}|${pr}`);
                if (loop) loop.returned = true;
            }
        }
    }

    const byReviewer = new Map();

    for (const loop of loops.values()) {
        const list = byReviewer.get(loop.reviewer) ?? [];
        list.push(loop);
        byReviewer.set(loop.reviewer, list);
    }

    const result = new Map();

    for (const [reviewer, reviewerLoops] of byReviewer) {
        reviewerLoops.sort((a, b) => new Date(a.since).getTime() - new Date(b.since).getTime());

        result.set(reviewer, {
            loops   : reviewerLoops,
            open    : reviewerLoops.length,
            returned: reviewerLoops.filter(loop => loop.returned).length
        });
    }

    return result
}
