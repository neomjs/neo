import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Exercises the standalone dock example with ordinary buffered Grid and TreeGrid panes.
 * Cold declarations create the real example MainContainer. Pointer gestures own every resize;
 * a passive worker listener counts resizeSplit projections without replacing an Engine method.
 * @see https://github.com/neomjs/neo/issues/19472
 */
test.describe('standalone dock: heavy split content', () => {
    test.setTimeout(180000);
    test.use({viewport: {width: 1400, height: 1000}});

    /**
     * @summary Builds construction-time declarations with an explicitly expanded tree.
     * @param {String} axis Split-node orientation.
     * @param {String} parentId The existing example viewport.
     * @returns {Object}
     */
    function createConfig(axis, parentId) {
        const numbers = Array.from({length: 14}, (_, index) => 'number' + (index + 7)),
              values  = index => Object.fromEntries(numbers.map((field, column) => [field, index + column])),
              rows    = Array.from({length: 2000}, (_, index) => ({
                  id     : index + 1, firstname: 'Row ' + index, lastname: 'Flat',
                  counter: index, progress: index % 100, ...values(index)
              })),
              columns = fields => fields.map((dataField, index) => ({
                  dataField, text: dataField, width: index === 0 ? 180 : 100,
                  ...(dataField === 'name' ? {type: 'tree'} : {})
              })),
              tree    = [{
                  id       : 'folder-root', name: 'Expanded root', parentId: null,
                  collapsed: false, isLeaf: false, firstname: 'Root', lastname: 'Tree',
                  counter  : 0, progress: 0, ...values(0)
              }, ...rows.map((row, index) => ({
                  ...row, id: 'leaf-' + index, parentId: 'folder-root',
                  name: 'Leaf ' + index, lastname: 'Tree', collapsed: false, isLeaf: true
              }))];

        return {
            className                 : 'Neo.examples.dashboard.dock.MainContainer',
            appName                   : 'Neo.examples.dashboard.dock',
            id                        : 'heavy-dock-' + axis,
            parentId,
            flex                      : 1,
            style                     : {minHeight: 0, minWidth: 0},
            dockProjectionConfig      : {flex: 1, style: {minHeight: 0, minWidth: 0}},
            layoutCollectionStorageKey: 'neo.e2e.19472.' + axis,
            panes                     : {
                flat: {
                    className: 'Neo.grid.Container', id: 'heavy-flat-' + axis,
                    header   : {text: 'Grid'}, style: {minHeight: 0, minWidth: 0},
                    store    : {
                        className      : 'Neo.data.Store', id: 'heavy-flat-store-' + axis,
                        autoInitRecords: false,
                        model          : {className: 'Neo.examples.grid.bigData.MainModel', amountColumns: 20},
                        data           : rows
                    },
                    columns: columns(['firstname', 'lastname', 'counter', 'progress', ...numbers])
                },
                tree: {
                    className: 'Neo.grid.Container', id: 'heavy-tree-' + axis,
                    header   : {text: 'TreeGrid'}, style: {minHeight: 0, minWidth: 0},
                    store    : {
                        className      : 'Neo.data.TreeStore', id: 'heavy-tree-store-' + axis,
                        autoInitRecords: false,
                        model          : {className: 'Neo.examples.grid.treeBigData.MainModel', amountColumns: 20},
                        data           : tree
                    },
                    columns: columns(['name', 'firstname', 'lastname', 'counter', 'progress', ...numbers])
                }
            },
            perspectives: {
                heavy: {center: {id: 'heavy-split', orientation: axis, sizes: [0.5, 0.5], children: ['flat', 'tree']}}
            },
            activePerspective: 'heavy'
        }
    }

    /**
     * @summary Reads raw column keys before mapping them, preserving duplicate evidence.
     * @param {import('@playwright/test').Page} page
     * @param {String} gridId
     * @returns {Promise<Object>}
     */
    const readMatrix = (page, gridId) => page.evaluate(id => {
        const grid      = document.getElementById(id),
              header    = grid.querySelector('.neo-grid-header-toolbar'),
              body      = grid.querySelector('.neo-grid-body'),
              view      = grid.querySelector('.neo-grid-view'),
              scrollbar = grid.querySelector('.neo-grid-horizontal-scrollbar'),
              clip      = body.getBoundingClientRect(),
              rowClip   = view.getBoundingClientRect(),
              visible   = rect => rect.width > 0 && rect.right > clip.left + 1 && rect.left < clip.right - 1,
              row       = [...body.querySelectorAll('[role="row"]')].find(node => {
                  const rect = node.getBoundingClientRect();
                  return rect.bottom > rowClip.top + 1 && rect.top < rowClip.bottom - 1
              }),
              headers = {}, cells = {}, headerRows = [], cellRows = [];

        [...header.children].forEach(node => {
            const key = node.getAttribute('aria-colindex'), rect = node.getBoundingClientRect();
            key && visible(rect) && headerRows.push({
                key, visualX: rect.left, visualW: rect.width,
                contentX: node.offsetLeft, layoutW: parseFloat(getComputedStyle(node).width)
            })
        });
        row && [...row.children].forEach(node => {
            const key = node.getAttribute('aria-colindex'), rect = node.getBoundingClientRect();
            key && visible(rect) && cellRows.push({
                key, dataField: node.getAttribute('data-field'),
                visualX : rect.left, visualW: rect.width,
                contentX: parseFloat(node.style.left), layoutW: parseFloat(getComputedStyle(node).width)
            })
        });
        headerRows.forEach(value => {headers[value.key] = value});
        cellRows.forEach(value => {cells[value.key] = value});

        return {
            headers, cells, headerCount: headerRows.length, cellCount: cellRows.length,
            layoutWidth   : parseFloat(getComputedStyle(grid).width),
            transform     : getComputedStyle(grid).transform,
            buttonWidthSum: [...header.children].filter(node => node.getClientRects().length)
                .reduce((sum, node) => sum + parseFloat(getComputedStyle(node).width), 0),
            scrollLeft    : header.scrollLeft, nativeLeft: scrollbar.scrollLeft, nativeTop: view.scrollTop,
            visibleRecords: [...body.querySelectorAll('[role="row"]')].filter(node => {
                const rect = node.getBoundingClientRect();
                return rect.bottom > rowClip.top + 1 && rect.top < rowClip.bottom - 1
            }).map(node => ({id: node.getAttribute('data-record-id'), index: Number(node.getAttribute('aria-rowindex'))})),
            bufferedRows: body.querySelectorAll('[role="row"]').length
        }
    }, gridId);

    /**
     * @summary Compares worker, header and body geometry after a committed projection or native scroll.
     * @param {Object} app The Neural Link app.
     * @param {import('@playwright/test').Page} page
     * @param {Object} pane Grid and body identities.
     * @param {String} label
     * @returns {Promise<void>}
     */
    async function assertGeometry(app, page, pane, label) {
        const readWorker = () => app.getComponent(pane.bodyId, [
            'containerWidth', 'availableWidth', 'scrollLeft', 'scrollTop', 'columnPositions.items',
            'isVdomUpdating', 'needsVdomUpdate'
        ]);

        await expect.poll(async () => {
            const worker = await readWorker(), matrix = await readMatrix(page, pane.id);
            return Math.abs(worker.containerWidth - matrix.layoutWidth)
        }, {message: label + ': worker width converges on layout width', timeout: 10000}).toBeLessThan(1);

        await expect.poll(async () => {
            const worker = await readWorker(), matrix = await readMatrix(page, pane.id);
            return Math.abs(worker.scrollLeft - matrix.scrollLeft) + Math.abs(worker.scrollTop - matrix.nativeTop)
        }, {message: label + ': worker and native scroll offsets converge', timeout: 10000}).toBeLessThan(1);

        await expect.poll(async () => {
            const worker = await readWorker();
            return !worker.isVdomUpdating && !worker.needsVdomUpdate
        }, {message: label + ': body VDOM work settles', timeout: 10000}).toBe(true);

        const worker     = await readWorker(), matrix = await readMatrix(page, pane.id),
              positions  = worker['columnPositions.items'],
              headerKeys = Object.keys(matrix.headers).sort((a, b) => a - b),
              cellKeys   = Object.keys(matrix.cells).sort((a, b) => a - b),
              byField    = new Map(positions.map(column => [column.dataField, column]));

        expect(matrix.transform, label + ': no residual grid transform').toBe('none');
        expect(matrix.headerCount, label + ': raw header keys are unique').toBe(headerKeys.length);
        expect(matrix.cellCount, label + ': raw cell keys are unique').toBe(cellKeys.length);
        expect(headerKeys.length, label + ': multiple columns are visible').toBeGreaterThan(2);
        expect(cellKeys, label + ': header/body key sets agree').toEqual(headerKeys);
        expect(byField.size, label + ': worker dataFields are unique').toBe(positions.length);
        expect(positions.length, label + ': all declared columns remain owned').toBe(pane.columnCount);
        expect(Math.abs(worker.availableWidth - matrix.buttonWidthSum), label + ': content width agrees').toBeLessThan(1.5);
        expect(Math.abs(matrix.nativeLeft - matrix.scrollLeft), label + ': scrollbar/header scroll agrees').toBeLessThan(1);

        for (const key of headerKeys) {
            const header = matrix.headers[key], cell = matrix.cells[key], position = byField.get(cell.dataField);
            expect(position, label + ': worker owns column ' + key).toBeTruthy();
            expect(Math.abs(header.visualX - cell.visualX), label + ': aligned visual left ' + key).toBeLessThan(1);
            expect(Math.abs(header.visualW - cell.visualW), label + ': aligned visual width ' + key).toBeLessThan(1);
            expect(Math.abs(position.x - cell.contentX), label + ': worker/cell content left ' + key).toBeLessThan(0.5);
            expect(Math.abs(position.width - cell.layoutW), label + ': worker/cell width ' + key).toBeLessThan(1);
            expect(Math.abs(position.x - header.contentX), label + ': worker/header content left ' + key).toBeLessThan(1)
        }
    }

    for (const axis of ['horizontal', 'vertical']) {
        test(axis + ': repeated live split, cancellation and scrolling preserve both heavy panes', async ({page, neuralLink}) => {
            await page.goto('/examples/dashboard/dock/');
            await expect(page.locator('.neo-dashboard-dock-splitter').first()).toBeVisible({timeout: 60000});

            const app         = await neuralLink.connectToApp('Neo.examples.dashboard.dock'),
                  [original]  = await app.findInstances({className: 'Neo.examples.dashboard.dock.MainContainer'}, ['id']),
                  parentId    = await page.locator('.neo-viewport').first().getAttribute('id'),
                  config      = createConfig(axis, parentId),
                  workspaceId = config.id,
                  ids         = ['heavy-flat-' + axis, 'heavy-tree-' + axis],
                  dimension   = axis === 'horizontal' ? 'width' : 'height';

            expect(original.id).toBeTruthy();
            // Direct Main-to-App RMA keeps setup routable while the sole old app root is absent.
            await page.evaluate(async ({oldId, config}) => {
                for (const path of [
                    '../../examples/grid/bigData/MainModel.mjs', '../grid/Container.mjs',
                    '../data/TreeStore.mjs', '../../examples/grid/treeBigData/MainModel.mjs'
                ]) {
                    const loaded = await Neo.worker.App.loadModule({path});
                    if (!loaded.success) throw new Error('heavy host import failed: ' + path)
                }
                const removed = await Neo.worker.App.destroyNeoInstance(oldId);
                if (!removed.success) throw new Error('heavy host disposal failed');
                const created = await Neo.worker.App.createNeoInstance(config);
                if (!created.success || created.id !== config.id) throw new Error('heavy host creation failed')
            }, {oldId: original.id, config});

            for (const id of ids) {
                await expect(page.locator('#' + id + ' .neo-grid-body [role="row"]').first()).toBeVisible({timeout: 30000})
            }
            await expect(page.locator('#' + ids[0] + ' .neo-grid-body').getByText('Row 0', {exact: true})).toBeVisible();
            await expect(page.locator('#' + ids[1] + ' .neo-grid-body').getByText('Expanded root', {exact: true})).toBeVisible();
            await expect(page.locator('#' + ids[1] + ' .neo-grid-body').getByText('Leaf 0', {exact: true})).toBeVisible();
            await expect(page.locator('#' + ids[1] + ' .neo-tree-toggle').first()).toBeVisible();

            const panes = [];
            for (const [index, id] of ids.entries()) {
                const properties = await app.getComponent(id, ['body.id', 'store.id', 'isTreeGrid']),
                      storeId    = properties['store.id'],
                      store      = await app.inspectStore(storeId, 2, 0);
                expect(storeId).toBe('heavy-' + (index ? 'tree' : 'flat') + '-store-' + axis);
                expect(store.count).toBe(index ? 2001 : 2000);
                expect(properties.isTreeGrid).toBe(Boolean(index));
                if (index) {
                    expect(store.items).toMatchObject([
                        {id: 'folder-root', collapsed: false, isLeaf: false},
                        {id: 'leaf-0', parentId: 'folder-root', isLeaf: true}
                    ])
                }
                panes.push({id, storeId, bodyId: properties['body.id'], columnCount: index ? 19 : 18});
                expect((await readMatrix(page, id)).bufferedRows, 'large data uses a bounded row pool').toBeLessThan(100);
                await assertGeometry(app, page, panes[index], axis + ': boot')
            }

            const source = 'const workspace = Neo.getComponent(' + JSON.stringify(workspaceId) + ');\n' +
                'workspace.heavySplitReceipts = [];\n' +
                'const ids = ' + JSON.stringify(ids) + ';\n' +
                'const identities = ids.map(id => {const pane = Neo.getComponent(id); return {pane, store: pane.store}});\n' +
                'Object.defineProperty(workspace, "heavyIdentityValid", {get: () => ids.every((id, index) =>\n' +
                ' Neo.getComponent(id) === identities[index].pane && identities[index].pane.store === identities[index].store)});\n' +
                'workspace.on("beforeDockZoneDocumentChange", ({descriptor}) => {\n' +
                ' if (descriptor?.operation === "resizeSplit") workspace.heavySplitReceipts.push({...descriptor});\n' +
                '});';
            await page.evaluate(path => Neo.worker.App.loadModule({path}),
                'data:text/javascript;charset=utf-8,' + encodeURIComponent(source + '\n// heavy-split-' + axis));

            const readState = () => app.getComponent(workspaceId, ['dockModel', 'heavySplitReceipts', 'heavyIdentityValid']),
                  readPair  = () => page.evaluate(({ids, dimension}) => ids.map(id =>
                      document.getElementById(id).getBoundingClientRect()[dimension]), {ids, dimension}),
                  splitter = page.locator('.neo-dashboard-dock-split-' + axis + ' > .neo-dashboard-dock-splitter-' + axis),
                  boot = await readPair();

            expect(await splitter.count(), 'only the declared split boundary is dragged').toBe(1);

            /**
             * @summary Samples conserved live extents while the pointer remains held.
             * @param {Number} delta
             * @param {Boolean} cancel
             * @returns {Promise<void>}
             */
            async function gesture(delta, cancel = false) {
                const before = await readState(), serialized = JSON.stringify(before.dockModel),
                      count  = before.heavySplitReceipts.length, pair = await readPair(),
                      box    = await splitter.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;

                await page.mouse.move(x, y);
                await page.mouse.down();
                try {
                    await page.waitForTimeout(130); // Mouse sensor delay, before travel.
                    await page.evaluate(({ids, dimension}) => {
                        const capture = window.heavySplitCapture = {running: true, frames: []};
                        const sample  = () => {
                            if (!capture.running) return;
                            capture.frames.push(ids.map(id => document.getElementById(id).getBoundingClientRect()[dimension]));
                            requestAnimationFrame(sample)
                        };
                        requestAnimationFrame(sample)
                    }, {ids, dimension});

                    for (let segment = 1; segment <= 4; segment++) {
                        await page.mouse.move(x + (axis === 'horizontal' ? delta * segment / 4 : 0),
                            y + (axis === 'vertical' ? delta * segment / 4 : 0), {steps: 3});
                        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                        const held = await readState();
                        expect(JSON.stringify(held.dockModel), 'held preview leaves the exact document unchanged').toBe(serialized);
                        expect(held.heavySplitReceipts.length, 'held preview emits no semantic projection').toBe(count)
                    }
                    await expect(splitter).toHaveClass(/neo-is-dragging/);
                    await expect(page.locator('body > .neo-dragproxy.neo-dashboard-dock-splitter')).toHaveCount(0);

                    const frames = await page.evaluate(() => {
                        window.heavySplitCapture.running = false;
                        return window.heavySplitCapture.frames
                    }), heldPair = await readPair();

                    expect(frames.length, 'multiple live frames were observed').toBeGreaterThan(3);
                    expect(new Set(frames.map(frame => Math.round(frame[0]))).size, 'held frames show multiple live extents').toBeGreaterThan(2);
                    for (const frame of frames) {
                        expect(Math.abs(frame[0] + frame[1] - pair[0] - pair[1]), 'every held frame conserves the adjacent pair').toBeLessThan(1.5)
                    }
                    expect(Math.abs(heldPair[0] - pair[0] - delta), 'first pane follows the held pointer').toBeLessThan(2);
                    expect(Math.abs(heldPair[1] - pair[1] + delta), 'second pane changes complementarily').toBeLessThan(2);

                    if (cancel) {
                        await page.keyboard.press('Escape');
                        await expect(splitter).not.toHaveClass(/neo-is-dragging/)
                    }
                } finally {
                    await page.evaluate(() => {if (window.heavySplitCapture) window.heavySplitCapture.running = false});
                    await page.mouse.up()
                }

                if (cancel) {
                    await expect.poll(async () => (await readPair()).map((value, index) => Math.abs(value - pair[index])))
                        .toEqual([0, 0]);
                    const cancelled = await readState();
                    expect(JSON.stringify(cancelled.dockModel), 'Escape leaves the exact document unchanged').toBe(serialized);
                    expect(cancelled.heavySplitReceipts.length, 'Escape emits no resizeSplit projection').toBe(count)
                } else {
                    await expect.poll(async () => (await readState()).heavySplitReceipts.length).toBe(count + 1);
                    const committed = await readState(), sizes = committed.dockModel.nodes['heavy-split'].sizes;
                    expect(committed.heavySplitReceipts.at(-1)).toMatchObject({operation: 'resizeSplit', splitNodeId: 'heavy-split'});
                    expect(Math.sign(sizes[0] - before.dockModel.nodes['heavy-split'].sizes[0])).toBe(Math.sign(delta));
                    expect(sizes[0] + sizes[1]).toBeCloseTo(1, 8);
                    await app.callMethod(workspaceId, 'refreshPromise.then');
                    await expect.poll(async () => Math.abs((await readPair())[0] - pair[0] - delta)).toBeLessThan(2);
                    await expect(page.locator('#' + workspaceId)).not.toHaveClass(/neo-dashboard-dock-animating/);
                    await expect(page.locator('.neo-dock-flip-fixed-stage')).toHaveCount(0);
                    expect((await readState()).heavySplitReceipts.length, 'settlement admits exactly one semantic commit').toBe(count + 1)
                }

                expect((await readState()).heavyIdentityValid, 'the original pane and store objects survive').toBe(true);
                for (const pane of panes) {
                    expect((await app.getComponent(pane.id, ['body.id', 'store.id']))).toEqual({
                        'body.id': pane.bodyId, 'store.id': pane.storeId
                    });
                    await assertGeometry(app, page, pane, axis + ': settled ' + delta + (cancel ? ' cancel' : ' commit'))
                }
            }

            for (const delta of [70, -70, 55, -55]) await gesture(delta);
            const end = await readPair();
            end.forEach((value, index) => expect(Math.abs(value - boot[index]), 'net-zero gestures restore the boot extent').toBeLessThan(2));
            await gesture(45, true);

            for (const pane of panes) {
                const before    = await readMatrix(page, pane.id),
                      view      = page.locator('#' + pane.id + ' .neo-grid-view'),
                      scrollbar = page.locator('#' + pane.id + ' .neo-grid-horizontal-scrollbar');
                await view.hover();
                await page.mouse.wheel(0, 640);
                await expect.poll(async () => (await readMatrix(page, pane.id)).nativeTop).toBeGreaterThan(300);
                const bar = await scrollbar.boundingBox();
                await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
                await page.mouse.wheel(360, 0);
                await expect.poll(async () => (await readMatrix(page, pane.id)).nativeLeft).toBeGreaterThan(150);
                await assertGeometry(app, page, pane, axis + ': real scrolling');
                const scrolled = await readMatrix(page, pane.id);
                expect(scrolled.visibleRecords.every(record => record.id !== null && record.id !== ''),
                    'each visible row exposes its actual record identity').toBe(true);
                expect(Math.min(...scrolled.visibleRecords.map(record => record.index)), 'scroll paints later records').toBeGreaterThan(5);
                expect(scrolled.visibleRecords.map(record => record.id), 'the visible records changed').not.toEqual(before.visibleRecords.map(record => record.id));
                expect((await app.getComponent(pane.id, ['store.id']))['store.id'], 'scroll preserves store identity').toBe(pane.storeId);
                expect((await app.inspectStore(pane.storeId, 1, 0)).count).toBe(pane.columnCount === 19 ? 2001 : 2000)
            }

            expect((await readState()).heavyIdentityValid, 'scrolling retains the original pane and store objects').toBe(true);
            expect(await app.getConsoleLogs('warn', 'Dock projection failed'), 'no handled projection failure').toEqual([]);
        })
    }
});
