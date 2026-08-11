import {WAKE_LANE_DIRECTIVE} from './wakeLaneDirective.mjs';

const WAKE_PRIORITY_RANKS = {
    low   : 0,
    normal: 1,
    high  : 2
};

/**
 * @summary Formats an optional live PR-state echo embedded in a heartbeat pulse summary.
 * @param {Object} summary Decoded heartbeat summary.
 * @returns {String}
 */
function formatPullRequestStateEcho(summary = {}) {
    const pullRequest = summary.latest?.pullRequest;
    if (!pullRequest?.state || !pullRequest?.number) return '';

    const mergedAt  = pullRequest.mergedAt  ? `, mergedAt ${pullRequest.mergedAt}`   : '',
          checkedAt = pullRequest.checkedAt ? `, checkedAt ${pullRequest.checkedAt}` : '';
    return ` [PR #${pullRequest.number}: ${pullRequest.state}${mergedAt}${checkedAt}]`
}

/**
 * @summary Normalizes wake digest priority values to the supported A2A priority vocabulary.
 *
 * The wake-priority digest surface intentionally reuses the existing A2A mailbox priority
 * values (`low`, `normal`, `high`) instead of introducing a transport-only urgency enum.
 * Unknown or missing priorities collapse to `normal` so malformed mailbox data cannot
 * produce ambiguous wake headers.
 *
 * @param {String} priority The raw message priority from the mailbox payload.
 * @returns {String} The normalized wake digest priority.
 * @private
 */
function normalizeWakePriority(priority) {
    return Object.hasOwn(WAKE_PRIORITY_RANKS, priority) ? priority : 'normal';
}

/**
 * @summary Projects coalesced message events into one wake digest priority.
 *
 * The wake daemon may coalesce several message events into one digest. This helper
 * preserves the strongest interruption signal by choosing the highest message priority
 * for the `[WAKE][priority:<level>]` header while keeping normal/low wakes deferrable
 * by agent policy.
 *
 * @param {Object[]} messages Coalesced message wake events.
 * @returns {String} The highest normalized wake digest priority.
 * @private
 */
export function getHighestWakePriority(messages) {
    return messages.reduce((highest, message) => {
        const priority = normalizeWakePriority(message.priority);

        return WAKE_PRIORITY_RANKS[priority] > WAKE_PRIORITY_RANKS[highest] ? priority : highest;
    }, 'normal');
}

/**
 * @summary Selects a bucket's latest event by the bucket's own event-time clock.
 *
 * Messages resolve by `sentAt`, task transitions by `lastModifiedAt` — true event times, so
 * an out-of-order queue (projection replay, retry-union rebuild) cannot name a stale event
 * while a newer one is present. Equal timestamps keep the LAST-enqueued candidate (no drift
 * for same-instant events); a candidate with an unparseable or missing clock never outranks
 * a clocked one; when NO candidate carries a resolvable clock the bucket keeps arrival
 * position (last element), the previous behavior.
 *
 * @param {Object[]} events Bucket events in arrival order.
 * @param {String}   field  The event property carrying the ISO timestamp.
 * @returns {Object}
 * @private
 */
function latestByEventTime(events, field) {
    let best   = null,
        bestTs = -Infinity;

    for (const event of events) {
        const value = event?.[field];

        if (typeof value === 'string') {
            const ts = Date.parse(value);

            if (Number.isFinite(ts) && ts >= bestTs) {
                best   = event;
                bestTs = ts;
            }
        }
    }

    return best ?? events[events.length - 1]
}

