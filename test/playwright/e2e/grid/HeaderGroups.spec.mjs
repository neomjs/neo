import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/grid/headerGroups` in a real browser: every group cell spans exactly its leaf headers, after a
 * column resize, a reorder inside a group and during horizontal scroll; a header drag stays inside its group; and the
 * header reads as two ARIA rows.
 *
 * Unit specs pin the projected vdom; only a browser can show the subgrid placing each region's part over its toolbar
 * and the scroll sync moving the centre part in the same frame as the leaf headers.
 */

/**
 * Every group cell against its leaves, matched by the grid-wide column index: a cell spans `aria-colspan` leaves
 * from its own `aria-colindex`
 * @param {Object} page
 * @returns {Promise<Object[]>} `{text, left, right, leafLeft, leafRight}` per group cell
 */
const groupEdges = page => page.evaluate(() => {
    // A live drag clones its button into a proxy, aria-colindex included: only the toolbar's own buttons count
    const leaves = new Map([...document.querySelectorAll('.neo-grid-header-button')]
        .filter(button => !button.closest('.neo-dragproxy'))
        .map(button => [Number(button.getAttribute('aria-colindex')), button.getBoundingClientRect()]));

    return [...document.querySelectorAll('.neo-grid-header-group-cell')].map(cell => {
        const first = Number(cell.getAttribute('aria-colindex')),
              last  = first + Number(cell.getAttribute('aria-colspan')) - 1,
              rect  = cell.getBoundingClientRect();

        return {
            text     : cell.textContent,
            left     : Math.round(rect.left),
            right    : Math.round(rect.right),
            leafLeft : Math.round(leaves.get(first).left),
            leafRight: Math.round(leaves.get(last).right)
        }
    })
});

/**
 * Every centre header against the first body row: the cell of its column (`aria-colindex`) sits under it, visible
 * @param {Object} page
 * @returns {Promise<Boolean>}
 */
const cellsFollowHeaders = page => page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.neo-grid-header-toolbar')[1].querySelectorAll('.neo-grid-header-button')],
          row     = document.querySelectorAll('.neo-grid-body')[1]?.querySelector('.neo-grid-row');

    return buttons.length > 0 && buttons.every(button => {
        const cell = row?.querySelector(`[aria-colindex="${button.getAttribute('aria-colindex')}"]`);

        return !!cell && getComputedStyle(cell).visibility === 'visible' &&
            Math.abs(cell.getBoundingClientRect().left - button.getBoundingClientRect().left) < 2
    })
});

/**
 * @param {Object[]} edges
 */
const expectAligned = edges => {
    expect(edges.length).toBe(5);

    edges.forEach(({text, left, right, leafLeft, leafRight}) => {
        expect(Math.abs(left  - leafLeft),  `${text} left`).toBeLessThan(2);
        expect(Math.abs(right - leafRight), `${text} right`).toBeLessThan(2)
    })
};

test.describe('examples/grid/headerGroups', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/examples/grid/headerGroups/index.html');
        await expect(page.locator('.neo-grid-header-group-cell')).toHaveCount(5);
        // The cells take their geometry once the toolbars have measured their columns
        await expect.poll(async () => (await groupEdges(page))[0].right - (await groupEdges(page))[0].left).toBeGreaterThan(400)
    });

    test('each group cell spans exactly its leaf headers, and the header reads as two rows', async ({page}) => {
        expectAligned(await groupEdges(page));

        // Polled: the body rows can render after the header
        await expect.poll(() => page.evaluate(() => {
            const groupRow = document.querySelector('.neo-grid-header-group-row');

            return {
                groupRow : [groupRow?.getAttribute('role'), groupRow?.getAttribute('aria-rowindex')],
                leafRow  : document.querySelector('.neo-grid-header-toolbar[role="row"]')?.getAttribute('aria-rowindex'),
                firstBody: document.querySelector('.neo-grid-row[aria-rowindex]')?.getAttribute('aria-rowindex'),
                rowcount : document.querySelector('[aria-rowcount]')?.getAttribute('aria-rowcount')
            }
        })).toEqual({groupRow: ['row', '1'], leafRow: '2', firstBody: '3', rowcount: '22'})
    });

    test('a column resize moves the group edges with it', async ({page}) => {
        // Pinned by id: a drag proxy clones the button, aria-colindex included
        const febId  = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button[aria-colindex="3"]').first().getAttribute('id'),
              feb    = page.locator(`[id="${febId}"]`),
              box    = await feb.boundingBox(),
              x      = box.x + box.width - 3,
              y      = box.y + box.height / 2,
              handle = feb.locator('.neo-resizable-right');

        await expect(async () => {
            await page.mouse.move(x - 30, y);
            await page.mouse.move(x, y, {steps: 4});
            await expect(handle).toHaveCount(1, {timeout: 250})
        }).toPass();

        const hb = await handle.boundingBox();

        await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
        await page.mouse.down();
        await page.mouse.move(hb.x + hb.width / 2 + 80, hb.y + hb.height / 2, {steps: 12});
        await page.mouse.up();

        await expect.poll(async () => (await feb.boundingBox()).width).toBeGreaterThan(box.width + 60);
        await expect.poll(async () => {
            const edges = await groupEdges(page);
            return edges.every(({left, right, leafLeft, leafRight}) => Math.abs(left - leafLeft) < 2 && Math.abs(right - leafRight) < 2)
        }).toBe(true)
    });

    /**
     * Reveals a header's right resize handle and presses it
     * @param {Object} page
     * @param {Object} button A header button locator, pinned by id
     * @returns {Promise<Object>} `{x, y}` of the press
     */
    const pressResizeHandle = async (page, button) => {
        const box    = await button.boundingBox(),
              x      = box.x + box.width - 3,
              y      = box.y + box.height / 2,
              handle = button.locator('.neo-resizable-right');

        await expect(async () => {
            await page.mouse.move(x - 30, y);
            await page.mouse.move(x, y, {steps: 4});
            await expect(handle).toHaveCount(1, {timeout: 250})
        }).toPass();

        const hb = await handle.boundingBox(),
              at = {x: hb.x + hb.width / 2, y: hb.y + hb.height / 2};

        await page.mouse.move(at.x, at.y);
        await page.mouse.down();

        return at
    };

    const aligned = edges => edges.every(({left, right, leafLeft, leafRight}) =>
        Math.abs(left - leafLeft) < 2 && Math.abs(right - leafRight) < 2);

    test('a resized flex leaf takes the dragged width, and its group cell follows', async ({page}) => {
        const decId = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: 'Dec'}).first().getAttribute('id'),
              dec   = page.locator(`[id="${decId}"]`);

        // Wide enough that December flexes well past its minWidth
        await page.setViewportSize({width: 2600, height: 800});
        await expect.poll(async () => (await dec.boundingBox()).width).toBeGreaterThan(300);

        const before = (await dec.boundingBox()).width,
              at     = await pressResizeHandle(page, dec);

        await page.mouse.move(at.x - 150, at.y, {steps: 12});
        await page.mouse.up();

        await expect.poll(async () => (await dec.boundingBox()).width).toBeLessThan(before - 100);
        await expect.poll(async () => aligned(await groupEdges(page))).toBe(true)
    });

    test('the group cells follow a column resize while the drag is still live', async ({page}) => {
        const febId = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button[aria-colindex="3"]').first().getAttribute('id'),
              feb   = page.locator(`[id="${febId}"]`),
              at    = await pressResizeHandle(page, feb);

        await page.mouse.move(at.x + 80, at.y, {steps: 12});

        // Still pressed: the leaf has widened, and every group cell must already sit over its leaves
        await expect.poll(async () => aligned(await groupEdges(page))).toBe(true);
        await page.mouse.up()
    });

    /**
     * Drags a centre header by its middle, the way a reorder starts, and drops it at `toX`
     * @param {Object} page
     * @param {String} text The header to drag
     * @param {Number} toX
     */
    const dragHeader = async (page, text, toX) => {
        const header = page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: text}).first(),
              box    = await header.boundingBox(),
              y      = box.y + box.height / 2;

        await page.mouse.move(box.x + box.width / 2, y);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + Math.sign(toX - box.x) * 20, y, {steps: 4});
        await page.mouse.move(toX, y, {steps: 16});
        await page.mouse.up()
    };

    const centreHeaders = page => page.evaluate(() =>
        [...document.querySelectorAll('.neo-grid-header-toolbar')[1].querySelectorAll('.neo-grid-header-button')]
            .map(button => button.textContent.trim()));

    const centreOrder = async page => (await centreHeaders(page)).slice(0, 6);

    /**
     * Drags a header onto the middle of another, with the cadence `ColumnCrossBodyDnD.spec.mjs` uses to carry a drag
     * across a region boundary
     * @param {Object} page
     * @param {String} text   The header to drag
     * @param {String} target The header to release it on
     */
    const dropOn = async (page, text, target) => {
        const from = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: text}).first().boundingBox(),
              to   = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: target}).first().boundingBox(),
              y    = from.y + from.height / 2;

        await page.mouse.move(from.x + from.width / 2, y);
        await page.mouse.down();
        await page.mouse.move(to.x + to.width / 2, y, {steps: 60});
        await page.mouse.up()
    };

    /**
     * Widens the viewport until every centre header is on screen and draggable
     * @param {Object} page
     */
    const showAllHeaders = async page => {
        await page.setViewportSize({width: 2600, height: 800});
        await expect.poll(async () => (await groupEdges(page)).every(({left, right, leafLeft, leafRight}) =>
            Math.abs(left - leafLeft) < 2 && Math.abs(right - leafRight) < 2)).toBe(true)
    };

    test('a header reorders inside its group, and the group still spans its leaves', async ({page}) => {
        const jan = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: 'Jan'}).first().boundingBox();

        await dragHeader(page, 'Feb', jan.x + 10);

        await expect.poll(() => centreOrder(page)).toEqual(['Feb', 'Jan', 'Mar', 'Apr', 'May', 'Jun']);
        await expect.poll(async () => (await groupEdges(page)).every(({left, right, leafLeft, leafRight}) =>
            Math.abs(left - leafLeft) < 2 && Math.abs(right - leafRight) < 2)).toBe(true)
    });

    test('a header cannot leave its group, and no header can enter another', async ({page}) => {
        const may = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: 'May'}).first().boundingBox(),
              jan = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: 'Jan'}).first().boundingBox();

        // Mar dragged into Q2, then Apr dragged into Q1: both drops leave the order as it was
        await dragHeader(page, 'Mar', may.x + may.width / 2);
        await page.waitForTimeout(400);
        await dragHeader(page, 'Apr', jan.x + 10);
        await page.waitForTimeout(400);

        expect(await centreOrder(page)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'])
    });

    test('a grouped header over another group rests in its group, and its release leaves the group as it was', async ({page}) => {
        await showAllHeaders(page);

        // Pinned by id: a drag proxy clones the button, text included
        const janId = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: 'Jan'}).first().getAttribute('id'),
              jan   = page.locator(`[id="${janId}"]`),
              from  = await jan.boundingBox(),
              may   = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: 'May'}).first().boundingBox(),
              y     = from.y + from.height / 2;

        // Jan passes Feb and Mar on its way out of Q1, before it reaches May in Q2
        await page.mouse.move(from.x + from.width / 2, y);
        await page.mouse.down();
        await page.mouse.move(may.x + may.width / 2, y, {steps: 60});

        // Still pressed, the hover shows what the release will do: Jan back in its own slot
        await expect.poll(async () => Math.round((await jan.boundingBox()).x)).toBe(Math.round(from.x));

        await page.mouse.up();
        await page.waitForTimeout(400);

        expect(await centreOrder(page)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']);
        expectAligned(await groupEdges(page));

        // The body took the same swaps on the way out, and has to give them back with the headers
        await expect.poll(() => cellsFollowHeaders(page)).toBe(true)
    });

    test('Escape mid-drag puts the headers and the body cells back where they were', async ({page}) => {
        await showAllHeaders(page);

        // Pinned by id: a drag proxy clones the button, text included
        const febId = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: 'Feb'}).first().getAttribute('id'),
              feb   = page.locator(`[id="${febId}"]`),
              from  = await feb.boundingBox(),
              jan   = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: 'Jan'}).first().boundingBox(),
              y     = from.y + from.height / 2;

        await page.mouse.move(from.x + from.width / 2, y);
        await page.mouse.down();
        await page.mouse.move(from.x + from.width / 2 - 20, y, {steps: 4});
        await page.mouse.move(jan.x + 10, y, {steps: 16});

        // Feb has switched with Jan, and its cells with it, before the cancel
        await expect.poll(async () => Math.round((await feb.boundingBox()).x)).toBe(Math.round(jan.x));

        await page.keyboard.press('Escape');
        await page.mouse.up();

        await expect.poll(() => cellsFollowHeaders(page)).toBe(true);
        expect(await centreOrder(page)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'])
    });

    test('an ungrouped header passes a whole group, so the group stays in one piece', async ({page}) => {
        await showAllHeaders(page);

        // Id sits after Q4: dropped on Oct, it lands before the group instead of inside it
        await dropOn(page, 'Id', 'Oct');

        await expect.poll(async () => (await centreHeaders(page)).slice(-4)).toEqual(['Id', 'Oct', 'Nov', 'Dec']);
        await expect.poll(async () => (await groupEdges(page)).every(({left, right, leafLeft, leafRight}) =>
            Math.abs(left - leafLeft) < 2 && Math.abs(right - leafRight) < 2)).toBe(true);
        await expect.poll(() => cellsFollowHeaders(page)).toBe(true)
    });

    test('a grouped header released over another region stays in its group, while an ungrouped one crosses', async ({page}) => {
        const toolbarOf = text => page.evaluate(label => {
            const button = [...document.querySelectorAll('.neo-grid-header-toolbar .neo-grid-header-button')]
                .find(item => item.textContent.trim() === label);

            return [...document.querySelectorAll('.neo-grid-header-toolbar')].indexOf(button?.closest('.neo-grid-header-toolbar'))
        }, text);

        await showAllHeaders(page);

        // Mar passes Feb and Jan on its way out of the centre: released over the locked start region, its group keeps
        // it in the centre, where it was
        await dropOn(page, 'Mar', 'Region');
        await page.waitForTimeout(400);

        expect(await toolbarOf('Mar')).toBe(await toolbarOf('Feb'));
        expect(await toolbarOf('Mar')).not.toBe(await toolbarOf('Region'));
        expect(await centreOrder(page)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']);
        expectAligned(await groupEdges(page));
        await expect.poll(() => cellsFollowHeaders(page)).toBe(true);

        // the control: the ungrouped Id header released over the same region moves into it
        await dropOn(page, 'Id', 'Region');

        await expect.poll(async () => await toolbarOf('Id') === await toolbarOf('Region')).toBe(true)
    });

    test('emptying the start region after a header drag keeps the moved header, and the groups stay over their leaves', async ({page}) => {
        const drop = async (text, target) => {
            const from = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: text}).first().boundingBox(),
                  to   = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: target}).first().boundingBox(),
                  y    = from.y + from.height / 2;

            await page.mouse.move(from.x + from.width / 2, y);
            await page.mouse.down();
            await page.mouse.move(to.x + to.width / 2, y, {steps: 60});
            await page.mouse.up()
        };

        const toolbars = () => page.evaluate(() => [...document.querySelectorAll('.neo-grid-header-toolbar')]
            .map(toolbar => [...toolbar.querySelectorAll('.neo-grid-header-button')].map(button => button.textContent.trim())));

        await page.setViewportSize({width: 2600, height: 800});
        await expect(async () => expectAligned(await groupEdges(page))).toPass();

        // A drop the start region refuses still updates the centre toolbar, as every header drag does. It settles
        // before the next drag starts, as the drops above do
        await drop('Jan', 'Region');
        await page.waitForTimeout(400);

        // Region is the start region's only column: moving it into the centre empties that region
        await drop('Region', 'May');

        await expect.poll(async () => (await toolbars()).map(buttons => buttons[0])).toEqual(['Region', 'Total']);
        await expect(async () => expectAligned(await groupEdges(page))).toPass()
    });

    test('a flex leaf re-lays out with the grid width, and its group cell follows its edges', async ({page}) => {
        const dec     = page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: 'Dec'}).first(),
              aligned = edges => edges.every(({left, right, leafLeft, leafRight}) => Math.abs(left - leafLeft) < 2 && Math.abs(right - leafRight) < 2);

        // Wide enough that the centre outgrows its months, so December takes the rest
        await page.setViewportSize({width: 2600, height: 800});
        await expect.poll(async () => (await dec.boundingBox()).width).toBeGreaterThan(300);
        await expect.poll(async () => aligned(await groupEdges(page))).toBe(true);

        const wide = (await dec.boundingBox()).width;

        await page.setViewportSize({width: 2300, height: 800});
        await expect.poll(async () => (await dec.boundingBox()).width).toBeLessThan(wide - 200);
        await expect.poll(async () => aligned(await groupEdges(page))).toBe(true)
    });

    test('the centre group cells stay over their leaves while the grid scrolls', async ({page}) => {
        const scrollTo = value => page.evaluate(left => {
            const scroller = document.querySelector('.neo-grid-horizontal-scrollbar');
            scroller.scrollLeft = left;
            scroller.dispatchEvent(new Event('scroll'))
        }, value);

        const aprLeft = (await groupEdges(page)).find(edge => edge.text === 'Q2').leafLeft;

        for (const value of [300, 650]) {
            // First the leaves land on the new position, then every group cell must sit over its leaves. The scroll is
            // re-applied until it lands: a scrollbar still sizing its track clamps an early value.
            await expect(async () => {
                await scrollTo(value);
                expect((await groupEdges(page)).find(edge => edge.text === 'Q2').leafLeft).toBe(aprLeft - value)
            }).toPass();
            await expect.poll(async () => (await groupEdges(page)).every(({left, right, leafLeft, leafRight}) =>
                Math.abs(left - leafLeft) < 2 && Math.abs(right - leafRight) < 2)).toBe(true)
        }
    });

    /**
     * Drags a group cell by its middle and releases it at `toX`
     * @param {Object} page
     * @param {String} text The group to drag
     * @param {Number} toX
     */
    const dragGroup = async (page, text, toX) => {
        const box = await page.locator('.neo-grid-header-group-row .neo-grid-header-group-cell', {hasText: text}).first().boundingBox(),
              y   = box.y + box.height / 2;

        await page.mouse.move(box.x + box.width / 2, y);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + Math.sign(toX - box.x) * 20, y, {steps: 4});
        await page.mouse.move(toX, y, {steps: 16});
        await page.mouse.up()
    };

    const groupBox = (page, text) =>
        page.locator('.neo-grid-header-group-row .neo-grid-header-group-cell', {hasText: text}).first().boundingBox();

    const groupOrder = async page => (await groupEdges(page)).sort((a, b) => a.left - b.left).map(({text}) => text);

    /**
     * After a group drop: no proxy is left, every group cell spans its leaves, and the body cells follow the headers
     * @param {Object} page
     */
    const expectRelaidOut = async page => {
        await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
        await expect.poll(async () => {
            const edges = await groupEdges(page);

            return edges.length === 5 && edges.every(({left, right, leafLeft, leafRight}) =>
                Math.abs(left - leafLeft) < 2 && Math.abs(right - leafRight) < 2)
        }).toBe(true);
        await expect.poll(() => cellsFollowHeaders(page)).toBe(true)
    };

    test('a group cell drags its whole group: Q3 dropped before Q2 moves Jul, Aug and Sep as one block (#20627)', async ({page}) => {
        await showAllHeaders(page);

        await dragGroup(page, 'Q3', (await groupBox(page, 'Q2')).x + 10);

        await expect.poll(() => groupOrder(page)).toEqual(['Q1', 'Q3', 'Q2', 'Q4', 'Year']);
        await expect.poll(() => centreHeaders(page)).toEqual(
            ['Jan', 'Feb', 'Mar', 'Jul', 'Aug', 'Sep', 'Apr', 'May', 'Jun', 'Oct', 'Nov', 'Dec', 'Id']
        );
        await expectRelaidOut(page)
    });

    test('a group never lands inside another group, and never leaves its region (#20627)', async ({page}) => {
        await showAllHeaders(page);

        // Released right of Q4's centre, Q3 takes the slot after the whole of Q4, not a slot among its months
        const q4 = await groupBox(page, 'Q4');

        await dragGroup(page, 'Q3', q4.x + q4.width / 2 + 20);

        await expect.poll(() => groupOrder(page)).toEqual(['Q1', 'Q2', 'Q4', 'Q3', 'Year']);
        await expect.poll(() => centreHeaders(page)).toEqual(
            ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Oct', 'Nov', 'Dec', 'Jul', 'Aug', 'Sep', 'Id']
        );
        await expectRelaidOut(page);

        // Released over the locked-start region, Q3 stays in the centre: it takes the centre's first slot
        const region = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: 'Region'}).first().boundingBox();

        await dragGroup(page, 'Q3', region.x + region.width / 2);

        await expect.poll(() => groupOrder(page)).toEqual(['Q3', 'Q1', 'Q2', 'Q4', 'Year']);
        await expect.poll(() => page.evaluate(() =>
            [...document.querySelectorAll('.neo-grid-header-toolbar')[0].querySelectorAll('.neo-grid-header-button')]
                .map(button => button.textContent.trim()))).toEqual(['Region']);
        await expectRelaidOut(page)
    })
});
