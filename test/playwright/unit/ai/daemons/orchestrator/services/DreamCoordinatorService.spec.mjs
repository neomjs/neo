import {test, expect} from '@playwright/test';
// Test-side entry-point bootstrap: Neo + core/_export populate `globalThis.Neo`
// before DreamCoordinatorService.mjs is loaded (whose Base import transitively
// triggers `Neo.gatekeep()` in Compare.mjs at module-load). Mirrors the pattern in
// SummarizationCoordinatorService.spec.mjs.
import Neo       from '../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../src/core/_export.mjs';
import DreamCoordinatorService, {
    buildDreamTrigger
} from '../../../../../../../ai/daemons/orchestrator/services/DreamCoordinatorService.mjs';

test.describe('DreamCoordinatorService (#11858 / Epic #11831)', () => {
    test('returns a periodic-dream trigger when the interval has elapsed since lastRunAt', () => {
        expect(buildDreamTrigger({
            now       : 600000,
            lastRunAt : 0,
            intervalMs: 600000
        })).toEqual({
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : 'periodic-dream:600000'
        });
    });

    test('returns null when the interval has not yet elapsed', () => {
        expect(buildDreamTrigger({
            now       : 599999,
            lastRunAt : 0,
            intervalMs: 600000
        })).toBeNull();
    });

    test('treats intervalMs <= 0 as disabled (does not fire)', () => {
        expect(buildDreamTrigger({
            now       : 999999999,
            lastRunAt : 0,
            intervalMs: 0
        })).toBeNull();

        expect(buildDreamTrigger({
            now       : 999999999,
            lastRunAt : 0,
            intervalMs: -1
        })).toBeNull();
    });

    test('treats elapsed-exactly-equal-to-intervalMs as due (≥ boundary)', () => {
        const intervalMs = 300000;
        expect(buildDreamTrigger({
            now       : 1000000 + intervalMs,
            lastRunAt : 1000000,
            intervalMs
        })).toEqual({
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : `periodic-dream:${intervalMs}`
        });
    });

    test('reason carries the interval value verbatim (for telemetry/audit)', () => {
        const intervalMs = 1800000;  // 30 min
        const trigger    = buildDreamTrigger({
            now       : 2_000_000_000,
            lastRunAt : 1_999_990_000,
            intervalMs
        });
        // Below interval threshold (elapsed = 10_000ms, interval = 1_800_000ms) — null
        expect(trigger).toBeNull();

        // Above interval threshold
        expect(buildDreamTrigger({
            now       : 2_000_000_000,
            lastRunAt : 0,
            intervalMs
        })).toEqual({
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : `periodic-dream:${intervalMs}`
        });
    });

    test('DreamCoordinatorService.getDueTask({...}) wraps buildDreamTrigger correctly with state mapping', () => {
        const result = DreamCoordinatorService.getDueTask({
            state          : {lastRunAt: 1000},
            now            : 1000 + 600000,
            dreamIntervalMs: 600000
        });
        expect(result).toEqual({
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : 'periodic-dream:600000'
        });
    });

    test('DreamCoordinatorService.getDueTask handles missing state gracefully (lastRunAt defaults to 0)', () => {
        const result = DreamCoordinatorService.getDueTask({
            state          : undefined,
            now            : 600000,
            dreamIntervalMs: 600000
        });
        expect(result).toEqual({
            taskName: 'dream',
            source  : 'periodic-dream',
            reason  : 'periodic-dream:600000'
        });
    });

    test('DreamCoordinatorService.getDueTask returns null when state.lastRunAt is recent', () => {
        const result = DreamCoordinatorService.getDueTask({
            state          : {lastRunAt: 599999},
            now            : 600000,
            dreamIntervalMs: 600000
        });
        // elapsed = 1ms, interval = 600000ms — not due
        expect(result).toBeNull();
    });
});