/**
 * @summary Builds the `[WAKE]` digest string for a set of wake events. Extracted so the retry path
 * can rebuild a SINGLE digest over the UNION of events accumulated across same-subscription failures
 * (correct total count + max priority), rather than replaying one stale per-failure string.
 *
 * Each bucket's "latest" resolves by the truest clock its event shape carries: messages by
 * the message's own `sentAt`, task transitions by the canonical `lastModifiedAt` — so an
 * out-of-order queue (projection replay, retry-union concat) cannot point "latest" at a stale
 * event while a newer one is present. Permission and heartbeat events carry no event-time
 * clock on the daemon's mapper, so those buckets keep arrival position; the daemon's own
 * freshness partitioner already refuses GraphLog position for exactly this reason. "Latest"
 * is the pointer the woken agent reads first, so each bucket claims only the recency its own
 * shape can prove.
 *
 * @see CoalescingEngineService.resolveEventTimestamp (ai/services/memory-core/CoalescingEngineService.mjs) —
 *      the engine-side sibling seam for per-bucket "latest" recency; structured digest envelope vs
 *      this module's string digest. Deliberately separate implementations (Neo singleton vs spawn-only
 *      daemon entrypoint) — repair one, check the other.
 *
 * @param {String} identity Recipient agent identity.
 * @param {Object} events `{messages, tasks, permissions, heartbeats}` arrays.
 * @returns {String}
 */
export function buildWakeDigest(identity, {messages = [], tasks = [], permissions = [], heartbeats = []} = {}) {
    const N              = messages.length + tasks.length + permissions.length + heartbeats.length,
          digestPriority = getHighestWakePriority(messages);

    let breakdown = '';

    if (messages.length > 0) {
        const latest         = latestByEventTime(messages, 'sentAt'),
              latestPriority = normalizeWakePriority(latest.priority),
              prioritySuffix = latestPriority === digestPriority ? '' : `, latest priority: ${latestPriority}`;
        // COUNTS QUEUED EVENTS. This function's own signature says so: the parameter object is
        // `events`, and `messages` is its message-class event array. Same rename as the sibling
        // seam in `localWakeAdapters.mjs` - both must move together or the two renderers disagree
        // about what the same number means.
        breakdown += `\n- ${messages.length} message events (latest: "${latest.subject}" from ${latest.from}${prioritySuffix})`;
    }
    if (tasks.length > 0) {
        const latest = latestByEventTime(tasks, 'lastModifiedAt');
        breakdown += `\n- ${tasks.length} task transitions (latest: ${latest.newState} on task ${latest.taskId})`;
    }
    if (permissions.length > 0) {
        const latest = permissions[permissions.length - 1];
        breakdown += `\n- ${permissions.length} permissions granted (latest: ${latest.scope} by ${latest.grantedBy})`;
    }
    if (heartbeats.length > 0) {
        const latest  = heartbeats[heartbeats.length - 1],
              summary = latest.summary;

        let extra = '';
        if (summary?.source === 'github-notification') {
            extra = `; latest GitHub ${summary.latest?.reason || 'notification'}: "${summary.latest?.title || summary.latest?.id || 'untitled'}"${formatPullRequestStateEcho(summary)}${summary.latest?.url ? ` (${summary.latest.url})` : ''}`;
        } else if (summary?.source === 'idle-out-nudge') {
            extra = `; idle-out nudge — ${summary.reason || 'idle'}; next: ${summary.nextAction || 'claim a lane'}`;
        }

        breakdown += `\n- ${heartbeats.length} heartbeat pulses (latest GraphLog: ${latest.logId}${extra})`;
    }

    // The lifecycle-first lane directive is an IDLE-watchdog nudge — append it ONLY to pure-heartbeat
    // digests (the watchdog pulse with no actionable A2A content). A digest carrying messages / tasks /
    // permissions already has a specific event to act on, so the generic directive is noise + token waste
    // there; and message wakes vastly outnumber the heartbeat, so this gate is the dominant token saving.
    const isPureHeartbeat = heartbeats.length > 0 && messages.length === 0 && tasks.length === 0 && permissions.length === 0,
          laneDirective   = isPureHeartbeat ? `\n\n${WAKE_LANE_DIRECTIVE}` : '';

    return `[WAKE][priority:${digestPriority}] ${N} events for ${identity}: ${breakdown}${laneDirective}`
}
