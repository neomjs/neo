import {setup} from '../../../../setup.mjs';

const appName = 'SessionServiceChurnCooldownTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * AC1 — the session-summary drift CHURN-GATE.
 *
 * `findSessionsToSummarize` must NOT re-select a session that is still actively receiving turns: such
 * a session's DB count climbs every `add_memory` turn while the last summary's `memoryCount` lags, so
 * it trips the Case-B count mismatch on EVERY sweep (measured pre-fix: 7 sessions re-summarized
 * 16-22×/day while holding the heavy-maintenance lease). The gate skips any session whose newest
 * memory is within `swarmHeartbeat.idleThresholdMs` of the sweep clock.
 *
 * Fully offline + deterministic: inject a fixed `now`, stub the two collections + the cross-harness
 * skip, and assert the active session is held while quiet sessions still drain — and that the SAME
 * session becomes selectable once it ages past the window (the gate releases; no starvation).
 */
test.describe('SessionService.findSessionsToSummarize — churn-gate (#13637)', () => {
    test.describe.configure({mode: 'serial'});

    let SDK, svc, aiConfig, idleThresholdMs, restore;

    const NOW = 1_700_000_000_000; // fixed sweep clock (ms epoch)

    test.beforeAll(async () => {
        SDK = await import('../../../../../../ai/services.mjs');

        if (!SDK.Memory_LifecycleService._initPromise) {
            await SDK.Memory_LifecycleService.initAsync();
        } else {
            await SDK.Memory_LifecycleService.ready();
        }

        svc             = SDK.Memory_SessionService;
        aiConfig        = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        idleThresholdMs = aiConfig.orchestrator.swarmHeartbeat.idleThresholdMs; // 10 min default
    });

    test.beforeEach(() => {
        const origMemGet   = svc.memoryCollection.get,
              origSessGet  = svc.sessionsCollection.get,
              origExternal = svc.getExternallyActiveSessionIds;

        // Isolate the churn-gate from the cross-harness WAKE_SUBSCRIPTION skip so the assertions
        // exercise the lastActivity gate alone.
        svc.getExternallyActiveSessionIds = () => new Set();

        restore = () => {
            svc.memoryCollection.get          = origMemGet;
            svc.sessionsCollection.get        = origSessGet;
            svc.getExternallyActiveSessionIds = origExternal;
        };
    });

    test.afterEach(() => restore?.());

    /**
     * Wires both collections from a per-session spec keyed by id:
     * `{count, lastActivityMs, summaryCount?}`. memoryCollection yields `count` rows whose newest
     * timestamp equals lastActivityMs; sessionsCollection yields a summary row carrying `summaryCount`
     * when it is a number (omit it for a Case-A "missing summary" session). Both stubs respect
     * offset/limit, matching real Chroma pagination.
     */
    function wire(spec) {
        const memRows = [], sumRows = [];

        for (const [sessionId, {count, lastActivityMs, summaryCount}] of Object.entries(spec)) {
            for (let i = 0; i < count; i++) {
                // Stagger so the NEWEST row equals lastActivityMs and older rows precede it.
                memRows.push({sessionId, timestamp: lastActivityMs - (count - 1 - i) * 1000});
            }
            if (typeof summaryCount === 'number') {
                sumRows.push({sessionId, memoryCount: summaryCount});
            }
        }

        svc.memoryCollection.get = async ({offset = 0, limit} = {}) => {
            const page = memRows.slice(offset, offset + limit);
            return {ids: page.map((_, i) => `m${offset + i}`), metadatas: page};
        };
        svc.sessionsCollection.get = async ({offset = 0, limit} = {}) => {
            const page = sumRows.slice(offset, offset + limit);
            return {ids: page.map(r => `summary_${r.sessionId}`), metadatas: page};
        };
    }

    test('holds an actively-growing session while draining quiet ones (mismatch + missing)', async () => {
        wire({
            'churn-active'  : {count: 5, lastActivityMs: NOW - 60_000,                     summaryCount: 2}, // 1 min ago → ACTIVE + mismatch
            'quiet-mismatch': {count: 5, lastActivityMs: NOW - (idleThresholdMs + 60_000), summaryCount: 2}, // past window → QUIET + mismatch
            'quiet-missing' : {count: 3, lastActivityMs: NOW - (idleThresholdMs + 60_000)}                   // past window → QUIET + no summary (Case A)
        });

        const result = await svc.findSessionsToSummarize({now: NOW});

        // The active session is churn-gated — pre-fix it tripped Case-B on every sweep.
        expect(result).not.toContain('churn-active');
        // The gate is targeted, not a global freeze: quiet sessions still drain.
        expect(result).toContain('quiet-mismatch');
        expect(result).toContain('quiet-missing');
    });

    test('releases the gate once the session ages past the idle window (no starvation)', async () => {
        wire({
            'was-active': {count: 5, lastActivityMs: NOW - 60_000, summaryCount: 2}
        });

        // Still active (1 min since the last turn) → held.
        expect(await svc.findSessionsToSummarize({now: NOW})).not.toContain('was-active');

        // The same session swept later, now quiet past the window → eligible (summarized once).
        const later = (NOW - 60_000) + idleThresholdMs + 1_000;
        expect(await svc.findSessionsToSummarize({now: later})).toContain('was-active');
    });

    test('does not re-select an active session across repeated sweeps (ratio → ~1)', async () => {
        wire({
            'steady': {count: 8, lastActivityMs: NOW - 30_000, summaryCount: 3} // active + mismatch
        });

        // Three back-to-back sweeps, each still inside the idle window → selected ZERO times.
        // Pre-fix the same setup re-selected it on all three (the 16-22× churn, in miniature).
        let selections = 0;
        for (const t of [NOW, NOW + 60_000, NOW + 120_000]) {
            const r = await svc.findSessionsToSummarize({now: t});
            if (r.includes('steady')) selections++;
        }
        expect(selections).toBe(0);
    });

    test('a future-skewed session stays eligible — never perpetually gated (timestamp-edge hardening)', async () => {
        wire({
            // lastActivity is in the FUTURE (clock drift): `nowMs - lastActivity` is negative, so a
            // bare `< cooldown` check is ALWAYS true → pre-fix the session was gated forever. The
            // `idleMs >= 0` guard makes a future timestamp eligible (summarize once) instead.
            'future-skew': {count: 5, lastActivityMs: NOW + 60_000, summaryCount: 2} // 1 min in the FUTURE + mismatch
        });

        expect(await svc.findSessionsToSummarize({now: NOW})).toContain('future-skew');
    });

    test('a session with an unparseable timestamp fails open (eligible), not stranded', async () => {
        // resolveGraphTimestampMs cannot parse the timestamp → lastActivity stays 0 (falsy), so the
        // gate's `sessionData.lastActivity && ...` short-circuits and the session stays eligible.
        svc.memoryCollection.get = async ({offset = 0, limit} = {}) => {
            const rows = [{sessionId: 'bad-ts', timestamp: 'not-a-timestamp'}, {sessionId: 'bad-ts', timestamp: 'also-bad'}];
            const page = rows.slice(offset, offset + limit);
            return {ids: page.map((_, i) => `m${offset + i}`), metadatas: page};
        };
        svc.sessionsCollection.get = async ({offset = 0, limit} = {}) => {
            const rows = [{sessionId: 'bad-ts', memoryCount: 99}]; // count mismatch (2 != 99) → Case B
            const page = rows.slice(offset, offset + limit);
            return {ids: page.map(r => `summary_${r.sessionId}`), metadatas: page};
        };

        expect(await svc.findSessionsToSummarize({now: NOW})).toContain('bad-ts');
    });
});
