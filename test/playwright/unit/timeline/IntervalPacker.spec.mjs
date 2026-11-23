import {setup} from '../../setup.mjs';

const appName = 'IntervalPackerTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import IntervalPacker from '../../../../src/timeline/util/IntervalPacker.mjs';

test.describe('Neo.timeline.util.IntervalPacker', () => {
    test('extends Neo.core.Base under the Neo.timeline.util.IntervalPacker namespace', () => {
        expect(Neo.ns('Neo.timeline.util.IntervalPacker')).toBe(IntervalPacker);
        expect(core.Base.prototype.isPrototypeOf(IntervalPacker.prototype)).toBe(true);
    });

    test('packs overlapping intervals into minimal lanes per connected cluster without mutating input order', () => {
        const
            // Cluster 1: three overlapping intervals requiring 2 lanes (a: 09–11, b: 10–12, c: 11–13 reuses lane 0)
            c = {id: 'c', startDate: new Date(2026, 10, 9, 11, 0), endDate: new Date(2026, 10, 9, 13, 0)},
            a = {id: 'a', startDate: new Date(2026, 10, 9, 9,  0), endDate: new Date(2026, 10, 9, 11, 0)},
            b = {id: 'b', startDate: new Date(2026, 10, 9, 10, 0), endDate: new Date(2026, 10, 9, 12, 0)},
            // Cluster 2: isolated interval later in the day -> laneCount must be 1, not 2
            d = {id: 'd', startDate: new Date(2026, 10, 9, 15, 0), endDate: new Date(2026, 10, 9, 16, 0)},
            input = [c, a, b, d];

        const packed = IntervalPacker.pack(input);

        // Input array order is preserved
        expect(input.map(item => item.id)).toEqual(['c', 'a', 'b', 'd']);
        expect(packed.map(entry => entry.item.id)).toEqual(['c', 'a', 'b', 'd']);

        expect(packed.byItem.get(a)).toEqual({item: a, lane: 0, laneCount: 2});
        expect(packed.byItem.get(b)).toEqual({item: b, lane: 1, laneCount: 2});
        // 'c' starts at 11:00 right when 'a' ends, so it reuses lane 0 within the 2-lane cluster
        expect(packed.byItem.get(c)).toEqual({item: c, lane: 0, laneCount: 2});
        // 'd' is in its own non-overlapping cluster
        expect(packed.byItem.get(d)).toEqual({item: d, lane: 0, laneCount: 1});
    });

    test('assigns distinct lanes to simultaneous zero-duration milestones and supports custom field names', () => {
        const
            m1 = {id: 'm1', begin: new Date(2026, 10, 9, 10, 0), finish: new Date(2026, 10, 9, 10, 0)},
            m2 = {id: 'm2', begin: new Date(2026, 10, 9, 10, 0), finish: new Date(2026, 10, 9, 10, 0)};

        const packer = Neo.create(IntervalPacker, {
            startField: 'begin',
            endField  : 'finish'
        });

        const packed = packer.pack([m1, m2]);

        expect(packed.byItem.get(m1)).toEqual({item: m1, lane: 0, laneCount: 2});
        expect(packed.byItem.get(m2)).toEqual({item: m2, lane: 1, laneCount: 2});

        packer.destroy();
    });
});
