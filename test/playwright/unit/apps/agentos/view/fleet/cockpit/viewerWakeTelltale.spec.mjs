import {setup} from '../../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'ViewerWakeTelltaleTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';

import ViewerWakeTelltale from '../../../../../../../../apps/agentos/util/ViewerWakeTelltale.mjs';

/**
 * The per-viewer wake-push telltale derivation. The load-bearing properties: the
 * consumer's vocabulary passes through VERBATIM (`alive: true` is the only positive state, every
 * reason string renders unedited), the catch-up axis keeps its three states apart with `null` as
 * honest absence, and state never travels by hue alone — the text always carries the message.
 */
test.describe('viewerWakeTelltale — the quiet chrome readout of MY push lane', () => {
    const NOW = 1_000_000;

    test('live stream with a fresh signal: one quiet token plus the relative receipt age', () => {
        const {ariaLabel, cls, text, title} = ViewerWakeTelltale.describeViewerWakeTelltale({
            stream : {alive: true, reason: 'composed wake stream connected · armed for this viewer', capturedAt: NOW},
            catchUp: {state: 'fresh', at: NOW - 5_000, pending: 3},
            signals: [{kind: 'wake/digest', emittedAt: '2026-08-16T19:00:00.000Z', receivedAt: NOW - 12_000}],
            nowMs  : NOW
        });

        expect(text).toBe('wake: live · 12s ago');
        expect(cls).toEqual(['fm-viewer-wake', 'fm-viewer-wake-live']);
        expect(ariaLabel).toBe('Viewer wake push: wake: live · 12s ago');
        expect(title).toContain('wake push live — composed wake stream connected · armed for this viewer');
        expect(title).toContain('catch-up: fresh (3 pending drained) · 5s ago');
        expect(title).toContain('last signals: wake/digest · 12s ago')
    });

    test('live with no signals yet: the token stands alone and the title says so honestly', () => {
        const {text, title} = ViewerWakeTelltale.describeViewerWakeTelltale({
            stream: {alive: true, reason: 'composed wake stream connected · armed for this viewer', capturedAt: NOW},
            nowMs : NOW
        });

        expect(text).toBe('wake: live');
        expect(title).toContain('no signals observed on this stream');
        expect(title).toContain('catch-up: no observation')
    });

    test("the consumer's absence-of-signal reason renders VERBATIM — disconnected", () => {
        const reason = 'wake stream disconnected (stream refused: HTTP 401) — poll remains the truth lane';

        const {cls, text} = ViewerWakeTelltale.describeViewerWakeTelltale({
            stream: {alive: 'unknown', reason, capturedAt: NOW},
            nowMs : NOW
        });

        expect(text).toBe(`wake: ${reason}`);
        expect(cls).toEqual(['fm-viewer-wake', 'fm-viewer-wake-degraded'])
    });

    test('the not-wired composition renders the stamped reason, never a fabricated stream', () => {
        const {text, title} = ViewerWakeTelltale.describeViewerWakeTelltale({
            stream: {alive: 'unknown', reason: 'wake push not wired — this composition carries no direct-browser wake capability', capturedAt: NOW},
            nowMs : NOW
        });

        expect(text).toContain('wake push not wired');
        expect(title).toContain('wake push unavailable — wake push not wired')
    });

    test('catch-up keeps failed ≠ empty apart, and absence is absence', () => {
        const stream = {alive: true, reason: 'composed wake stream connected · armed for this viewer', capturedAt: NOW};

        expect(ViewerWakeTelltale.describeViewerWakeTelltale({stream, catchUp: {state: 'failed', at: NOW - 1_000, pending: null}, nowMs: NOW}).title)
            .toContain('catch-up: failed · 1s ago');
        expect(ViewerWakeTelltale.describeViewerWakeTelltale({stream, catchUp: {state: 'empty', at: NOW - 2_000, pending: 0}, nowMs: NOW}).title)
            .toContain('catch-up: empty · 2s ago');
        expect(ViewerWakeTelltale.describeViewerWakeTelltale({stream, catchUp: null, nowMs: NOW}).title)
            .toContain('catch-up: no observation')
    });

    test('no stream observation at all stays inside the closed vocabulary', () => {
        const {cls, text} = ViewerWakeTelltale.describeViewerWakeTelltale({nowMs: NOW});

        expect(text).toBe('wake: no stream observation');
        expect(cls).toEqual(['fm-viewer-wake', 'fm-viewer-wake-degraded'])
    });

    test('the title carries at most five signals — the feed is the archive bound, the title is the glance bound', () => {
        const signals = [1, 2, 3, 4, 5, 6, 7].map(n => ({kind: `wake/k${n}`, receivedAt: NOW - n * 1000}));

        const {title} = ViewerWakeTelltale.describeViewerWakeTelltale({
            stream: {alive: true, reason: 'composed wake stream connected', capturedAt: NOW},
            signals,
            nowMs : NOW
        });

        expect(title).toContain('wake/k5');
        expect(title).not.toContain('wake/k6')
    })
});
