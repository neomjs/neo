import {setup} from '../../../../../setup.mjs';

const appName = 'GridHeaderSortZoneTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import SortZone       from '../../../../../../../src/draggable/grid/header/toolbar/SortZone.mjs';

/**
 * @summary Regression coverage for Neo.draggable.grid.header.toolbar.SortZone multi-body resolution.
 *
 * Once the grid split into separate locked-start / center / locked-end bodies, the SortZone could
 * no longer assume a single `grid.body`: locked-column cells live in the start / end body. The
 * `gridBody` getter resolves the body paired with the dragged toolbar via its `layoutLock` region,
 * read off the durable `gridContainer` back-reference.
 */
test.describe('Neo.draggable.grid.header.toolbar.SortZone', () => {
    test('the extent sentinel reaches the DOM before inherited drag start can lift items', async () => {
        const
            parent     = Object.getPrototypeOf(SortZone.prototype),
            descriptor = Object.getOwnPropertyDescriptor(parent, 'dragStart'),
            rendered   = Promise.withResolvers(),
            // Owner-content space: the base converts the rects before it publishes them
            itemRects  = [{x: 312, y: 0, width: 110}, {x: 422, y: 0, width: 110}],
            before     = itemRects.map(rect => ({...rect})),
            owner      = {vdom: {cn: []}, promiseUpdate: () => rendered.promise},
            zone       = {clampProxyToGroup: async () => {}, dragStartScrollLeft: 412, itemRects, owner, ownerRect: {x: 150}};

        let inheritedStarted = false, starting;

        Object.defineProperty(parent, 'dragStart', {
            configurable: true,
            value       : async () => {inheritedStarted = true}
        });

        try {
            starting = SortZone.prototype.dragStart.call(zone, {});
            await Promise.resolve();

            expect(inheritedStarted, 'the proxy and item lift wait for the overflow-preserving node').toBe(false);
            expect(owner.vdom.cn).toEqual([{
                cls  : ['neo-sortzone-extent-sentinel'],
                style: {height: '1px', left: '531px', position: 'absolute', top: 0, width: '1px'}
            }]);
            expect(itemRects, 'the sentinel reads the converted rects and leaves them alone').toEqual(before);

            rendered.resolve();
            await starting;
            expect(inheritedStarted).toBe(true)
        } finally {
            rendered.resolve();
            try {
                await starting
            } finally {
                descriptor ? Object.defineProperty(parent, 'dragStart', descriptor) : delete parent.dragStart
            }
        }
    });

    test('an unscrolled drag start delegates without a sentinel render', async () => {
        const parent     = Object.getPrototypeOf(SortZone.prototype),
              descriptor = Object.getOwnPropertyDescriptor(parent, 'dragStart'),
              owner      = {vdom: {cn: []}, promiseUpdate: () => {throw new Error('unexpected sentinel render')}};
        let starts = 0;

        Object.defineProperty(parent, 'dragStart', {configurable: true, value: async () => {starts++}});

        try {
            await SortZone.prototype.dragStart.call({clampProxyToGroup: async () => {}, dragStartScrollLeft: 0, owner}, {});
            expect(starts).toBe(1);
            expect(owner.vdom.cn).toEqual([])
        } finally {
            descriptor ? Object.defineProperty(parent, 'dragStart', descriptor) : delete parent.dragStart
        }
    });

    test('gridBody resolves the region body via owner.layoutLock off owner.gridContainer', () => {
        const getGridBody   = Object.getOwnPropertyDescriptor(SortZone.prototype, 'gridBody').get,
              gridContainer = {bodyStart: 'startBody', body: 'centerBody', bodyEnd: 'endBody'},
              resolve       = layoutLock => getGridBody.call({owner: {gridContainer, layoutLock}});

        expect(resolve('start')).toBe('startBody');     // locked-start toolbar → bodyStart
        expect(resolve('end')).toBe('endBody');         // locked-end toolbar   → bodyEnd
        expect(resolve(null)).toBe('centerBody');       // center toolbar (no layoutLock) → body
        expect(resolve(undefined)).toBe('centerBody')   // center toolbar (unset) → body
    })

    test('getDropRegion maps the release x-coordinate to the target lock region (#9491 cross-toolbar)', () => {
        const getDropRegion = SortZone.prototype.getDropRegion,
              resolve        = (dropX, regionRects) => getDropRegion.call({}, dropX, regionRects),
              // locked-start body [0,100], center gap (100,300), locked-end body [300,400]
              regions        = {start: {left: 0, right: 100}, end: {left: 300, right: 400}};

        expect(resolve(50,  regions)).toBe('start');     // inside locked-start body → start region
        expect(resolve(200, regions)).toBe(null);        // center gap → unlocked
        expect(resolve(350, regions)).toBe('end');       // inside locked-end body → end region
        expect(resolve(0,   regions)).toBe('start');     // left boundary inclusive
        expect(resolve(400, regions)).toBe('end');       // right boundary inclusive

        // center-only grid (no locked start/end bodies present) → always center/unlocked
        const centerOnly = {start: null, end: null};
        expect(resolve(50,  centerOnly)).toBe(null);
        expect(resolve(350, centerOnly)).toBe(null)
    })

    test('a grouped header\'s pointer is outside its group beyond the group\'s headers, measured in content space', () => {
        // Q1 spans [0, 200) in content space, an ungrouped header follows at [200, 300)
        const zone = {
                  currentIndex    : 0,
                  getHeaderGroupId: index => ['q1', 'q1', null][index] ?? null,
                  itemRects       : [{x: 0, width: 100}, {x: 100, width: 100}, {x: 200, width: 100}],
                  ownerRect       : {x: 50},
                  scrollLeft      : 0
              },
              outside = clientX => SortZone.prototype.isOutsideGroup.call(zone, clientX);

        expect(outside(150)).toBe(false); // over the second Q1 header
        expect(outside(300)).toBe(true);  // over the ungrouped header
        expect(outside(20)).toBe(true);   // left of the toolbar, over another region

        // Scrolled by 100, the same pointer is over Q1 content the over-drag scrolls back into view
        zone.scrollLeft = 100;
        expect(outside(20)).toBe(false);

        // An ungrouped header has no group to leave, and a move without a pointer x has no verdict
        zone.currentIndex = 2;
        expect(outside(-500)).toBe(false);
        zone.currentIndex = 0;
        expect(outside(undefined)).toBe(false)
    });

    test('a grouped header\'s proxy is clamped to the shown part of its group, at the current scroll (#20626)', async () => {
        const
            {DragDrop} = Neo.main.addon || {},
            sent       = [],
            // Q3 spans [0, 300) in content space, Q4 follows at [300, 600); the toolbar shows viewport x 50 to 450
            zone       = {
                appName              : 'clamp',
                boundaryContainerRect: {bottom: 90, height: 40, left: 50, right: 450, top: 50},
                currentIndex         : 1,
                getHeaderGroupId     : index => ['q3', 'q3', 'q3', 'q4', 'q4', 'q4'][index],
                itemRects            : [0, 100, 200, 300, 400, 500].map(x => ({x, width: 100})),
                ownerRect            : {x: 50},
                scrollLeft           : 0,
                windowId             : 7
            },
            clamp = () => SortZone.prototype.clampProxyToGroup.call(zone);

        Neo.ns('Neo.main.addon', true).DragDrop = {setConfigs: async configs => {sent.push(configs)}};

        try {
            await clamp();
            expect(sent.pop()).toEqual({
                appName              : 'clamp',
                boundaryContainerRect: {bottom: 90, height: 40, left: 50, right: 350, top: 50, width: 300, x: 50, y: 50},
                windowId             : 7
            });

            // Scrolled by 200, Q3's last header is all the toolbar still shows of the group
            zone.scrollLeft = 200;
            await clamp();
            expect(sent.pop().boundaryContainerRect).toMatchObject({left: 50, right: 150, width: 100});

            // Q4 runs past the toolbar's right edge: the toolbar's edge bounds the proxy there
            zone.currentIndex = 4;
            zone.scrollLeft   = 0;
            await clamp();
            expect(sent.pop().boundaryContainerRect).toMatchObject({left: 350, right: 450});

            // An ungrouped header keeps the toolbar's boundary
            zone.getHeaderGroupId = () => null;
            await clamp();
            expect(sent).toEqual([])
        } finally {
            Neo.main.addon.DragDrop = DragDrop
        }
    });

    test('an ungrouped header steps past a whole group, and has to travel the group\'s extent first', () => {
        // Q4 is three 100px headers with 1px gaps, the ungrouped Id header after it
        const zone = {
            getHeaderGroupId: index => ['q4', 'q4', 'q4', null][index] ?? null,
            getSwitchTarget : SortZone.prototype.getSwitchTarget,
            itemRects       : [{x: 0, width: 100}, {x: 101, width: 100}, {x: 202, width: 100}, {x: 303, width: 60}],
            sortDirection   : 'horizontal'
        };

        expect(zone.getSwitchTarget(3, 2)).toBe(0);                            // Id lands before Q4's first header
        expect(SortZone.prototype.getSwitchExtent.call(zone, 3, 2)).toBe(302); // the whole run, gaps included
        expect(zone.getSwitchTarget(1, 2)).toBe(2);                            // a grouped header switches with its neighbour
        expect(SortZone.prototype.getSwitchExtent.call(zone, 1, 2)).toBe(100)  // over the neighbour's own width
    });

    test('columnIndexOffset offsets the toolbar-local index into the global columns by preceding-region counts (#9491)', () => {
        const columnIndexOffset = SortZone.prototype.columnIndexOffset,
              gridContainer     = {lockedStartColumns: {length: 2}, centerColumns: {length: 5}, lockedEndColumns: {length: 1}},
              resolve           = layoutLock => columnIndexOffset.call({owner: {gridContainer, layoutLock}});

        expect(resolve('start')).toBe(0);   // start region → no preceding columns
        expect(resolve(null)).toBe(2);      // center → after the 2 locked-start columns
        expect(resolve('end')).toBe(7);     // end → after start(2) + center(5)

        // no-locked common case: a single center toolbar → offset 0 (unchanged from pre-fix behavior)
        const noLocked = {lockedStartColumns: {length: 0}, centerColumns: {length: 4}, lockedEndColumns: {length: 0}};
        expect(columnIndexOffset.call({owner: {gridContainer: noLocked, layoutLock: null}})).toBe(0)
    })

    test('a cancelled end skips grid lock-region inference after base cleanup', async () => {
        const
            dragComponent = {wrapperStyle: {}},
            owner         = {
                addDomListeners: () => {},
                cls            : [],
                dragResortable : true,
                items          : [dragComponent],
                on             : () => {},
                style          : {},
                update         : () => {},
                vdom           : {cn: [{cls: ['neo-sortzone-extent-sentinel']}]}
                // Deliberately no gridContainer: reaching lock inference would throw.
            },
            zone = Neo.create(SortZone, {owner});

        Object.assign(zone, {
            currentIndex   : 0,
            dragColumnField: 'alpha',
            dragComponent,
            itemStyles     : [{}],
            ownerStyle     : {},
            sortableItems  : [dragComponent],
            startIndex     : 0,
            timeout        : () => Promise.resolve()
        });

        await zone.processDragEnd({cancelled: true});

        expect(zone.dragColumnField).toBeNull();
        expect(zone.currentIndex).toBe(-1);
        expect(owner.vdom.cn, 'cancellation removes the extent reservation').toEqual([]);

        zone.destroy()
    });

    test('a cancelled drag re-syncs the body its switches moved, and re-locks no column', async () => {
        const
            calls         = [],
            column        = {dataField: 'alpha', locked: null},
            dragComponent = {vdom: {}, wrapperStyle: {}},
            owner         = {
                addDomListeners : () => {},
                ariaColumnOffset: 0,
                cls             : [],
                dragResortable  : true,
                gridContainer   : {
                    body   : {createViewData: () => calls.push('createViewData')},
                    columns: {count: 1, getAt: () => column}
                },
                items           : [dragComponent],
                on              : () => {},
                passSizeToBody  : async () => calls.push('passSizeToBody'),
                scrollLeft      : 0,
                style           : {},
                update          : () => calls.push('update'),
                vdom            : {cn: []}
            },
            zone = Neo.create(SortZone, {owner});

        Object.assign(zone, {
            currentIndex   : 0,
            dragColumnField: 'alpha',
            dragComponent,
            dragElement    : {},
            itemStyles     : [{}],
            lastDragClientX: 50,
            ownerStyle     : {},
            // A drop released here would lock the column to the start region
            regionRects    : {start: {left: 0, right: 100}, end: null},
            sortableItems  : [dragComponent],
            startIndex     : 0,
            timeout        : () => Promise.resolve()
        });

        await zone.processDragEnd({cancelled: true});

        expect(column.locked).toBeNull();
        expect(calls).toEqual(['update', 'passSizeToBody', 'createViewData']);

        zone.destroy()
    })
});
