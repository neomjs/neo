/**
 * @file test/playwright/unit/list/Buffered.spec.mjs
 * @summary Contract tests for `Neo.list.Buffered`: bounded semantic component rows over a full Store.
 */

import {setup} from '../../setup.mjs';

const appName = 'ListBufferedTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : appName,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Component          from '../../../../src/component/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import Buffered           from '../../../../src/list/Buffered.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

class PooledRow extends Component {
    static config = {
        className: 'Test.Unit.List.Buffered.PooledRow',
        record_  : null
    }
}

PooledRow = Neo.setupClass(PooledRow);

test.describe('Neo.list.Buffered — fixed-height component row windowing (#17554)', () => {
    let list,
        sequence = 0;

    const data = count => Array.from({length: count}, (_, id) => ({id, name: `Record ${id}`}));

    const createList = async ({
        bufferRowRange=2,
        count=5000,
        height=100,
        itemConfig=({record}) => ({module: PooledRow, text: record.name}),
        itemHeight=20,
        selectionModel=null
    } = {}) => {
        const store = Neo.create(Store, {
            keyProperty: 'id',
            data       : data(count),
            model      : {
                fields: [
                    {name: 'id',   type: 'Integer'},
                    {name: 'name', type: 'String'}
                ]
            }
        });

        list = Neo.create(Buffered, {
            appName,
            bufferRowRange,
            height,
            id           : `list-buffered-test-${++sequence}`,
            itemConfig,
            itemHeight,
            selectionModel,
            store,
            useInternalId: false
        });

        await list.initVnode();
        list.mounted = true;
        list.onResize({rect: {height}});
        list.createItems(true);

        return {list, store}
    };

    const renderedRows = target => target.vdom.cn.slice(1, -1);

    test.afterEach(() => {
        list?.destroy();
        list = null
    });

    test('5,000 records mount only viewport + buffer rows with honest semantic positions', async () => {
        await createList();

        const rows = renderedRows(list);

        expect(list.availableRows).toBe(5);
        expect(list.mountedRange).toEqual([0, 9]);
        expect(rows).toHaveLength(9);
        expect(list.items.filter(Boolean)).toHaveLength(9);
        expect(list.vdom.tag).toBe('ul');

        expect(list.vdom.cn[0]).toMatchObject({
            id           : `${list.id}__top-spacer`,
            role         : 'presentation',
            'aria-hidden': true,
            style        : {height: '0px'}
        });
        expect(list.vdom.cn.at(-1).style.height).toBe(`${(5000 - 9) * 20}px`);

        expect(rows.map(row => row.data.recordId)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
        expect(rows.map(row => row['aria-posinset'])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(rows.every(row => row['aria-setsize'] === 5000)).toBe(true)
    });

    test('empty and plain-text lists keep the inherited semantic contract', async () => {
        await createList({count: 0});

        expect(list.mountedRange).toEqual([0, 0]);
        expect(renderedRows(list)).toEqual([]);
        expect(list.vdom.cn).toHaveLength(2);
        expect(list.vdom.cn.every(node => node.style.height === '0px')).toBe(true);

        list.destroy();
        list = null;

        await createList({count: 3, itemConfig: null});

        expect(renderedRows(list).map(row => row.html)).toEqual(['Record 0', 'Record 1', 'Record 2']);
        expect(list.items).toBeNull()
    });

    test('scrolling rotates bounded slots while surviving records keep component identity', async () => {
        await createList();

        const
            initialSlotIds = new Set(renderedRows(list).map(row => row.id)),
            slotForFive    = list.recordSlotMap.get('5'),
            componentFive  = list.items[slotForFive];

        // Five rows are visible and two buffered on either side. At 80px (logical row 4), the
        // leading buffer is consumed and the mounted range advances by two rows.
        list.onScrollCapture({target: {id: list.id}, scrollLeft: 0, scrollTop: 80});

        expect(list.mountedRange).toEqual([2, 11]);
        expect(renderedRows(list).map(row => row.data.recordId)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
        expect(new Set(renderedRows(list).map(row => row.id))).toEqual(initialSlotIds);
        expect(list.items).toHaveLength(9);
        expect(list.items[list.recordSlotMap.get('5')]).toBe(componentFive);
        expect(componentFive.record.id).toBe(5);
        expect(list.vdom.cn[0].style.height).toBe('40px');
        expect(list.vdom.cn.at(-1).style.height).toBe(`${(5000 - 11) * 20}px`)
    });

    test('range movement produces bounded updates without row insertion or removal', async () => {
        await createList();
        await list.timeout(20);

        const
            captured    = [],
            updateBatch = VdomHelper.updateBatch;

        VdomHelper.updateBatch = function(data) {
            const result = updateBatch.call(this, data);

            result.deltas?.length > 0 && captured.push(...result.deltas);

            return result
        };

        try {
            list.onScrollCapture({target: {id: list.id}, scrollLeft: 0, scrollTop: 80});
            await list.timeout(30)
        } finally {
            VdomHelper.updateBatch = updateBatch
        }

        expect(captured.length).toBeGreaterThan(0);
        expect(captured.filter(delta => delta.action === 'insertNode')).toEqual([]);
        expect(captured.filter(delta => delta.action === 'removeNode')).toEqual([]);
        expect(renderedRows(list)).toHaveLength(9)
    });

    test('resize grows and shrinks the pool, destroying only excess component slots', async () => {
        await createList();

        list.onResize({rect: {height: 200}});

        expect(list.availableRows).toBe(10);
        expect(list.items.filter(Boolean)).toHaveLength(14);

        const excess = list.items.slice(7).filter(Boolean);

        list.onResize({rect: {height: 60}});

        expect(list.availableRows).toBe(3);
        expect(list.items.filter(Boolean)).toHaveLength(7);
        expect(excess.every(component => component.isDestroyed)).toBe(true);

        const
            calls    = [],
            getAddon = Neo.currentWorker.getAddon;

        Neo.currentWorker.getAddon = async () => ({
            register  : data => calls.push(['register', data]),
            unregister: data => calls.push(['unregister', data])
        });

        try {
            await list.addResizeObserver(true);
            await list.addResizeObserver(false)
        } finally {
            Neo.currentWorker.getAddon = getAddon
        }

        expect(calls).toEqual([
            ['register',   {id: list.id, windowId: list.windowId}],
            ['unregister', {id: list.id, windowId: list.windowId}]
        ])
    });

    test('prepend and filter preserve the first visible logical record plus pixel offset', async () => {
        const {store} = await createList({count: 500});

        list.onScrollCapture({target: {id: list.id}, scrollLeft: 0, scrollTop: 205});

        const
            anchorSlot      = list.recordSlotMap.get('10'),
            anchorComponent = list.items[anchorSlot];

        expect(list.anchorRecordId).toBe(10);
        expect(list.anchorOffset).toBe(5);

        store.insert(0, [
            {id: -2, name: 'Prepended -2'},
            {id: -1, name: 'Prepended -1'}
        ]);

        expect(list.scrollTop).toBe(245);
        expect(store.getAt(Math.floor(list.scrollTop / 20)).id).toBe(10);
        expect(list.anchorRecordId).toBe(10);
        expect(list.anchorOffset).toBe(5);
        expect(list.items[list.recordSlotMap.get('10')]).toBe(anchorComponent);

        store.filters = [{property: 'id', operator: '>=', value: 0}];

        expect(list.scrollTop).toBe(205);
        expect(store.getAt(Math.floor(list.scrollTop / 20)).id).toBe(10);
        expect(list.anchorRecordId).toBe(10)
    });

    test('record changes, selection, and focus resolve logical records across recycling', async () => {
        const {store} = await createList({count: 500, selectionModel: {}});

        store.get(4).name = 'Record four updated';

        const componentFour = list.items[list.recordSlotMap.get('4')];
        expect(componentFour.text).toBe('Record four updated');

        list.selectItem(100);

        const
            selectionId = list.getItemId(100),
            selected    = list.getVdomChild(selectionId);

        expect(list.selectionModel.items).toEqual([selectionId]);
        expect(list.getItemRecordId(selected)).toBe(100);
        expect(selected.cls).toContain('neo-selected');
        expect(selected['aria-selected']).toBe(true);

        const
            navigateTo = Neo.main.addon.Navigator.navigateTo,
            calls      = [];

        Neo.main.addon.Navigator.navigateTo = data => calls.push(data);

        try {
            await list.updateItemFocus(store.get(200))
        } finally {
            Neo.main.addon.Navigator.navigateTo = navigateTo
        }

        expect(calls).toHaveLength(1);
        expect(calls[0].target).toBe(list.getSlotId(list.recordSlotMap.get('200')));
        expect(list.getItemRecordId(calls[0].target)).toBe(200)
    });

    test('Store sort reorders the bounded range once through the coarse load contract', async () => {
        const {store} = await createList({count: 20});

        store.sort({property: 'id', direction: 'DESC'});

        expect(renderedRows(list).map(row => row.data.recordId)).toEqual([19, 18, 17, 16, 15, 14, 13, 12, 11]);
        expect(list.items.filter(Boolean)).toHaveLength(9)
    });

    test('invalid bounds fail closed: construction rejects height, runtime assignments keep prior values', async () => {
        const id = `list-buffered-invalid-${++sequence}`;

        expect(() => Neo.create(Buffered, {appName, id, itemHeight: 0})).toThrow(
            '[Neo.list.Buffered] itemHeight must be a positive finite number'
        );

        const partial = Neo.getComponent(id);

        partial && Neo.manager.Instance.unregister(partial);

        await createList({bufferRowRange: 2, itemHeight: 20});

        list.bufferRowRange = -1;
        list.itemHeight     = 0;

        expect(list.bufferRowRange).toBe(2);
        expect(list.itemHeight).toBe(20)
    })
});
