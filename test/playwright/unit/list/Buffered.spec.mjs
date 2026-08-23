/**
 * @file test/playwright/unit/list/Buffered.spec.mjs
 * @summary Contract tests for bounded, fixed-DOM-order semantic component rows over a full Store.
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
import Container          from '../../../../src/container/Base.mjs';
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

class NestedPooledRow extends Container {
    static config = {
        className: 'Test.Unit.List.Buffered.NestedPooledRow',
        record_  : null,
        items    : [{
            module   : Component,
            reference: 'label'
        }]
    }

    afterSetRecord(value, oldValue) {
        this.isConstructed && this.updateLabel()
    }

    onConstructed(...args) {
        super.onConstructed(...args);
        this.updateLabel()
    }

    updateLabel() {
        const label = this.getReference('label');

        if (label) {
            label.setSilent({text: this.record?.name || ''});
            this.updateDepth = 2;
            this.update()
        }
    }
}

NestedPooledRow = Neo.setupClass(NestedPooledRow);

test.describe('Neo.list.Buffered — fixed-height component row windowing (#17554, #17563)', () => {
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

    test('scrolling rebinds fixed physical slots while keeping component identity', async () => {
        await createList();

        const
            initialSlotIds = renderedRows(list).map(row => row.id),
            components     = [...list.items],
            slotForFive    = list.recordSlotMap.get('5'),
            componentFive  = list.items[slotForFive];

        // Five rows are visible and two buffered on either side. At 80px (logical row 4), the
        // leading buffer is consumed and the mounted range advances by two rows.
        list.onScrollCapture({target: {id: list.id}, scrollLeft: 0, scrollTop: 80});

        expect(list.mountedRange).toEqual([2, 11]);
        expect(renderedRows(list).map(row => row.data.recordId)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
        expect(renderedRows(list).map(row => row.id)).toEqual(initialSlotIds);
        expect(list.items).toEqual(components);
        expect(list.items).toHaveLength(9);
        expect(list.recordSlotMap.get('5')).toBe(3);
        expect(list.items[3].record.id).toBe(5);
        expect(componentFive.record.id).toBe(7);
        expect(list.vdom.cn[0].style.height).toBe('40px');
        expect(list.vdom.cn.at(-1).style.height).toBe(`${(5000 - 11) * 20}px`)
    });

    test('range movement keeps physical rows fixed without structural deltas', async () => {
        await createList();
        await list.timeout(20);

        // RED baseline at the fixed-order branch point: forward range movement emitted 7 moveNode deltas;
        // reverse emitted 2. Both directions already emitted zero insertNode and removeNode deltas.
        const
            componentSet = new Set(list.items),
            initialIds   = renderedRows(list).map(row => row.id),
            captureMove  = async scrollTop => {
                const
                    captured    = [],
                    updateBatch = VdomHelper.updateBatch;

                VdomHelper.updateBatch = function(data) {
                    const result = updateBatch.call(this, data);

                    result.deltas?.length > 0 && captured.push(...result.deltas);

                    return result
                };

                try {
                    list.onScrollCapture({target: {id: list.id}, scrollLeft: 0, scrollTop});
                    await list.timeout(30)
                } finally {
                    VdomHelper.updateBatch = updateBatch
                }

                return {
                    actions: Object.fromEntries(['insertNode', 'moveNode', 'removeNode'].map(action => [
                        action,
                        captured.filter(delta => delta.action === action).length
                    ])),
                    captured
                }
            };

        const forward = await captureMove(80);

        expect(list.mountedRange).toEqual([2, 11]);
        expect(forward.captured.length).toBeGreaterThan(0);
        expect(new Set(list.items)).toEqual(componentSet);

        const reverse = await captureMove(0);

        expect(list.mountedRange).toEqual([0, 9]);
        expect(reverse.captured.length).toBeGreaterThan(0);
        expect({forward: forward.actions, reverse: reverse.actions}).toEqual({
            forward: {insertNode: 0, moveNode: 0, removeNode: 0},
            reverse: {insertNode: 0, moveNode: 0, removeNode: 0}
        });
        expect(renderedRows(list).map(row => row.id)).toEqual(initialIds);
        expect(new Set(list.items)).toEqual(componentSet)
    });

    test('recycled nested item components repaint in the owning list update', async () => {
        await createList({
            bufferRowRange: 0,
            count         : 20,
            height        : 40,
            itemConfig    : {module: NestedPooledRow},
            itemHeight    : 20
        });
        await list.timeout(20);

        const
            row   = list.items[0],
            label = row.getReference('label');

        expect(row.record.id).toBe(0);
        expect(label.vnode.textContent).toBe('Record 0');

        list.onScrollCapture({target: {id: list.id}, scrollLeft: 0, scrollTop: 40});
        await list.timeout(30);

        expect(list.items[0]).toBe(row);
        expect(row.record.id).toBe(2);
        expect(label.text).toBe('Record 2');
        expect(label.vdom.text).toBe('Record 2');
        expect(label.vnode.textContent).toBe('Record 2')
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
            ['register',   {componentId: list.id, id: list.id, windowId: list.windowId}],
            ['unregister', {componentId: list.id, id: list.id, windowId: list.windowId}]
        ])
    });

    test('prepend and filter preserve the first visible logical record plus pixel offset', async () => {
        const {store} = await createList({count: 500});

        const
            calls    = [],
            scrollTo = Neo.main.DomAccess.scrollTo;

        Neo.main.DomAccess.scrollTo = data => calls.push(data);

        try {
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

            await expect.poll(() => calls.at(-1)).toEqual({
                direction: 'top',
                id       : list.id,
                value    : 245,
                windowId : list.windowId
            });

            expect(list.scrollTop).toBe(245);
            expect(store.getAt(Math.floor(list.scrollTop / 20)).id).toBe(10);
            expect(list.anchorRecordId).toBe(10);
            expect(list.anchorOffset).toBe(5);
            expect(list.items[list.recordSlotMap.get('10')]).toBe(anchorComponent);

            store.filters = [{property: 'id', operator: '>=', value: 0}];

            await expect.poll(() => calls.at(-1)).toEqual({
                direction: 'top',
                id       : list.id,
                value    : 205,
                windowId : list.windowId
            });

            expect(list.scrollTop).toBe(205);
            expect(store.getAt(Math.floor(list.scrollTop / 20)).id).toBe(10);
            expect(list.anchorRecordId).toBe(10)
        } finally {
            Neo.main.DomAccess.scrollTo = scrollTo
        }
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

    test('focus follows a mounted record and retargets when that record leaves the pooled range', async () => {
        const {store} = await createList({count: 500});

        await list.timeout(20);

        const
            calls      = [],
            navigateTo = Neo.main.addon.Navigator.navigateTo,
            recordFive = store.get(5);

        Neo.main.addon.Navigator.navigateTo = data => calls.push(data);

        try {
            list.focusIndex = recordFive;

            await expect.poll(() => calls.at(-1)?.target).toBe(list.getSlotId(5));
            calls.length = 0;

            list.onScrollCapture({target: {id: list.id}, scrollLeft: 0, scrollTop: 80});

            await expect.poll(() => calls.at(-1)?.target).toBe(list.getSlotId(3));

            expect(list.mountedRange).toEqual([2, 11]);
            expect(list.focusIndex).toBe(recordFive);
            expect(calls.at(-1).fromTarget).toBe(list.getSlotId(5));
            expect(list.getItemRecordId(calls.at(-1).target)).toBe(5);

            list.focusIndex = store.get(4);
            await expect.poll(() => calls.at(-1)?.target).toBe(list.getSlotId(2));
            calls.length = 0;

            list.onScrollCapture({target: {id: list.id}, scrollLeft: 0, scrollTop: 200});

            await expect.poll(() => ({
                focusIndex: list.focusIndex,
                target    : calls.at(-1)?.target
            })).toEqual({
                focusIndex: 8,
                target    : list.getSlotId(0)
            });

            expect(list.mountedRange).toEqual([8, 17]);
            expect(calls.at(-1).fromTarget).toBe(list.getSlotId(2));
            expect(list.getItemRecordId(calls.at(-1).target)).toBe(8)
        } finally {
            Neo.main.addon.Navigator.navigateTo = navigateTo
        }
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
