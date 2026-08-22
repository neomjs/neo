import {setup} from '../../../../../../setup.mjs';

const appName = 'FleetActivityBufferedStreamTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}                           from '@playwright/test';
import Neo                                      from '../../../../../../../../src/Neo.mjs';
import * as core                                from '../../../../../../../../src/core/_export.mjs';
import DomApiVnodeCreator                       from '../../../../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import Instance                                 from '../../../../../../../../src/manager/Instance.mjs';
import VdomHelper                               from '../../../../../../../../src/vdom/Helper.mjs';
import ActivityStream, {describeActivityCounts} from '../../../../../../../../apps/agentos/view/fleet/activity/Container.mjs';
import {getActivityObjectText}                  from '../../../../../../../../apps/agentos/view/fleet/activity/RowContainer.mjs';
import FleetActivityEvents                      from '../../../../../../../../apps/agentos/store/FleetActivityEvents.mjs';

test.describe('Fleet activity — Store-backed list.Buffered history (#17550)', () => {
    let sequence = 0,
        store,
        stream;

    const event = (id, minute=id, overrides={}) => ({
        eventId   : `a2a:MESSAGE:${id}`,
        type      : 'a2a-activity',
        source    : 'memory-core:mailbox',
        agentId   : `agent-${id}`,
        occurredAt: new Date(Date.UTC(2026, 7, 22, 12, minute)).toISOString(),
        payload   : {subject: `event ${id}`, to: '@neo-gpt', recipientClass: 'agent'},
        ...overrides
    });

    const makeEvents = count => Array.from({length: count}, (_, index) => event(index, index));

    const createStream = async ({count=500, counts=[], maxRecords=1000, viewportHeight=156}={}) => {
        store = Neo.create(FleetActivityEvents, {
            data: makeEvents(count),
            id  : `fleet-activity-events-test-${++sequence}`,
            maxRecords
        });
        stream = Neo.create(ActivityStream, {
            actorDirectory: {'agent-499': {displayName: 'Newest Agent'}},
            appName,
            counts,
            id            : `fleet-activity-stream-test-${sequence}`,
            store
        });

        await stream.initVnode();
        stream.mounted = true;

        const list = stream.getReference('list');

        list.onResize({rect: {height: viewportHeight}});
        list.createItems(true);

        return {list, store, stream}
    };

    test.afterEach(() => {
        stream?.destroy();
        store?.destroy();
        stream = null;
        store  = null
    });

    test('500 records mount only viewport + buffer rows; fold and row rebuild are gone', async () => {
        const {list} = await createStream();

        expect(store.count).toBe(500);
        expect(list.availableRows).toBe(3);
        expect(list.items.filter(Boolean)).toHaveLength(11);
        expect(list.vdom.cn.slice(1, -1)).toHaveLength(11);
        expect(stream.down({cls: 'fm-stream-fold'})).toBeNull();
        expect(stream.vdom.role).toBe('log');
        expect(list.vdom['aria-live']).toBe('off');
        expect(stream.getReference('announcer').vdom.role).toBe('status')
    });

    test('scroll recycling preserves each pooled row and its fixed five child identities', async () => {
        const {list} = await createStream({count: 100});

        const
            slot        = list.recordSlotMap.get(store.first().eventId),
            row         = list.items[slot],
            rowId       = row.id,
            childIds    = row.items.map(item => item.id),
            physicalIds = new Set(list.items.filter(Boolean).map(item => item.id));

        expect(row.items).toHaveLength(5);

        list.onScrollCapture({target: {id: list.id}, scrollLeft: 0, scrollTop: 208});

        expect(new Set(list.items.filter(Boolean).map(item => item.id))).toEqual(physicalIds);
        expect(row.id).toBe(rowId);
        expect(row.items.map(item => item.id)).toEqual(childIds)
    });

    test('one recycle batch converges record, child VDOM, VNode and fixed optional cell roots', async () => {
        const {list} = await createStream({count: 20});
        const row    = list.items[0];

        store.ingestSnapshot([event('newest', 200, {
            eventId: 'a2a:MESSAGE:newest',
            payload: {subject: 'newest object', to: null, recipientClass: 'unknown'},
            agentId: null
        })], {replace: true});

        await row.promiseUpdate();

        expect(row.record.eventId).toBe('a2a:MESSAGE:newest');
        expect(row.getReference('object').text).toBe('newest object');
        expect(row.getReference('object').vnode.textContent).toBe('newest object');
        expect(row.getReference('actor').hidden).toBe(false);
        expect(row.getReference('actor').cls).toContain('is-empty');
        expect(row.getReference('recipient').hidden).toBe(false);
        expect(row.getReference('recipient').cls).toContain('is-empty');
        expect(row.vnode.childNodes.map(node => node.id)).toEqual(row.items.map(item => item.id))
    });

    test('prepend while reading history preserves record + pixel offset and surfaces new ids', async () => {
        const {list} = await createStream({count: 100});

        list.onScrollCapture({target: {id: list.id}, scrollLeft: 0, scrollTop: 265});

        const
            anchorId     = list.anchorRecordId,
            anchorOffset = list.anchorOffset,
            anchorBefore = store.get(anchorId),
            result       = store.ingestSnapshot([
                event('new-1', 200, {eventId: 'a2a:MESSAGE:new-1'}),
                event('new-2', 201, {eventId: 'a2a:MESSAGE:new-2'})
            ]);

        expect(result.newEventIds).toEqual(['a2a:MESSAGE:new-1', 'a2a:MESSAGE:new-2']);
        expect(list.anchorRecordId).toBe(anchorId);
        expect(list.anchorOffset).toBe(anchorOffset);
        expect(store.get(anchorId)).toBe(anchorBefore);
        expect(store.getAt(Math.floor(list.scrollTop / list.itemHeight)).eventId).toBe(anchorId);
        expect(stream.pendingNewEventCount).toBe(2);
        expect(stream.getReference('new-events').text).toBe('2 new events ↑');
        expect(stream.getReference('announcer').text).toContain('2 new fleet activity events');

        stream.onNewEventsClick();
        expect(list.scrollTop).toBe(0);
        expect(stream.pendingNewEventCount).toBe(0);
        expect(stream.getReference('new-events').hidden).toBe(true)
    });

    test('Store upserts by producer id, sorts deterministically, and counts local eviction', () => {
        store = Neo.create(FleetActivityEvents, {id: `fleet-activity-events-test-${++sequence}`, maxRecords: 3});

        store.ingestSnapshot([event(1, 1), event(2, 2), event(3, 3)]);
        const retained = store.get('a2a:MESSAGE:2');

        const result = store.ingestSnapshot([
            event(2, 2, {payload: {subject: 'updated'}}),
            event(4, 4)
        ]);

        expect(store.count).toBe(3);
        expect(store.items.map(record => record.eventId)).toEqual([
            'a2a:MESSAGE:4',
            'a2a:MESSAGE:3',
            'a2a:MESSAGE:2'
        ]);
        expect(store.get('a2a:MESSAGE:2')).toBe(retained);
        expect(retained.payload.subject).toBe('updated');
        expect(result).toMatchObject({added: 1, dropped: 1, retained: 3});
        expect(store.droppedCount).toBe(1)
    });

    test('Store refuses missing or duplicate producer identity before mutating retained truth', () => {
        store = Neo.create(FleetActivityEvents, {id: `fleet-activity-events-test-${++sequence}`});
        store.ingestSnapshot([event(1)]);

        expect(() => store.ingestSnapshot([{type: 'a2a-activity'}])).toThrow('producer-owned eventId');
        expect(() => store.ingestSnapshot([event(2), event(2)])).toThrow('duplicate eventId');
        expect(store.items.map(record => record.eventId)).toEqual(['a2a:MESSAGE:1'])
    });

    test('row keeps actor once, named object, local time + exact ISO title in stable children', async () => {
        const pr = event('pr-17550', 10, {
            eventId: 'github-workflow:pull-requests:17550',
            type   : 'pr-activity',
            agentId: 'neo-gpt-emmy',
            payload: {number: 17550, title: 'Activity stream buffered list'}
        });

        store = Neo.create(FleetActivityEvents, {data: [pr], id: `fleet-activity-events-test-${++sequence}`});
        stream = Neo.create(ActivityStream, {
            actorDirectory: {'neo-gpt-emmy': {displayName: 'Emmy'}},
            appName,
            id            : `fleet-activity-stream-test-${sequence}`,
            store
        });
        await stream.initVnode();

        const row = stream.getReference('list').items[0];

        expect(row.items).toHaveLength(5);
        expect(row.getReference('actor').label).toBe('Emmy');
        expect(row.getReference('object').text).toBe('#17550 · Activity stream buffered list');
        expect(row.getReference('object').text).not.toContain('neo-gpt-emmy');
        expect(row.getReference('time').vdom.title).toBe(pr.occurredAt);
        expect(row.vdom['aria-label']).toContain('#17550 · Activity stream buffered list')
    });

    test('object grammar handles A2A, issue, stall and malformed subjects without duplication', () => {
        expect(getActivityObjectText({type: 'a2a-activity', payload: {subject: 'Review requested'}})).toBe('Review requested');
        expect(getActivityObjectText({type: 'issue-activity', payload: {number: 17550, title: 'Buffered history'}})).toBe('#17550 · Buffered history');
        expect(getActivityObjectText({type: 'work-stall', payload: {findingClass: 'ownership-gap', subject: {id: 'LANE:x'}}})).toBe('stalled · LANE:x');
        expect(getActivityObjectText({type: 'a2a-activity', payload: {subject: {unexpected: true}}})).toBe('a2a-activity')
    });

    test('count header labels producer truth and ignores incomplete rows', () => {
        const view = describeActivityCounts([{
            source    : 'memory-core:mailbox',
            scope     : 'last24h',
            value     : 36,
            complete  : true,
            capturedAt: '2026-08-22T21:00:00.000Z'
        }, {
            source    : 'memory-core:mailbox',
            scope     : 'total',
            value     : 412,
            complete  : true,
            capturedAt: '2026-08-22T21:00:00.000Z'
        }, {
            source    : 'github-workflow:pull-requests',
            scope     : 'total',
            value     : 99,
            complete  : false,
            capturedAt: '2026-08-22T21:00:00.000Z'
        }]);

        expect(view.text).toBe('mailbox · 36 / 24h · 412 total');
        expect(view.title).toContain('memory-core:mailbox total=412');
        expect(describeActivityCounts([{scope: 'total', value: 1, complete: true}])).toBeNull()
    });

    test('count chrome stays mounted while complete producer truth appears and disappears', async () => {
        await createStream({count: 1});

        const countCell = stream.getReference('counts');

        expect(countCell.hidden).toBe(false);
        expect(countCell.cls).toContain('is-empty');

        stream.counts = [{
            source    : 'memory-core:mailbox',
            scope     : 'total',
            value     : 412,
            complete  : true,
            capturedAt: '2026-08-22T21:00:00.000Z'
        }];
        await stream.timeout(20);

        expect(countCell.text).toBe('mailbox · 412 total');
        expect(countCell.cls).not.toContain('is-empty');
        expect(countCell.vnode.textContent).toBe('mailbox · 412 total');

        stream.counts = [];
        await stream.timeout(20);

        expect(countCell.text).toBe('');
        expect(countCell.cls).toContain('is-empty')
    });

    test('stale state keeps retained rows and names the degrade', async () => {
        const {list}  = await createStream({count: 20});
        const mounted = list.items.filter(Boolean).length;

        stream.adapterState = 'stale';

        expect(stream.getReference('header').cls).toContain('is-stale');
        expect(stream.getReference('state').text).toBe('stale — reconnecting');
        expect(list.items.filter(Boolean)).toHaveLength(mounted)
    })
});
