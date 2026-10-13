/**
 * @file test/playwright/unit/grid/WrapTextMeasure.spec.mjs
 * @summary Content-sized rows measure the wrapped text of their `wrapText` columns in place.
 *
 * In content-sized mode a `wrapText` cell renders its text in a block container. After an update lands, the grid
 * view reads the layout boxes of the new containers in one batch and feeds each row's tallest one, plus the
 * cell's padding and borders, to the row geometry. The main-thread reads are replaced by recorders here: a text
 * container is as tall as its record's line count for that column × 20px, a hidden one has an empty box, and the
 * cell chrome is 5px.
 *
 * A measurement stays valid while its text, its width and its rules stay: a hidden cell is measured once it shows,
 * and a removed wrapText column or a new `rowHeight` derives the measured rows again from their stored heights.
 * A cell is read only once the DOM shows it, so a row whose vdom ran ahead of its last landed update waits for it.
 *
 * @see Neo.grid.View#measureRowHeights
 */

import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridWrapTextMeasureTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import Row                from '../../../../src/grid/Row.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import VNodeUtil          from '../../../../src/util/VNode.mjs';

const
    CHROME    = 5,
    LINE      = 20,
    rowHeight = 40,
    viewport  = 360,
    // The column widths of createGrid(), in px
    WIDTHS    = {name: 150, note: 200};

/**
 * @param {Number} count
 * @returns {Neo.data.Store}
 */
function createStore(count) {
    return Neo.create(Store, {
        data: Array.from({length: count}, (item, index) => ({
            id       : index,
            name     : `Name ${index}`,
            nameLines: 1 + index % 3,
            note     : `Note ${index}`,
            noteLines: 1 + (index * 2) % 5
        })),
        keyProperty: 'id',
        model      : {
            fields: [
                {name: 'id',        type: 'Integer'},
                {name: 'name',      type: 'String'},
                {name: 'nameLines', type: 'Integer'},
                {name: 'note',      type: 'String'},
                {name: 'noteLines', type: 'Integer'}
            ]
        }
    })
}

/**
 * A mounted grid with the layout a browser would deliver applied by hand. `name` is locked to the start and
 * `note` sits in the center, so the two wrapText columns live in different bodies.
 * @param {Object} config
 * @returns {Promise<Neo.grid.Container>}
 */
async function createGrid(config) {
    let grid = Neo.create(GridContainer, {
        appName       : 'GridWrapTextMeasureTest',
        bufferRowRange: 2,
        columns       : [
            {dataField: 'name', locked: 'start', text: 'Name', width: 150, wrapText: true},
            {dataField: 'id',                    text: 'ID',   width: 80},
            {dataField: 'note',                  text: 'Note', width: 200, wrapText: true}
        ],
        height: 400,
        rowHeight,
        width : 600,
        ...config
    });

    // These arms isolate the mounted measurement contract; hidden batches have their own fixture.
    grid.view.measureAheadRows = async () => {};
    await grid.initVnode();
    grid.mounted = true;

    let {headerWrapper} = grid;

    for (let toolbar of [headerWrapper?.headerStart, grid.headerToolbar, headerWrapper?.headerEnd]) {
        toolbar && await toolbar.passSizeToBody()
    }

    grid.view.bodies.forEach(body => {
        body.set({availableHeight: viewport, containerWidth: 600})
    });

    await grid.timeout(50);

    return grid
}

/**
 * The cell and record of each rendered text container, by container id
 * @param {Neo.grid.Container} grid
 * @returns {Map<String, {cell: Object, field: String, record: Object}>}
 */
function renderedTexts(grid) {
    let texts = new Map();

    grid.view.bodies.forEach(body => body.items.forEach(row => row.vdom.cn?.forEach(cell => {
        let text = cell.cn?.[0];

        if (row.record && text?.cls?.includes('neo-grid-cell-text')) {
            texts.set(text.id, {cell, field: cell.data.field, record: row.record})
        }
    })));

    return texts
}

/**
 * What the main thread would answer, for what the containers show when the read arrives. A container in a
 * `display: none` cell has an empty box.
 * @param {Neo.grid.Container} grid
 * @param {String[]} ids
 * @returns {Object[]}
 */
function readTextRects(grid, ids) {
    let texts = renderedTexts(grid);

    return ids.map(id => {
        let text = texts.get(id);

        if (!text) {
            return {}
        }

        return text.cell.style.display === 'none' ?
            {height: 0, width: 0} :
            {height: text.record[`${text.field}Lines`] * LINE, width: parseFloat(text.cell.style.width)}
    })
}

