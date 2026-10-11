import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Proves Card-layout panes stay constrained when Grid columns become wider than their host.
 *
 * A Grid owns its horizontal scrollbar and correctly derives the scroll range from its rendered
 * viewport and total center-column width. The missing contract lived one level above it: Flexbox's
 * automatic minimum size let a Card child grow to its column content, so the Grid observed a wide
 * viewport and had nothing to scroll. These browser tests keep the real Card, Grid, TreeStore,
 * resize gesture, and scrollbar synchronization in the loop.
 *
 * @see https://github.com/neomjs/neo/issues/17816
 */

const HOST_HEIGHT = 360,
      HOST_WIDTH  = 520;

let rootId;

test.describe('Neo.layout.Card — Grid overflow containment', () => {
    test.beforeEach(async ({neo, page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        await neo.loadModule('../tab/Container.mjs');
        await neo.loadModule('../grid/Container.mjs');
        await neo.loadModule('../data/TreeStore.mjs');
        await neo.loadModule('../../examples/grid/tree/MainStore.mjs')
    });

    test.afterEach(async ({neo}) => {
        if (rootId) {
            await neo.destroyComponent(rootId);
            rootId = null
        }
    });

    /** Creates the real Tab -> BodyContainer -> Card hierarchy which owns the failing boundary. */
    const createTab = async (neo, id, bodyContainer) => {
        const result = await neo.createComponent({
            importPath: '../tab/Container.mjs',
            ntype     : 'tab-container',
            parentId  : 'component-test-viewport',
            bodyContainer,
            height    : HOST_HEIGHT,
            id,
            width     : HOST_WIDTH
        });

        expect(result.success, JSON.stringify(result.error || result)).toBe(true);
        rootId = result.id;

        return result.id
    };

    /**
     * Creates either a flat Grid or a TreeGrid with fixed columns whose initial total is below the
     * Card host. The later drag is therefore the operation which creates overflow; a fixture that
     * started wide could not prove the resize transition.
     */
    const createGrid = async (neo, tabId, {tree}) => {
        const id      = tree ? 'card-contained-tree-grid' : 'card-contained-grid',
              columns = tree ? [{
                  dataField: 'name',
                  text     : 'Name',
                  type     : 'tree',
                  width    : 180
              }, {
                  dataField: 'type',
                  text     : 'Type',
                  width    : 120
              }, {
                  dataField: 'size',
                  text     : 'Size',
                  width    : 120
              }] : [{
                  dataField: 'alpha',
                  text     : 'Alpha',
                  width    : 140
              }, {
                  dataField: 'beta',
                  text     : 'Beta',
                  width    : 140
              }, {
                  dataField: 'gamma',
                  text     : 'Gamma',
                  width    : 140
              }],
              store   = tree ? {
                  className: 'Neo.examples.grid.tree.MainStore'
              } : {
                  data: [
                      {id: 1, alpha: 'A1', beta: 'B1', gamma: 'C1'},
                      {id: 2, alpha: 'A2', beta: 'B2', gamma: 'C2'}
                  ]
              };

        const result = await neo.createComponent({
            importPath: '../grid/Container.mjs',
            ntype     : 'grid-container',
            parentId  : tabId,
            columns,
            header    : {text: tree ? 'TreeGrid' : 'Grid'},
            id,
            store
        });

        expect(result.success, JSON.stringify(result.error || result)).toBe(true);

        return id
    };

    /** The browser-owned geometry surfaces which distinguish containment from scrollbar logic. */
    const readGeometry = (page, gridId) => page.evaluate(id => {
        const grid      = document.getElementById(id),
              cardBody  = grid.closest('.neo-tab-body-container'),
              scrollbar = grid.querySelector('.neo-grid-horizontal-scrollbar'),
              toolbar   = grid.querySelector('.neo-grid-header-toolbar'),
              gridRect  = grid.getBoundingClientRect(),
              bodyRect  = cardBody.getBoundingClientRect();

        return {
            bodyWidth   : Math.round(bodyRect.width),
            gridWidth   : Math.round(gridRect.width),
            minWidth    : getComputedStyle(grid).minWidth,
            scrollLeft  : scrollbar.scrollLeft,
            scrollRange : scrollbar.scrollWidth - scrollbar.clientWidth,
            toolbarRange: toolbar.scrollWidth - toolbar.clientWidth
        }
    }, gridId);

    /** One real header-edge gesture; the resize handle only exists after hover. */
    const widenColumn = async (page, gridId, headerText, delta=240) => {
        const header = page.locator(`#${gridId} .neo-grid-header-button`, {hasText: headerText}).first();

        await expect(header).toBeVisible({timeout: 15000});

        const before = await header.boundingBox(),
              y      = before.y + before.height / 2,
              x      = before.x + before.width - 3;

        // Enter through the button before approaching its edge. Jumping straight from an unrelated
        // page coordinate to the final pixel can skip the interior mousemove which materializes
        // Neo.plugin.Resizable's transient handle.
        await page.mouse.move(before.x + before.width / 2, y);
        await page.mouse.move(x, y, {steps: 10});
        await expect(header.locator('.neo-resizable-right')).toBeAttached({timeout: 5000});
        await page.mouse.down();
        await page.mouse.move(x + delta, y, {steps: 40});
        await page.mouse.up();
        await page.waitForTimeout(900);

        const after = await header.boundingBox();

        expect(after.width, `resize must engage (before=${before.width}, after=${after.width})`)
            .toBeGreaterThan(before.width + delta / 2);

        return {before, after}
    };

    /** Scrolls the dedicated scrollbar to max and proves its synchronized header reaches the end. */
    const reachLastColumn = (page, gridId) => page.evaluate(async id => {
        const grid      = document.getElementById(id),
              scrollbar = grid.querySelector('.neo-grid-horizontal-scrollbar'),
              toolbar   = grid.querySelector('.neo-grid-header-toolbar');

        scrollbar.scrollLeft = scrollbar.scrollWidth;
        await new Promise(resolve => setTimeout(resolve, 500));

        const lastButton = toolbar.lastElementChild;

        return {
            lastFlush  : Math.abs(lastButton.getBoundingClientRect().right - toolbar.getBoundingClientRect().right) < 2,
            scrollLeft : scrollbar.scrollLeft,
            scrollRange: scrollbar.scrollWidth - scrollbar.clientWidth,
            toolbarLeft: toolbar.scrollLeft
        }
    }, gridId);

    for (const variant of [{name: 'Grid', tree: false}, {name: 'TreeGrid', tree: true}]) {
        test(`${variant.name} gains horizontal scroll after a column outgrows its Card`, async ({neo, page}) => {
            const tabId  = await createTab(neo, `card-${variant.name.toLowerCase()}-host`),
                  gridId = await createGrid(neo, tabId, variant);

            await expect(page.locator(`#${gridId} .neo-grid-body [role="row"]`).first())
                .toBeVisible({timeout: 15000});

            if (variant.tree) {
                await expect(page.locator(`#${gridId} .neo-tree-toggle`).first()).toBeVisible()
            }

            const before = await readGeometry(page, gridId);

            expect(before.scrollRange, 'fixed columns begin narrower than the viewport').toBe(0);
            expect(Math.abs(before.gridWidth - before.bodyWidth), 'the initial Grid fits its Card host')
                .toBeLessThanOrEqual(2);

            await widenColumn(page, gridId, variant.tree ? 'Name' : 'Alpha');

            const after = await readGeometry(page, gridId);

            expect(after.minWidth, 'Card owns the automatic min-content release').toBe('0px');
            expect(Math.abs(after.gridWidth - after.bodyWidth),
                `the ${variant.name} pane stays constrained after its columns become wider`)
                .toBeLessThanOrEqual(2);
            expect(after.scrollRange, 'the dedicated scrollbar gains a real horizontal range')
                .toBeGreaterThan(100);
            expect(after.toolbarRange, 'the center toolbar owns the same overflow class')
                .toBeGreaterThan(100);

            const reached = await reachLastColumn(page, gridId);

            expect(reached.scrollLeft, 'scrolling reaches a non-zero offset').toBe(reached.scrollRange);
            expect(reached.toolbarLeft, 'the center toolbar synchronizes to the scrollbar').toBe(reached.scrollRange);
            expect(reached.lastFlush, 'the final column is reachable at max scroll').toBe(true)
        })
    }

    test('the transition wrapper releases its card children on both axes', async ({neo, page}) => {
        const tabId = await createTab(neo, 'card-transition-host', {
            layout: {ntype: 'card', slideDirection: 'horizontal'}
        });

        // The bodyContainer override owns only the layout. Add the cards to the Tab itself so its
        // header/card bookkeeping remains the production path.
        for (const [index, text] of ['First', 'Second'].entries()) {
            const result = await neo.createComponent({
                importPath: '../component/Base.mjs',
                ntype     : 'component',
                parentId  : tabId,
                header    : {text},
                html      : `<div style="height:700px;width:700px">${text}</div>`,
                id        : `transition-card-${index}`
            });

            expect(result.success, JSON.stringify(result.error || result)).toBe(true)
        }

        await expect(page.locator('#transition-card-0')).toBeVisible();

        await page.evaluate(id => {
            void Neo.worker.App.setConfigs({id, activeIndex: 1})
        }, tabId);

        await page.waitForSelector(`#${tabId} .neo-animation-wrapper`, {state: 'attached'});

        const minimums = await page.locator(`#${tabId} .neo-animation-wrapper > *`).evaluateAll(cards =>
            cards.map(card => ({height: getComputedStyle(card).minHeight, width: getComputedStyle(card).minWidth}))
        );

        expect(minimums.length, 'a live transition owns the outgoing and incoming cards').toBe(2);
        expect(minimums).toEqual([
            {height: '0px', width: '0px'},
            {height: '0px', width: '0px'}
        ])
    });

    test('an explicit component minimum remains authoritative', async ({neo, page}) => {
        const tabId  = await createTab(neo, 'card-explicit-minimum-host'),
              result = await neo.createComponent({
                  importPath: '../component/Base.mjs',
                  ntype     : 'component',
                  parentId  : tabId,
                  header    : {text: 'Explicit minimum'},
                  id        : 'card-explicit-minimum',
                  minHeight : 420,
                  minWidth  : 640
              });

        expect(result.success, JSON.stringify(result.error || result)).toBe(true);
        await expect(page.locator('#card-explicit-minimum')).toBeVisible();

        const measured = await page.locator('#card-explicit-minimum').evaluate(element => ({
            height   : Math.round(element.getBoundingClientRect().height),
            minHeight: getComputedStyle(element).minHeight,
            minWidth : getComputedStyle(element).minWidth,
            width    : Math.round(element.getBoundingClientRect().width)
        }));

        expect(measured.minWidth).toBe('640px');
        expect(measured.width).toBeGreaterThanOrEqual(640);
        expect(measured.minHeight).toBe('420px');
        expect(measured.height).toBeGreaterThanOrEqual(420)
    })
});
