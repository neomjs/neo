import {setup} from '../../setup.mjs';

const appName = 'EventStoreTest';

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

import {test, expect}               from '@playwright/test';
import Neo                          from '../../../../src/Neo.mjs';
import * as core                    from '../../../../src/core/_export.mjs';
import TreeModel                    from '../../../../src/data/TreeModel.mjs';
import EventModel, {timelineFields} from '../../../../src/timeline/model/Event.mjs';
import EventStore                   from '../../../../src/timeline/store/Events.mjs';

class EventTreeProbeModel extends TreeModel {
    static config = {
        className: 'Test.Unit.Timeline.EventTreeProbeModel',
        fields   : [
            ...timelineFields,
            {name: 'duration',     type: 'Number', defaultValue: 0},
            {name: 'durationUnit', type: 'String', defaultValue: 'hour'},
            {name: 'percentDone',  type: 'Number', defaultValue: 0}
        ]
    }
}

Neo.setupClass(EventTreeProbeModel);

test.describe('Neo.timeline.model.Event and Neo.timeline.store.Events', () => {
    test('uses half-open overlap with milestone, point, invalid and reversed bounds', () => {
        const overlaps = EventStore.intersectsRange;
        expect(overlaps(10, 10, 10, 20)).toBe(true);
        expect(overlaps(20, 20, 10, 20)).toBe(false);
        expect(overlaps(10, 10, 10, 10)).toBe(true);
        expect(overlaps(5, 15, 10, 10)).toBe(true);
        expect(overlaps(5, 10, 10, 10)).toBe(false);
        expect(overlaps(NaN, 10, 0, 20)).toBe(false);
        expect(overlaps(0, 10, 20, 10)).toBe(false);
        // Reversed event bounds retain the prior overlap rule.
        expect(overlaps(15, 5, 0, 20)).toBe(true)
    });

    test('matches numeric and string resource keys while preserving empty and absent keys', () => {
        const rows = [
            {id: 'numeric', resourceId: 7}, {id: 'text', resourceId: '7'},
            {id: 'empty', resourceId: ''}, {id: 'absent', resourceId: null}
        ].map(row => ({...row, startDate: new Date('2026-01-01T10:00Z'), endDate: new Date('2026-01-01T11:00Z')}));
        const store = {getCount: () => rows.length, getAt: index => rows[index]};
        const range = id => EventStore.getRangeRecords(store, '2026-01-01T09:00Z', '2026-01-01T12:00Z', id).map(row => row.id);
        expect(range(7)).toEqual(['numeric', 'text']);
        expect(range('7')).toEqual(['numeric', 'text']);
        expect(range('')).toEqual(['empty']);
        expect(range(null)).toEqual(['numeric', 'text', 'empty', 'absent'])
    });
    test('sorts events by startDate ASC and queries overlapping multi-day and milestone records via getRangeRecords', () => {
        expect(core.Base.prototype.isPrototypeOf(EventModel.prototype)).toBe(true);
        expect(core.Base.prototype.isPrototypeOf(EventStore.prototype)).toBe(true);

        const store = Neo.create(EventStore, {
            data: [{
                id        : 'ev-late',
                title     : 'Afternoon Sync',
                resourceId: 'r-1',
                startDate : new Date(2026, 10, 9, 14, 0),
                endDate   : new Date(2026, 10, 9, 15, 0)
            }, {
                id        : 'ev-spanning',
                title     : 'Multi-Day Rollout',
                resourceId: 'r-1',
                startDate : new Date(2026, 10, 8, 22, 0),
                endDate   : new Date(2026, 10, 10, 2, 0)
            }, {
                id        : 'ev-milestone',
                title     : 'Cutover Gate',
                resourceId: 'r-2',
                startDate : new Date(2026, 10, 9, 12, 0),
                endDate   : new Date(2026, 10, 9, 12, 0)
            }, {
                id        : 'ev-outside',
                title     : 'Next Week',
                resourceId: 'r-1',
                startDate : new Date(2026, 10, 16, 9, 0),
                endDate   : new Date(2026, 10, 16, 10, 0)
            }]
        });

        // Sorted by startDate ASC automatically
        expect(store.getAt(0).id).toBe('ev-spanning');

        // Query [Nov 9 08:00, Nov 9 18:00) across all resources
        const windowRecords = store.getRangeRecords(
            new Date(2026, 10, 9, 8, 0),
            new Date(2026, 10, 9, 18, 0)
        );
        expect(windowRecords.map(r => r.id)).toEqual(['ev-spanning', 'ev-milestone', 'ev-late']);

        // Query filtered by resourceId 'r-1'
        const r1Records = store.getRangeRecords(
            new Date(2026, 10, 9, 8, 0),
            new Date(2026, 10, 9, 18, 0),
            'r-1'
        );
        expect(r1Records.map(r => r.id)).toEqual(['ev-spanning', 'ev-late']);

        store.destroy();
    });

    test('exports timelineFields that compose cleanly onto a Neo.data.TreeModel subclass', () => {
        const model      = Neo.create(EventTreeProbeModel);
        const fieldNames = model.fields.map(f => f.name);
        expect(fieldNames).toEqual(expect.arrayContaining([
            'id', 'parentId', 'title', 'startDate', 'endDate', 'resourceId', 'duration', 'percentDone'
        ]));
        model.destroy();
    });
});
