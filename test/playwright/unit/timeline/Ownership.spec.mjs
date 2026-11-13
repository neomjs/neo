import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import Events   from '../../../../src/timeline/store/Events.mjs';
import TimeAxis from '../../../../src/timeline/TimeAxis.mjs';
import Column   from '../../../../src/timeline/Column.mjs';
import Header   from '../../../../src/timeline/TimeAxisHeader.mjs';
import Grid     from '../../../../src/grid/Container.mjs';
import Store    from '../../../../src/data/Store.mjs';

setup({neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false, useDomApiRenderer: false},
    appConfig: {name: 'TimelineOwnershipTest', isMounted: () => true, vnodeInitialising: false}});

test('store replacement and destruction remove the actual listeners', () => {
    const first     = Neo.create(Events), second = Neo.create(Events);
    const column    = Neo.create(Column, {appName: 'TimelineOwnershipTest', eventStore: first});
    let   refreshes = 0;
    column.refreshMountedRows = () => { refreshes++ };
    column.eventStore = second;
    refreshes = 0;
    first.fire('load');
    expect(refreshes).toBe(0);
    second.fire('load');
    expect(refreshes).toBe(1);
    column.destroy();
    refreshes = 0;
    first.fire('load');
    second.fire('load');
    expect(refreshes).toBe(0);
    expect(first.isDestroyed).not.toBe(true);
    expect(second.isDestroyed).not.toBe(true);
    first.destroy(); second.destroy()
});

test('column owns config-created dependencies but borrows passed instances', () => {
    const borrowedAxis = Neo.create(TimeAxis), borrowedStore = Neo.create(Events);
    const column       = Neo.create(Column, {appName: 'TimelineOwnershipTest', timeAxis: {}, eventStore: {}});
    const ownedAxis    = column.timeAxis, ownedStore = column.eventStore;
    column.timeAxis = ownedAxis;
    column.eventStore = ownedStore;
    expect(ownedAxis.isDestroyed).not.toBe(true);
    expect(ownedStore.isDestroyed).not.toBe(true);
    column.timeAxis = borrowedAxis;
    column.eventStore = borrowedStore;
    expect(ownedAxis.isDestroyed).toBe(true);
    expect(ownedStore.isDestroyed).toBe(true);
    column.timeAxis = null;
    column.eventStore = null;
    expect(borrowedAxis.isDestroyed).not.toBe(true);
    expect(borrowedStore.isDestroyed).not.toBe(true);
    column.timeAxis = {};
    column.eventStore = {};
    const finalAxis = column.timeAxis, finalStore = column.eventStore;
    column.destroy();
    expect(finalAxis.isDestroyed).toBe(true);
    expect(finalStore.isDestroyed).toBe(true);
    borrowedAxis.destroy(); borrowedStore.destroy()
});

test('header retires its own axis and never a borrowed axis', () => {
    const borrowed = Neo.create(TimeAxis);
    const header   = Neo.create(Header, {appName: 'TimelineOwnershipTest', timeAxis: {}});
    const owned    = header.timeAxis;
    header.timeAxis = owned;
    expect(owned.isDestroyed).not.toBe(true);
    header.timeAxis = borrowed;
    expect(owned.isDestroyed).toBe(true);
    header.timeAxis = null;
    expect(borrowed.isDestroyed).not.toBe(true);
    header.timeAxis = {};
    const last = header.timeAxis;
    header.destroy();
    expect(last.isDestroyed).toBe(true);
    borrowed.destroy()
});

test('grid header borrows the column axis across replacement and grid destruction', () => {
    const rows = Neo.create(Store, {data: []});
    const grid = Neo.create(Grid, {appName: 'TimelineOwnershipTest', store: rows, columns: [{
        module: Column, ntype: 'timeline-header', dataField: 'timeline', timeAxis: {}, eventStore: {}
    }]});
    const column    = grid.columns.get('timeline'), header = grid.headerToolbar.getColumn('timeline');
    const ownedAxis = column.timeAxis, ownedStore = column.eventStore;
    expect(header.timeAxis).toBe(ownedAxis);
    const borrowed = Neo.create(TimeAxis);
    column.timeAxis = borrowed;
    expect(header.timeAxis).toBe(borrowed);
    expect(ownedAxis.isDestroyed).toBe(true);
    let headerChanges = 0, columnChanges = 0;
    header.onTimeAxisChange = () => { headerChanges++ };
    column.onTimeAxisChange = () => { columnChanges++ };
    borrowed.pxPerMinute = 3;
    expect(headerChanges).toBeGreaterThan(0);
    expect(columnChanges).toBeGreaterThan(0);
    grid.destroy();
    expect(ownedStore.isDestroyed).toBe(true);
    expect(borrowed.isDestroyed).not.toBe(true);
    headerChanges = columnChanges = 0;
    borrowed.pxPerMinute = 4;
    expect([headerChanges, columnChanges]).toEqual([0, 0]);
    borrowed.destroy(); rows.destroy()
});