/**
 * What the main thread would answer while the DOM lags the vdom: for the texts and widths the rows' last landed
 * updates rendered, their vnodes. A text names its record, e.g. `Note 12`. As HTML it takes the record's line count
 * and wraps to fewer lines in a cell wider than its column's {@link WIDTHS}; as literal text it shows on one line.
 * @param {Neo.grid.Container} grid
 * @param {String[]} ids
 * @returns {Object[]}
 */
function shownTextRects(grid, ids) {
    let rows = grid.view.bodies.flatMap(body => body.items);

    return ids.map(id => {
        for (let row of rows) {
            let text = VNodeUtil.getById(row.vnode, id);

            if (text) {
                let [name, index] = (text.innerHTML ?? text.textContent).split(' '),
                    field         = name.toLowerCase(),
                    width         = parseFloat(VNodeUtil.getById(row.vnode, id.slice(0, -'__text'.length)).style.width),
                    lines         = Object.hasOwn(text, 'innerHTML') ? grid.store.get(Number(index))[`${field}Lines`] : 1;

                return {height: lines * LINE * WIDTHS[field] / width, width}
            }
        }

        return {}
    })
}

/**
 * Renders a row's `note` cell again with the same bytes in the other content mode, as a renderer that returns
 * `{text}` instead of `{html}` would: a new cell node whose update has not landed
 * @param {Neo.grid.Row} row
 */
function switchNoteMode(row) {
    let index                      = row.vdom.cn.findIndex(node => node.data?.field === 'note'),
        cell                       = row.vdom.cn[index],
        {html, text, ...container} = cell.cn[0];

    row.vdom.cn[index] = {...cell, cn: [html !== undefined ? {...container, text: html} : {...container, html: text}]}
}

/**
 * The row height the measurement owes a record
 * @param {Object} record
 * @returns {Number}
 */
const expectedHeight = record => Math.max(rowHeight, Math.max(record.nameLines, record.noteLines) * LINE + CHROME);

