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
            itemRects  = [{x: 50, y: 0, width: 110}, {x: 160, y: 0, width: 110}],
            before     = itemRects.map(rect => ({...rect})),
            owner      = {vdom: {cn: []}, promiseUpdate: () => rendered.promise},
            zone       = {dragStartScrollLeft: 412, itemRects, owner, ownerRect: {x: 150}};

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
            expect(itemRects, 'the base still owns conversion of the viewport snapshots').toEqual(before);

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
            await SortZone.prototype.dragStart.call({dragStartScrollLeft: 0, owner}, {});
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
    })
});
