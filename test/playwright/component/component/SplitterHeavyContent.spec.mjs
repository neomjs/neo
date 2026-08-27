import {test, expect} from '../../fixtures.mjs';

let rootId;

/**
 * @summary Exercises proxy-free Splitter resizing with buffered Grid and TreeGrid siblings.
 *
 * This is the performance-risk falsifier, not a benchmark claim: both widgets carry large stores
 * and column virtualization, while the assertions require every repeated live resize to settle with
 * aligned headers/cells and no queued VDOM work.
 *
 * @see https://github.com/neomjs/neo/issues/17819
 */
test.describe('Neo.component.Splitter — heavy buffered siblings', () => {
    test.setTimeout(90000);
    test.use({viewport: {height: 800, width: 1200}});

    test.beforeEach(async ({neo, page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        await neo.loadModule('../container/Base.mjs');
        await neo.loadModule('../component/Splitter.mjs');
        await neo.loadModule('../button/Split.mjs');
        await neo.loadModule('../../examples/grid/bigData/GridContainer.mjs');
        await neo.loadModule('../../examples/grid/treeBigData/GridContainer.mjs')
    });

    test.afterEach(async ({neo}) => {
        if (rootId) {
            await neo.destroyComponent(rootId);
            rootId = null
        }
    });

    const readGeometry = page => page.evaluate(() => {
        const ids = ['splitter-heavy-grid', 'splitter-heavy-handle', 'splitter-heavy-tree'];

        return Object.fromEntries(ids.map(id => {
            const rect = document.getElementById(id).getBoundingClientRect();
            return [id, {height: rect.height, width: rect.width, x: rect.x, y: rect.y}]
        }))
    });

    const assertGridAligned = async (page, gridId, label) => {
        const result = await page.evaluate(id => {
            const grid    = document.getElementById(id),
                  toolbar = grid.querySelector('.neo-grid-header-toolbar'),
                  body    = grid.querySelector('.neo-grid-body'),
                  row     = body.querySelector('[role="row"]'),
                  clip    = body.getBoundingClientRect(),
                  visible = rect => rect.width > 0 && rect.right > clip.left + 1 && rect.left < clip.right - 1,
                  headers = [...toolbar.children]
                      .map(node => node.getBoundingClientRect())
                      .filter(visible)
                      .map(rect => ({width: Math.round(rect.width), x: Math.round(rect.x)})),
                  cells   = [...row.children]
                      .map(node => node.getBoundingClientRect())
                      .filter(visible)
                      .map(rect => ({width: Math.round(rect.width), x: Math.round(rect.x)}));

            return {cells, headers}
        }, gridId);

        expect(result.headers.length, `${label}: visible header/cell count`).toBe(result.cells.length);

        result.headers.forEach(header => {
            const cell = result.cells.find(item => Math.abs(item.x - header.x) <= 1);

            expect(cell, `${label}: a visible cell starts under header x=${header.x}`).toBeDefined();
            expect(Math.abs(cell.width - header.width), `${label}: matching widths at x=${header.x}`)
                .toBeLessThanOrEqual(1)
        })
    };

    const drag = async (page, splitterId, delta, onHold) => {
        const splitter = page.locator(`#${splitterId}`),
              box      = await splitter.boundingBox(),
              x        = box.x + box.width / 2,
              y        = box.y + box.height / 2;

        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.waitForTimeout(120); // production Mouse sensor threshold; pointer stays held
        await page.mouse.move(x + delta, y, {steps: 30});
        await onHold?.();
        await page.mouse.up()
    };

    test('repeated live resizes settle both virtualized widgets without geometry split-brain', async ({neo, page}) => {
        const result = await neo.createComponent({
            importPath: '../container/Base.mjs',
            ntype     : 'container',
            parentId  : 'component-test-viewport',
            height    : 520,
            id        : 'splitter-heavy-root',
            layout    : {ntype: 'hbox', align: 'stretch'},
            width     : 1000,
            items     : [{
                className   : 'Neo.examples.grid.bigData.GridContainer',
                id          : 'splitter-heavy-grid',
                minWidth    : 0,
                wrapperStyle: {flex: '1 1 0%', minWidth: 0}
            }, {
                ntype     : 'splitter',
                id        : 'splitter-heavy-handle',
                liveResize: true
            }, {
                className   : 'Neo.examples.grid.treeBigData.GridContainer',
                id          : 'splitter-heavy-tree',
                minWidth    : 0,
                wrapperStyle: {flex: '1 1 0%', minWidth: 0}
            }]
        });

        expect(result.success, JSON.stringify(result.error || result)).toBe(true);
        rootId = result.id;

        await expect(page.locator('#splitter-heavy-grid .neo-grid-body [role="row"]').first())
            .toBeVisible({timeout: 30000});
        await expect(page.locator('#splitter-heavy-tree .neo-grid-body [role="row"]').first())
            .toBeVisible({timeout: 30000});
        await expect(page.locator('#splitter-heavy-tree .neo-tree-toggle').first(),
            'the second sibling is a real TreeGrid').toBeVisible();

        const initial = await readGeometry(page);

        for (const [index, delta] of [70, -70, 55, -55].entries()) {
            const before = await readGeometry(page);

            await drag(page, 'splitter-heavy-handle', delta, async () => {
                await expect.poll(async () => {
                    const held = await readGeometry(page);
                    return Math.abs(held['splitter-heavy-handle'].x - before['splitter-heavy-handle'].x)
                }, {
                    message  : `cycle ${index + 1}: the real boundary moves while held`,
                    intervals: [30, 50, 100],
                    timeout  : 5000
                }).toBeGreaterThan(Math.abs(delta) - 15);

                await expect(page.locator('.neo-dragproxy')).toHaveCount(0)
            });

            await expect.poll(async () => {
                const state = await neo.getConfig('splitter-heavy-handle', [
                          'isVdomUpdating', 'needsVdomUpdate'
                      ]),
                      mainState = await page.evaluate(() => Neo.main.addon.DragDrop.dragResize.state);

                return mainState == null && !state.isVdomUpdating && !state.needsVdomUpdate
            }, {
                message  : `cycle ${index + 1}: gesture and VDOM queues settle`,
                intervals: [30, 50, 100],
                timeout  : 5000
            }).toBe(true);

            await assertGridAligned(page, 'splitter-heavy-grid', `cycle ${index + 1} Grid`);
            await assertGridAligned(page, 'splitter-heavy-tree', `cycle ${index + 1} TreeGrid`)
        }

        const settled = await readGeometry(page);

        expect(Math.abs(settled['splitter-heavy-handle'].x - initial['splitter-heavy-handle'].x),
            'opposite resize pairs return to the initial boundary').toBeLessThanOrEqual(3);
        expect(Math.abs(settled['splitter-heavy-grid'].width - initial['splitter-heavy-grid'].width))
            .toBeLessThanOrEqual(3);
        expect(Math.abs(settled['splitter-heavy-tree'].width - initial['splitter-heavy-tree'].width))
            .toBeLessThanOrEqual(3)
    })

    test('sizes the outer Flexbox wrapper of a component with a distinct logical root', async ({neo, page}) => {
        const result = await neo.createComponent({
            importPath: '../container/Base.mjs',
            ntype     : 'container',
            parentId  : 'component-test-viewport',
            height    : 120,
            id        : 'splitter-wrapped-root',
            layout    : {ntype: 'hbox', align: 'stretch'},
            width     : 600,
            items     : [{
                id          : 'splitter-wrapped-previous',
                ntype       : 'component',
                wrapperStyle: {flex: '1 1 0%', minWidth: 0}
            }, {
                id        : 'splitter-wrapped-handle',
                liveResize: true,
                ntype     : 'splitter'
            }, {
                className   : 'Neo.button.Split',
                id          : 'splitter-wrapped-target',
                text        : 'Wrapped target',
                wrapperStyle: {flex: '1 1 0%', minWidth: 0}
            }]
        });

        expect(result.success, JSON.stringify(result.error || result)).toBe(true);
        rootId = result.id;

        const readWrappedGeometry = () => page.evaluate(() => {
            const outer = document.getElementById('splitter-wrapped-target__wrapper'),
                  inner = document.getElementById('splitter-wrapped-target');

            return {
                innerInlineWidth: inner.style.width,
                innerWidth      : inner.getBoundingClientRect().width,
                outerInlineWidth: outer.style.width,
                outerWidth      : outer.getBoundingClientRect().width
            }
        });

        await expect(page.locator('#splitter-wrapped-target__wrapper')).toBeVisible();
        await expect(page.locator('#splitter-wrapped-target')).toBeVisible();

        const before = await readWrappedGeometry();

        await drag(page, 'splitter-wrapped-handle', 70);

        await expect.poll(async () => {
            const geometry = await readWrappedGeometry(),
                  style    = await neo.getConfig('splitter-wrapped-target', 'wrapperStyle');

            return Math.abs(parseFloat(geometry.outerInlineWidth) - parseFloat(style.width))
        }, {
            message  : 'the terminal wrapperStyle update reaches the outer layout node',
            intervals: [30, 50, 100],
            timeout  : 5000
        }).toBeLessThanOrEqual(1);

        const after        = await readWrappedGeometry(),
              wrapperStyle = await neo.getConfig('splitter-wrapped-target', 'wrapperStyle');

        expect(before.outerInlineWidth, 'Flexbox owns the initial wrapper size').toBe('');
        expect(after.outerWidth, 'the selected outer layout item shrinks').toBeLessThan(before.outerWidth - 50);
        expect(after.outerInlineWidth).toBe(wrapperStyle.width);
        expect(wrapperStyle.flex).toBe('none');
        expect(after.innerInlineWidth, 'the inner logical root does not receive layout sizing').toBe('');
        expect(after.innerWidth).toBeLessThanOrEqual(after.outerWidth)
    })
});
