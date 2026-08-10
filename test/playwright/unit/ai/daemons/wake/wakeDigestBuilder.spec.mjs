import {test, expect}        from '@playwright/test';
import {buildWakeDigest}     from '../../../../../../ai/daemons/wake/wakeDigestBuilder.mjs';
import {WAKE_LANE_DIRECTIVE} from '../../../../../../ai/daemons/wake/wakeLaneDirective.mjs';

// Event shapes mirror the daemon's own mapper (`ai/daemons/wake/daemon.mjs` switch on `result.type`):
// message carries `sentAt`, task carries `lastModifiedAt`, permission and heartbeat carry no clock.
const msg = (subject, sentAt, extra = {}) => ({
    type: 'message', messageId: `M-${subject}`, from: '@bob', subject, priority: 'normal', sentAt, logId: 1, ...extra
});

const task = (newState, lastModifiedAt, extra = {}) => ({
    type               : 'task',
    sourceEventId      : `E-${newState}-${lastModifiedAt}`,
    taskId             : 'TASK:1',
    previousState      : 'Submitted',
    newState,
    originator         : '@bob',
    assignee           : '@alice',
    assignmentAuthority: 'memory-core.v1',
    lastModifiedAt,
    logId              : 1,
    ...extra
});

const permission = (scope, grantedBy = '@bob') => ({type: 'permission', scope, grantedBy, logId: 1});

const heartbeat = (logId, summary = null) => ({type: 'heartbeat', targetIdentity: '@alice', pulseId: `P${logId}`, summary, logId});

const FRESH = '2026-08-01T11:21:47.000Z',
      STALE = '2026-07-31T23:04:46.000Z';

/**
 * @summary The daemon digest's per-bucket "latest" selection, pinned at the pure seam.
 *
 * The daemon queue is arrival-ordered, and both the live-flush and retry-union paths rebuild
 * digests over arrays that projection replay can deliver out of order. "latest" is the pointer
 * the woken agent reads first; each bucket must claim only the recency its event shape can
 * prove — messages by `sentAt`, tasks by `lastModifiedAt`, clock-less buckets by position.
 */
test.describe('ai/daemons/wake/wakeDigestBuilder', () => {

    test('an out-of-order message queue names the freshest sentAt as latest, not the last arrival', () => {
        // The replay shape: the fresh message was queued FIRST, then a replay batch of stale
        // backlog events — position would point "latest" at the backlog.
        const digest = buildWakeDigest('@alice', {
            messages: [msg('the fresh 11:21 message', FRESH), msg('stale replay 1', STALE), msg('stale replay 2', STALE)]
        });

        expect(digest).toContain('latest: "the fresh 11:21 message" from @bob');
        expect(digest).toContain('3 message events')
    });

    test('equal sentAt timestamps keep the last-enqueued message (no same-instant drift)', () => {
        const digest = buildWakeDigest('@alice', {
            messages: [msg('first', FRESH), msg('second', FRESH)]
        });

        expect(digest).toContain('latest: "second" from @bob')
    });

    test('clock-less messages fall back to arrival position', () => {
        const digest = buildWakeDigest('@alice', {
            messages: [msg('first-no-clock', undefined), msg('second-no-clock', undefined)]
        });

        expect(digest).toContain('latest: "second-no-clock" from @bob')
    });

    test('a clocked message outranks a clock-less later arrival', () => {
        const digest = buildWakeDigest('@alice', {
            messages: [msg('clocked', FRESH), msg('clock-less', undefined)]
        });

        expect(digest).toContain('latest: "clocked" from @bob')
    });

    test('an out-of-order task queue names the freshest lastModifiedAt transition as latest', () => {
        const digest = buildWakeDigest('@alice', {
            tasks: [task('Working', FRESH), task('Submitted', STALE)]
        });

        expect(digest).toContain('latest: Working on task TASK:1');
        expect(digest).toContain('2 task transitions')
    });

    test('permission grants keep arrival position (no clock on the daemon event shape)', () => {
        const digest = buildWakeDigest('@alice', {
            permissions: [permission('CAN_REVIEW'), permission('CAN_MERGE')]
        });

        expect(digest).toContain('latest: CAN_MERGE by @bob')
    });

    test('heartbeat pulses keep arrival position and still render the GitHub summary echo', () => {
        const summary = {
            source: 'github-notification',
            latest: {reason: 'review_requested', title: 'feat: x', url: 'https://example.com/pr/1', pullRequest: {number: 1, state: 'OPEN'}}
        };

        const digest = buildWakeDigest('@alice', {
            heartbeats: [heartbeat(41), heartbeat(42, summary)]
        });

        expect(digest).toContain('latest GraphLog: 42');
        expect(digest).toContain('latest GitHub review_requested: "feat: x"');
        expect(digest).toContain('[PR #1: OPEN]')
    });

    test('the retry-union concat (stale failure events before fresh ones) still names the fresh message', () => {
        // The retry path merges the failed delivery's events with the next flush's events by
        // CONCAT — first-failure events first — so the union is not arrival-sorted by design.
        const union = [msg('from the first failed flush', FRESH), msg('stale backlog row', STALE)];

        const digest = buildWakeDigest('@alice', {messages: union});

        expect(digest).toContain('latest: "from the first failed flush" from @bob')
    });

    test('priority header, divergent-latest suffix, and lane-directive gating survive the extraction', () => {
        const mixed = buildWakeDigest('@alice', {
            messages: [msg('urgent thing', STALE, {priority: 'high'}), msg('routine thing', FRESH, {priority: 'low'})]
        });

        // Header keeps the HIGHEST coalesced priority; the freshest message is weaker → suffix.
        expect(mixed).toContain('[WAKE][priority:high]');
        expect(mixed).toContain('latest: "routine thing" from @bob, latest priority: low');
        expect(mixed).not.toContain(WAKE_LANE_DIRECTIVE);

        const pureHeartbeat = buildWakeDigest('@alice', {heartbeats: [heartbeat(7)]});

        expect(pureHeartbeat).toContain(WAKE_LANE_DIRECTIVE)
    });
});
