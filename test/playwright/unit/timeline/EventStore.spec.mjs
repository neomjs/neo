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

test.describe('Neo.timeline.EventModel & EventStore', () => {
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
