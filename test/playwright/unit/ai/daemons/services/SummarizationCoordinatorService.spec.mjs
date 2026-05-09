import {test, expect} from '@playwright/test';
import {
    buildSummaryTrigger
} from '../../../../../../ai/daemons/services/SummarizationCoordinatorService.mjs';

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