test.describe('Grid wrapText measurement', () => {
    test.skip(!!process.env.NEO_TEST_SKIP_CI, 'bucket B: Grid tests require Playwright browsers in CI');

    let grid, original, reads, respond, store;

    test.beforeEach(async () => {
        Neo.main           ??= {};
        Neo.main.DomAccess ??= {};

        original = {
            getComputedStyle: Neo.main.DomAccess.getComputedStyle,
            getLayoutRect   : Neo.main.DomAccess.getLayoutRect
        };

        reads   = [];
        // Answers at once; a test that needs the read in flight swaps it
        respond = ids => Promise.resolve(grid ? readTextRects(grid, ids) : ids.map(() => ({})));

        // Only the text containers' read is recorded: the header toolbars measure their buttons, too
        Neo.main.DomAccess.getLayoutRect = opts => {
            let ids = [].concat(opts.id);

            if (!ids.every(id => String(id).endsWith('__text'))) {
                return original.getLayoutRect.call(Neo.main.DomAccess, opts)
            }

            reads.push(ids);
            return respond(ids)
        };

        Neo.main.DomAccess.getComputedStyle = () => Promise.resolve({
            'border-bottom-width': '1px',
            'border-top-width'   : '0px',
            'padding-bottom'     : '2px',
            'padding-top'        : '2px'
        });

        grid  = null;
        store = createStore(200);
        grid  = await createGrid({contentSizedRows: true, store});

        // The first measurement, and the refresh its heights trigger
        await grid.view.measureRowHeights();
        await grid.view.promiseUpdate();
        await grid.timeout(50)
    });

    test.afterEach(async () => {
        await grid.timeout(20);
        grid?.destroy();
        store?.destroy();

        Object.assign(Neo.main.DomAccess, original)
    });

    test('without contentSizedRows, a wrapText column renders and measures nothing', async () => {
        let fixed = await createGrid({store}),
            cell  = fixed.body.items[0].vdom.cn.find(node => node.data?.field === 'note');

        expect(cell.html).toBe('Note 0');
        expect(cell.cn).toBeUndefined();

        reads.length = 0;
        await fixed.view.measureRowHeights();
        expect(reads).toEqual([]);

        await fixed.timeout(20);
        fixed.destroy()
    });

    test('a wrapText cell renders its text in a block container whose id follows the cell', () => {
        let row  = grid.body.items.find(item => item.rowIndex === 0),
            note = row.vdom.cn.find(node => node.data?.field === 'note'),
            id   = row.vdom.cn.find(node => node.data?.field === 'id'),
            cell = {cn: [{cls: ['neo-grid-cell-text'], id: 'old__text'}], id: 'old'};

        expect(note.cn).toEqual([{cls: ['neo-grid-cell-text'], id: `${note.id}__text`, html: 'Note 0'}]);
        expect(id.html).toBe('0');

        // A recycled cell moving to another slot takes the text container along
        Row.setCellId(cell, 'row-1__cell-3');
        expect(cell.cn[0].id).toBe('row-1__cell-3__text')
    });

    test('rows take their tallest wrapText column across bodies, plus the cell chrome, never less than rowHeight', () => {
        let geometry = grid.view.rowGeometry,
            rows     = grid.body.items.filter(row => row.record);

        expect(reads.length).toBeGreaterThan(0);
        expect(rows.length).toBeGreaterThan(5);

        rows.forEach(row => {
            expect(geometry.heightAt(row.rowIndex), `row ${row.rowIndex}`).toBe(expectedHeight(row.record))
        });

        // Row 0 has one line in both columns: the floor holds it at rowHeight
        expect(geometry.heightAt(0)).toBe(rowHeight)
    });

    test('one batched read covers the new text containers, and measured ones are not read again', async () => {
        let {view} = grid,
            measuredIds;

        reads.length = 0;

        view.syncBodies(view.rowGeometry.offsetAt(100));
        await view.promiseUpdate();
        await grid.timeout(50);

        expect(reads.length).toBeGreaterThan(0);

        // The first read after the scroll covers the rows that entered, in both bodies
        measuredIds = new Set(reads[0]);
        expect([...renderedTexts(grid).entries()].filter(([id, {record}]) => record.id >= 100 && record.id < 105)
            .every(([id]) => measuredIds.has(id))).toBe(true);

        // A geometry-only refresh renders no new text: nothing to read
        reads.length = 0;
        view.setRowHeights(new Map([[view.getRecordId(store.getAt(199)), 300]]));
        await view.promiseUpdate();
        await grid.timeout(50);

        expect(reads).toEqual([])
    });

    test('a reply for a cell its row rendered again in the meantime is dropped, and the new cell is measured', async () => {
        let {view}  = grid,
            applied = [],
            changed, release;

        // Hold the read in flight
        respond = ids => {
            let rects = readTextRects(grid, ids);
            return new Promise(resolve => release = () => resolve(rects))
        };

        // One entry per pass that applies heights
        view.setRowHeights = new Proxy(view.setRowHeights, {
            apply(target, scope, args) {
                applied.push([...args[0].keys()]);
                return Reflect.apply(target, scope, args)
            }
        });

        // New rows enter, and their read goes out
        view.syncBodies(view.rowGeometry.offsetAt(100));
        await view.promiseUpdate();
        await expect.poll(() => typeof release).toBe('function');

        // Meanwhile record 101 gets new content: its row renders new cells
        changed = store.get(101);
        changed.note = 'A new note';

        respond = ids => Promise.resolve(readTextRects(grid, ids));
        release();
        await grid.timeout(50);

        expect(applied[0]).toContain(view.getRecordId(store.get(102)));
        expect(applied[0]).not.toContain(view.getRecordId(changed));

        // The row's own update measures the new cell
        expect(applied.flat()).toContain(view.getRecordId(changed))
    });

    test('a reply for slots recycled to other records is dropped', async () => {
        let {view}  = grid,
            applied = [],
            release, stale;

        respond = ids => {
            let rects = readTextRects(grid, ids);
            return new Promise(resolve => release = () => resolve(rects))
        };

        view.setRowHeights = new Proxy(view.setRowHeights, {
            apply(target, scope, args) {
                applied.push(...args[0].keys());
                return Reflect.apply(target, scope, args)
            }
        });

        // Rows around 50 enter, and their read goes out
        view.syncBodies(view.rowGeometry.offsetAt(50));
        await view.promiseUpdate();
        await expect.poll(() => typeof release).toBe('function');

        // Before the reply arrives, every pooled slot moves on to the rows around 150
        respond = ids => Promise.resolve(readTextRects(grid, ids));
        view.syncBodies(view.rowGeometry.offsetAt(150));
        await view.promiseUpdate();

        release();
        await grid.timeout(50);

        stale = store.items.slice(40, 70).map(record => view.getRecordId(record));

        expect(applied.length).toBeGreaterThan(0);
        expect(applied.filter(id => stale.includes(id))).toEqual([])
    });

    test('a row whose vdom runs ahead of the DOM is read once its update lands', async () => {
        let {view}        = grid,
            {rowGeometry} = view,
            row           = grid.body.items.find(item => item.rowIndex === 1),
            // A 5-line note (105px), where the slot's record 1 shows a 3-line one
            record        = store.get(152);

        respond = ids => Promise.resolve(shownTextRects(grid, ids));

        // A silent pass moves the slot on to record 152, and no update renders it yet
        row.updateContent({record, rowIndex: 152, silent: true});

        await view.measureRowHeights();
        expect(rowGeometry.heightAt(152), 'record 1\'s note is not read for record 152').toBe(rowGeometry.estimate);

        // The row's own update lands, and the pass it schedules reads the new note
        await row.promiseUpdate();
        await grid.timeout(50);

        expect(rowGeometry.heightAt(152)).toBe(expectedHeight(record))
    });

    test('a cell whose new width has not landed is read at that width once it does', async () => {
        let {view}  = grid,
            applied = [],
            row     = grid.body.items.find(item => item.rowIndex === 4),
            // Record 4: a 2-line name and a 4-line note
            id      = view.getRecordId(store.get(4));

        respond = ids => Promise.resolve(shownTextRects(grid, ids));

        // Every height a pass applies to record 4, in order
        view.setRowHeights = new Proxy(view.setRowHeights, {
            apply(target, scope, args) {
                args[0].has(id) && applied.push(args[0].get(id));
                return Reflect.apply(target, scope, args)
            }
        });

        // A column resize widens the cell in the vdom, and no update renders it yet
        row.vdom.cn.find(node => node.data?.field === 'note').style.width = '250px';

        await view.measureRowHeights();
        expect(applied, 'the 200px note is not read for 250px').toEqual([]);

        // The row's update lands, and the pass it schedules reads the note at 250px: 4 × 200 / 250 lines
        await row.promiseUpdate();
        await grid.timeout(50);

        expect(applied[0]).toBe(4 * LINE * WIDTHS.note / 250 + CHROME)
    });

    for (const from of ['html', 'text']) {
        test(`a note switching from ${from} to the other mode with the same bytes is read once its update lands`, async () => {
            let {view}  = grid,
                applied = [],
                row     = grid.body.items.find(item => item.rowIndex === 4),
                // Record 4: a 2-line name, and a note of 4 lines as HTML but 1 as literal text
                id      = view.getRecordId(store.get(4)),
                heights = {html: 4 * LINE + CHROME, text: 2 * LINE + CHROME};

            respond = ids => Promise.resolve(shownTextRects(grid, ids));

            // The text-mode note lands first
            if (from === 'text') {
                switchNoteMode(row);
                await row.promiseUpdate();
                await grid.timeout(50)
            }

            view.setRowHeights = new Proxy(view.setRowHeights, {
                apply(target, scope, args) {
                    args[0].has(id) && applied.push(args[0].get(id));
                    return Reflect.apply(target, scope, args)
                }
            });

            switchNoteMode(row);

            await view.measureRowHeights();
            expect(applied, `the ${from} note is not read for the other mode`).toEqual([]);

            await row.promiseUpdate();
            await grid.timeout(50);

            expect(applied[0]).toBe(from === 'html' ? heights.text : heights.html)
        })
    }

    test('the string renderer\'s escaped text counts as shown', async () => {
        let {view}               = grid,
            applied              = [],
            row                  = grid.body.items.find(item => item.rowIndex === 4),
            id                   = view.getRecordId(store.get(4)),
            index                = row.vdom.cn.findIndex(node => node.data?.field === 'note'),
            cell                 = row.vdom.cn[index],
            {html, ...container} = cell.cn[0];

        respond = ids => Promise.resolve(shownTextRects(grid, ids));

        // A text-mode note with markup characters lands
        row.vdom.cn[index] = {...cell, cn: [{...container, text: 'Note 4 <b>'}]};
        await row.promiseUpdate();
        await grid.timeout(50);

        // The string renderer keeps it escaped in the vnode. A new, unmeasured cell asks for the same text.
        VNodeUtil.getById(row.vnode, container.id).textContent = 'Note 4 &lt;b&gt;';
        row.vdom.cn[index] = {...row.vdom.cn[index]};

        view.setRowHeights = heights => {heights.has(id) && applied.push(heights.get(id)); return false};
        Neo.config.useDomApiRenderer = false;

        try {
            await view.measureRowHeights()
        } finally {
            Neo.config.useDomApiRenderer = true
        }

        expect(applied).toEqual([2 * LINE + CHROME])
    });

    test('a reply for a cell whose width changed in the meantime is dropped', async () => {
        let {view}  = grid,
            applied = [],
            record  = store.get(104),
            cell, first, release;

        respond = ids => {
            let rects = readTextRects(grid, ids);
            return new Promise(resolve => release = () => resolve(rects))
        };

        // Every height a pass applies, in order
        view.setRowHeights = new Proxy(view.setRowHeights, {
            apply(target, scope, args) {
                applied.push(...args[0].entries());
                return Reflect.apply(target, scope, args)
            }
        });

        view.syncBodies(view.rowGeometry.offsetAt(100));
        await view.promiseUpdate();
        await expect.poll(() => typeof release).toBe('function');

        // A recycled cell keeps its node and takes a new width in place, as a column change can give it
        cell = grid.body.items.find(row => row.record === record).vdom.cn.find(node => node.data?.field === 'note');
        cell.style.width = '250px';

        respond = ids => Promise.resolve(readTextRects(grid, ids));
        release();
        await grid.timeout(50);

        // Record 104: a 3-line name (65px) and a 4-line note (85px). The held pass may only count the name.
        first = applied.find(([id]) => id === view.getRecordId(record));

        expect(first).toEqual([view.getRecordId(record), 3 * LINE + CHROME]);

        // The cell is read again at its new width by a later pass
        expect(view.rowGeometry.heightAt(104)).toBe(4 * LINE + CHROME)
    });

    test('a changed record measures its row again, through the row\'s own update', async () => {
        let {view} = grid,
            record = store.get(3),
            textId;

        reads.length = 0;

        // Three lines more of note: only the row of record 3 renders
        record.set({note: 'A longer note', noteLines: 4});
        await grid.timeout(50);

        textId = [...renderedTexts(grid).entries()].find(([id, text]) => text.record === record && text.field === 'note')[0];

        expect(reads.flat()).toContain(textId);
        expect(view.rowGeometry.heightAt(3)).toBe(4 * LINE + CHROME)
    });

    test('a replaced store forgets the measured texts of the old store\'s records', async () => {
        let natural   = await createGrid({contentSizedRows: true, store, useInternalId: false}),
            {view}    = natural,
            hideNames = false,
            // The same ids, naming records with one line in both columns
            other     = Neo.create(Store, {
                data       : Array.from({length: 200}, (item, index) => ({id: index, name: 'N', nameLines: 1, note: 'N', noteLines: 1})),
                keyProperty: 'id',
                model      : store.model
            });

        // After the swap, the name texts go unread
        respond = ids => Promise.resolve(readTextRects(natural, ids).map((rect, index) =>
            hideNames && renderedTexts(natural).get(ids[index])?.field === 'name' ? {} : rect));

        await view.measureRowHeights();
        await view.promiseUpdate();
        await natural.timeout(50);

        // Record 8 of the first store: its 3-line name is its tallest text
        expect(view.rowGeometry.heightAt(8)).toBe(3 * LINE + CHROME);

        hideNames     = true;
        natural.store = other;
        other.fire('load', {items: other.items});
        await natural.timeout(100);

        // Only the new note texts were read, and an old name height must not combine with them
        expect(view.rowGeometry.heightAt(8)).toBe(rowHeight);

        await natural.timeout(20);
        natural.destroy();
        other.destroy()
    });

    test('turning wrapText off forgets the measured heights', async () => {
        let {view} = grid,
            note   = grid.columns.get('note'),
            name   = grid.columns.get('name');

        expect(view.rowGeometry.heightAt(4)).toBe(expectedHeight(store.getAt(4)));

        note.wrapText = false;
        name.wrapText = false;
        await view.promiseUpdate();
        await grid.timeout(50);

        expect(view.rowGeometry.heightAt(4)).toBe(rowHeight);
        expect(renderedTexts(grid).size).toBe(0)
    });

    test('a hidden cell is measured once a horizontal scroll shows it, at the same width', async () => {
        reads.length = 0;

        let hidden = await createGrid({
                columns: [
                    {dataField: 'name', locked: 'start', text: 'Name',   width: 150, wrapText: true},
                    {dataField: 'id',                    text: 'ID',     width: 80},
                    {dataField: 'filler',                text: 'Filler', width: 600},
                    {dataField: 'note', hideMode: 'display', text: 'Note', width: 200, wrapText: true}
                ],
                contentSizedRows: true,
                store
            }),
            {body, view} = hidden,
            noteCell     = () => body.items.find(row => row.rowIndex === 4).vdom.cn.find(cell => cell.data?.field === 'note');

        respond = ids => Promise.resolve(readTextRects(hidden, ids));

        await view.measureRowHeights();
        await view.promiseUpdate();
        await hidden.timeout(50);

        // Out of the horizontal range, the note cell stays in its row with display none: it is not read, and only
        // the name counts
        expect(noteCell().style.display).toBe('none');
        expect(reads.flat().filter(id => renderedTexts(hidden).get(id)?.field === 'note')).toEqual([]);
        expect(view.rowGeometry.heightAt(4)).toBe(Math.max(rowHeight, store.getAt(4).nameLines * LINE + CHROME));

        // Scrolled to the horizontal end, 280px, the note column comes into range. This is what a scroll event of
        // the horizontal scrollbar does, without the hover sync a unit test has no main thread for.
        hidden.scrollManager.scrollLeft = 280;
        hidden.scrollManager.syncGridBody();
        await view.promiseUpdate();
        await hidden.timeout(50);
        await view.measureRowHeights();
        await view.promiseUpdate();

        expect(noteCell().style.display).toBeFalsy();
        expect(noteCell().style.width).toBe('200px');
        expect(view.rowGeometry.heightAt(4)).toBe(expectedHeight(store.getAt(4)));

        await hidden.timeout(20);
        hidden.destroy()
    });

    test('a cell hidden while its read is in flight is not cached, and is measured once it shows', async () => {
        let {view} = grid,
            record = store.get(4),
            cell, release;

        respond = ids => {
            let rects = () => readTextRects(grid, ids);
            return new Promise(resolve => release = () => resolve(rects()))
        };

        // Record 4 gets a 5-line note: its row renders a new note cell, whose read goes out
        record.set({note: 'A long note', noteLines: 5});
        await expect.poll(() => typeof release).toBe('function');

        // Before the reply, the cell leaves the horizontal range: same node, same width, display none
        cell = grid.body.items.find(row => row.record === record).vdom.cn.find(node => node.data?.field === 'note');
        cell.style.display = 'none';

        respond = ids => Promise.resolve(readTextRects(grid, ids));
        release();
        await grid.timeout(50);

        // It shows again, unchanged: the reply for the hidden box was not kept, so the note is read now
        cell.style.display = null;
        await view.measureRowHeights();

        expect(view.rowGeometry.heightAt(4)).toBe(5 * LINE + CHROME)
    });

    test('removing the tallest wrapText column derives the measured rows from the remaining one, scrolled-out rows included', async () => {
        let {view}   = grid,
            nameOnly = record => Math.max(rowHeight, record.nameLines * LINE + CHROME);

        // Measure the rows around 100, then scroll back: those rows keep only their stored heights
        view.syncBodies(view.rowGeometry.offsetAt(100));
        await view.promiseUpdate();
        await grid.timeout(50);
        view.syncBodies(0);
        await view.promiseUpdate();
        await grid.timeout(50);

        // Record 104: a 3-line name (65px) under a 4-line note (85px)
        expect(view.rowGeometry.heightAt(104)).toBe(4 * LINE + CHROME);

        grid.columns.remove(grid.columns.get('note'));
        await view.promiseUpdate();
        await grid.timeout(50);
        await view.measureRowHeights();

        expect(view.rowGeometry.heightAt(104)).toBe(nameOnly(store.get(104)));
        expect(view.rowGeometry.heightAt(4)).toBe(nameOnly(store.getAt(4)))
    });

    test('a new rowHeight floors the measured rows, and lowering it again restores their measured heights', async () => {
        let {view} = grid;

        // Record 3: a 2-line note, 45px
        expect(view.rowGeometry.heightAt(3)).toBe(2 * LINE + CHROME);

        grid.rowHeight = 100;
        expect(view.rowGeometry.heightAt(3)).toBe(100);

        grid.rowHeight = rowHeight;
        expect(view.rowGeometry.heightAt(3)).toBe(2 * LINE + CHROME);

        await view.promiseUpdate()
    })
});
