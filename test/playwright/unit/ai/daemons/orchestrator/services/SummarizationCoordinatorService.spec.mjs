import {test, expect} from '@playwright/test';
// Test-side entry-point bootstrap: Neo + core/_export populate `globalThis.Neo`
// before SummarizationCoordinatorService.mjs is loaded (whose Base import transitively
// triggers `Neo.gatekeep()` in Compare.mjs at module-load). Mirrors the pattern in
// Orchestrator.spec.mjs and matches the entry-point invariant — class files no longer
// import Neo themselves; their bootstrap is the entry point's job.
import Neo       from '../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../src/core/_export.mjs';
import {
    buildSummaryTrigger
} from '../../../../../../../ai/daemons/orchestrator/services/SummarizationCoordinatorService.mjs';

test.describe('SummarizationCoordinatorService (#11009)', () => {
    test('prioritizes unread sunset handovers over the periodic sweep', () => {
        expect(buildSummaryTrigger({
            now       : 1200000,
            lastRunAt : 0,
            intervalMs: 600000,
            handovers : [{id: 'MESSAGE:1'}, {id: 'MESSAGE:2'}]
        })).toEqual({
            taskName     : 'summary',
            source       : 'sunset-handover',
            reason       : 'sunset-handover:2',
            handoverCount: 2
        });
    });

    test('returns a periodic sweep trigger only when the interval is due', () => {
        expect(buildSummaryTrigger({
            now       : 599999,
            lastRunAt : 0,
            intervalMs: 600000,
            handovers : []
        })).toBeNull();

        expect(buildSummaryTrigger({
            now       : 600000,
            lastRunAt : 0,
            intervalMs: 600000,
            handovers : []
        })).toEqual({
            taskName: 'summary',
            source  : 'periodic-sweep',
            reason  : 'periodic-sweep:600000'
        });
    });

    test('does not schedule disabled periodic sweeps', () => {
        expect(buildSummaryTrigger({
            now       : 600000,
            lastRunAt : 0,
            intervalMs: 0,
            handovers : []
        })).toBeNull();
    });
});
