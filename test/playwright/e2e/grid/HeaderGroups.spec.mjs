import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/grid/headerGroups` in a real browser: every group cell spans exactly its leaf headers, after a
 * column resize, a reorder inside a group and during horizontal scroll; a header drag stays inside its group; a group
 * cell drags its whole group, scrolled or not; and the header reads as two ARIA rows.
 *
 * Unit specs pin the projected vdom; only a browser can show the subgrid placing each region's part over its toolbar
 * and the scroll sync moving the centre part in the same frame as the leaf headers.
 */

/**
 * Every group cell against its leaves, matched by the grid-wide column index: a cell spans `aria-colspan` leaves
 * from its own `aria-colindex`
 * @param {Object} page
 * @returns {Promise<Object[]>} `{index, text, left, right, leafLeft, leafRight}` per group cell, `index` its first
 * column's `aria-colindex`
 */
const groupEdges = page => page.evaluate(() => {
    // A live drag clones its button into a proxy, aria-colindex included: only the toolbar's own buttons count
    const leaves = new Map([...document.querySelectorAll('.neo-grid-header-button')]
        .filter(button => !button.closest('.neo-dragproxy'))
        .map(button => [Number(button.getAttribute('aria-colindex')), button.getBoundingClientRect()]));

    // A live group drag clones its group cell into the proxy: only the row's own cells count
    return [...document.querySelectorAll('.neo-grid-header-group-cell')].filter(cell => !cell.closest('.neo-dragproxy')).map(cell => {
        const first = Number(cell.getAttribute('aria-colindex')),
              last  = first + Number(cell.getAttribute('aria-colspan')) - 1,
              rect  = cell.getBoundingClientRect();

        return {
            index    : first,
            text     : cell.textContent,
            left     : Math.round(rect.left),
            right    : Math.round(rect.right),
            leafLeft : Math.round(leaves.get(first).left),
            leafRight: Math.round(leaves.get(last).right)
        }
    })
});

/**
 * Every centre header on screen against the first body row: the cell of its column (`aria-colindex`) sits under it,
 * visible. A column scrolled out of view renders no cells.
 * @param {Object} page
 * @returns {Promise<Boolean>}
 */
const cellsFollowHeaders = page => page.evaluate(() => {
    const toolbar = document.querySelectorAll('.neo-grid-header-toolbar')[1],
          view    = toolbar.getBoundingClientRect(),
          buttons = [...toolbar.querySelectorAll('.neo-grid-header-button')].filter(button => {
              const {left, right} = button.getBoundingClientRect();
              return right > view.left && left < view.right
          }),
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

    test('a grouped header carried over another group waits at its group\'s edge, and its release keeps that slot (#20626)', async ({page}) => {
        await showAllHeaders(page);

        // Pinned by id: a drag proxy clones the button, text included
        const janId = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: 'Jan'}).first().getAttribute('id'),
              jan   = page.locator(`[id="${janId}"]`),
              from  = await jan.boundingBox(),
              may   = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: 'May'}).first().boundingBox(),
              q1    = (await groupEdges(page)).find(edge => edge.text === 'Q1'),
              y     = from.y + from.height / 2;

        // Jan passes Feb and Mar on its way out of Q1, before it reaches May in Q2
        await page.mouse.move(from.x + from.width / 2, y);
        await page.mouse.down();
        await page.mouse.move(may.x + may.width / 2, y, {steps: 60});

        // Still pressed, the hover shows what the release will do: Jan in Q1's last slot, where its proxy rests
        await expect.poll(async () => {
            const box = await jan.boundingBox();
            return Math.abs(Math.round(box.x + box.width) - q1.right) < 2
        }).toBe(true);

        await page.mouse.up();
        await page.waitForTimeout(400);

        expect(await centreOrder(page)).toEqual(['Feb', 'Mar', 'Jan', 'Apr', 'May', 'Jun']);
        expectAligned(await groupEdges(page));

        // The body took the same swaps, and keeps them with the headers
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

    /**
     * Where the live proxy's header sits inside the proxy: a colour check alone passes a header shifted out of view
     * @param {Object} page
     * @returns {Promise<Object|null>} `{offset, text}`, or null while no proxy shows a header
     */
    const proxyHeader = page => page.evaluate(() => {
        const toolbar = document.querySelector('.neo-dragproxy .neo-grid-header-toolbar'),
              button  = toolbar?.querySelector('.neo-grid-header-button');

        return button && {
            offset: Math.round(button.getBoundingClientRect().left - toolbar.getBoundingClientRect().left),
            text  : button.textContent.trim()
        }
    });

    test('after a horizontal scroll, every drag\'s proxy shows its header inside the proxy (#20626)', async ({page}) => {
        await page.setViewportSize({width: 1991, height: 1000});

        // The moves that follow the threshold land while the drag start is still running, as a quick hand's do
        for (const text of ['Oct', 'Sep', 'Nov', 'Oct', 'Sep', 'Nov']) {
            await expect(async () => {
                await page.evaluate(() => {
                    const scroller = document.querySelector('.neo-grid-horizontal-scrollbar');
                    scroller.scrollLeft = 230;
                    scroller.dispatchEvent(new Event('scroll'))
                });
                expect(await page.evaluate(() => document.querySelectorAll('.neo-grid-header-toolbar')[1].scrollLeft)).toBe(230)
            }).toPass();

            const from = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: text}).first().boundingBox(),
                  y    = from.y + from.height / 2;

            await page.mouse.move(from.x + from.width / 2, y);
            await page.mouse.down();
            await page.mouse.move(from.x + from.width / 2 + 40, y, {steps: 20});

            await expect.poll(() => proxyHeader(page)).not.toBeNull();
            expect(await proxyHeader(page), `${text}'s proxy`).toEqual({offset: 0, text});

            await page.keyboard.press('Escape');
            await page.mouse.up();
            await expect(page.locator('.neo-dragproxy')).toHaveCount(0)
        }
    });

    test('a grouped header\'s proxy stops at its group\'s edge, wherever the pointer goes (#20626)', async ({page}) => {
        await showAllHeaders(page);

        const from       = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: 'Jan'}).first().boundingBox(),
              may        = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: 'May'}).first().boundingBox(),
              q1         = (await groupEdges(page)).find(edge => edge.text === 'Q1'),
              y          = from.y + from.height / 2,
              proxyEdges = () => page.evaluate(() => {
                  const rect = document.querySelector('.neo-dragproxy')?.getBoundingClientRect();
                  return rect && {left: Math.round(rect.left), right: Math.round(rect.right)}
              });

        await page.mouse.move(from.x + from.width / 2, y);
        await page.mouse.down();
        await page.mouse.move(may.x + may.width / 2, y, {steps: 60});

        // The pointer is over Q2's May; the proxy rests against Q1's right edge
        await expect.poll(async () => (await proxyEdges())?.right).toBe(q1.right);
        expect((await proxyEdges()).left).toBeGreaterThanOrEqual(q1.left);

        await page.mouse.up()
    });

    test('a group scrolled almost out of view keeps the proxy inside the group, past the toolbar\'s edge if it must (#20626)', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 720});

        // Scrolled by 400, Mar shows only a sliver at the centre toolbar's left edge: less of Q1 than its proxy is wide
        await expect(async () => {
            await page.evaluate(() => {
                const scroller = document.querySelector('.neo-grid-horizontal-scrollbar');
                scroller.scrollLeft = 400;
                scroller.dispatchEvent(new Event('scroll'))
            });
            expect(await page.evaluate(() => document.querySelectorAll('.neo-grid-header-toolbar')[1].scrollLeft)).toBe(400)
        }).toPass();

        const toolbar = await page.locator('.neo-grid-header-toolbar').nth(1).boundingBox(),
              mar     = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: 'Mar'}).first().boundingBox(),
              shown   = mar.x + mar.width - toolbar.x,
              y       = mar.y + mar.height / 2,
              edges   = () => page.evaluate(() => {
                  const proxy = document.querySelector('.neo-dragproxy')?.getBoundingClientRect(),
                        q1    = [...document.querySelectorAll('.neo-grid-header-group-cell')]
                            .find(cell => cell.textContent === 'Q1').getBoundingClientRect();

                  return proxy && {left: Math.round(proxy.left), q1Left: Math.round(q1.left), q1Right: Math.round(q1.right), right: Math.round(proxy.right)}
              });

        expect(shown, 'the toolbar shows less of Q1 than one header').toBeLessThan(mar.width);

        let nudge = 0;

        await page.mouse.move(toolbar.x + shown / 2, y);
        await page.mouse.down();
        await page.mouse.move(toolbar.x + 5, y, {steps: 10});

        // The main thread applies a bound on the next move: each try nudges the pointer by a pixel
        await expect(async () => {
            await page.mouse.move(toolbar.x + 4 + nudge++ % 2, y);

            const {left, q1Left, q1Right, right} = await edges();

            expect(right, 'the proxy stays out of Q2').toBeLessThanOrEqual(q1Right);
            expect(left).toBeGreaterThanOrEqual(q1Left)
        }).toPass({timeout: 5000});

        await page.keyboard.press('Escape');
        await page.mouse.up()
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
        // it in the centre, in Q1's first slot
        await dropOn(page, 'Mar', 'Region');
        await page.waitForTimeout(400);

        expect(await toolbarOf('Mar')).toBe(await toolbarOf('Feb'));
        expect(await toolbarOf('Mar')).not.toBe(await toolbarOf('Region'));
        expect(await centreOrder(page)).toEqual(['Mar', 'Jan', 'Feb', 'Apr', 'May', 'Jun']);
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

    /**
     * Scrolls the grid horizontally, as its scrollbar does
     * @param {Object} page
     * @param {Number} value
     */
    const scrollGrid = (page, value) => page.evaluate(left => {
        const scroller = document.querySelector('.neo-grid-horizontal-scrollbar');
        scroller.scrollLeft = left;
        scroller.dispatchEvent(new Event('scroll'))
    }, value);

    /**
     * Scrolls the grid and waits until the leaves land there. The scroll is re-applied until it lands: a scrollbar
     * still sizing its track clamps an early value.
     * @param {Object} page
     * @param {Number} value
     * @param {Number} aprLeft Apr's `left` at scroll 0
     */
    const scrollLeavesTo = (page, value, aprLeft) => expect(async () => {
        await scrollGrid(page, value);
        expect((await groupEdges(page)).find(edge => edge.text === 'Q2').leafLeft).toBe(aprLeft - value)
    }).toPass();

    test('the centre group cells stay over their leaves while the grid scrolls', async ({page}) => {
        const aprLeft = (await groupEdges(page)).find(edge => edge.text === 'Q2').leafLeft;

        for (const value of [300, 650]) {
            // First the leaves land on the new position, then every group cell must sit over its leaves
            await scrollLeavesTo(page, value, aprLeft);
            await expect.poll(async () => (await groupEdges(page)).every(({left, right, leafLeft, leafRight}) =>
                Math.abs(left - leafLeft) < 2 && Math.abs(right - leafRight) < 2)).toBe(true)
        }
    });

    test('a scrolled group row keeps its scroll when a column resize re-projects its cells (#20627)', async ({page}) => {
        await scrollLeavesTo(page, 300, (await groupEdges(page)).find(edge => edge.text === 'Q2').leafLeft);

        // Pinned by id: a drag proxy clones the button, aria-colindex included
        const aprId = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button[aria-colindex="5"]').first().getAttribute('id'),
              apr   = page.locator(`[id="${aprId}"]`),
              width = (await apr.boundingBox()).width,
              at    = await pressResizeHandle(page, apr);

        // Each resize sample re-projects the group cells. The centre part must keep the leaves' scroll position, not
        // snap back to its origin.
        await page.mouse.move(at.x + 80, at.y, {steps: 12});
        await page.mouse.up();

        await expect.poll(async () => (await apr.boundingBox()).width).toBeGreaterThan(width + 60);
        await expect.poll(async () => aligned(await groupEdges(page))).toBe(true)
    });

    const groupBox = (page, text) =>
        page.locator('.neo-grid-header-group-row .neo-grid-header-group-cell', {hasText: text}).first().boundingBox();

    /**
     * Presses a group cell in the middle of its visible part and carries it until its left edge reaches `edgeX`, still
     * pressed. A group moves by where its edge is, as a column does, so the target is an edge, not a pointer position.
     * @param {Object} page
     * @param {String} text  The group to drag
     * @param {Number} edgeX Where the group's left edge goes
     * @returns {Promise<Object>} `{box, part, pressX, toX}`: the cell's and its region part's rects, the press x and
     * the pointer's final x
     */
    const holdGroup = async (page, text, edgeX) => {
        const {box, part} = await page.evaluate(label => {
                  const cell = [...document.querySelectorAll('.neo-grid-header-group-row .neo-grid-header-group-cell')]
                          .find(item => item.textContent === label && !item.closest('.neo-dragproxy')),
                        rect = node => {const {x, y, width, height} = node.getBoundingClientRect(); return {x, y, width, height}};

                  return {box: rect(cell), part: rect(cell.closest('.neo-grid-header-group-part'))}
              }, text),
              pressX = (Math.max(box.x, part.x) + Math.min(box.x + box.width, part.x + part.width)) / 2,
              toX    = edgeX + pressX - box.x,
              y      = box.y + box.height / 2;

        await page.mouse.move(pressX, y);
        await page.mouse.down();
        await page.mouse.move(pressX + Math.sign(toX - pressX) * 20, y, {steps: 4});
        await page.mouse.move(toX, y, {steps: 16});

        return {box, part, pressX, toX}
    };

    /**
     * Drags a group cell until its left edge reaches `edgeX`, and releases it
     * @param {Object} page
     * @param {String} text  The group to drag
     * @param {Number} edgeX
     */
    const dragGroup = async (page, text, edgeX) => {
        await holdGroup(page, text, edgeX);
        await page.mouse.up()
    };

    /**
     * The live group proxy: it shows the group's cell painted on top, level with the row, and travels with the pointer
     * until the region's toolbar holds it, as `Neo.main.addon.DragDrop#onDragMove` clamps
     * @param {Object} page
     * @param {Object} hold What `holdGroup` returned
     * @param {String} text
     */
    const expectProxyFollows = (page, {box, part, pressX, toX}, text) => expect(async () => {
        const proxy = await page.evaluate(() => {
            const el   = document.querySelector('.neo-dragproxy'),
                  cell = el?.querySelector('.neo-grid-header-group-cell');

            if (!cell) {
                return null
            }

            // A drag turns off hit-testing for the whole page, so the proxy's own style is the visibility witness
            const {x, y, width} = el.getBoundingClientRect(),
                  style         = getComputedStyle(cell);

            return {
                x, y, width,
                painted: style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.backgroundImage !== 'none',
                text   : cell.textContent,
                visible: style.visibility === 'visible' && Number(getComputedStyle(el).opacity) > 0
            }
        });

        let left = box.x + toX - pressX;

        expect(proxy, 'proxy').not.toBeNull();

        if (left < part.x) {
            left = part.x
        } else if (left > part.x + part.width - proxy.width) {
            left = part.x + part.width - proxy.width
        }

        expect(proxy.text, 'proxy text').toBe(text);
        expect(proxy.painted, 'proxy background').toBe(true);
        expect(proxy.visible, 'proxy visible').toBe(true);
        expect(Math.abs(proxy.y - box.y), 'proxy top').toBeLessThan(2);
        expect(Math.abs(proxy.x - left),  'proxy left').toBeLessThan(2)
    }).toPass({timeout: 10000});

    // In column order: a scrolled centre cell can sit past the locked end on screen
    const groupOrder = async page => (await groupEdges(page)).sort((a, b) => a.index - b.index).map(({text}) => text);

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

    test('a group cell drags its whole group: Q2 slides aside live, the proxy carries Q3\'s columns, and the drop keeps that order (#20627, #20641)', async ({page}) => {
        // The grid's own header, never the proxy's clone
        const leftOf = text => page.evaluate(label => [...document.querySelectorAll('.neo-grid-header-toolbar .neo-grid-header-button')]
                  .find(button => button.textContent.trim() === label && !button.closest('.neo-dragproxy')).getBoundingClientRect().left, text),
              julValue = () => page.evaluate(() => {
                  const jul = [...document.querySelectorAll('.neo-grid-header-toolbar .neo-grid-header-button')].find(button => button.textContent.trim() === 'Jul');

                  return document.querySelectorAll('.neo-grid-body')[1].querySelector(`.neo-grid-row [aria-colindex="${jul.getAttribute('aria-colindex')}"]`).textContent
              });

        await showAllHeaders(page);

        const apr = await leftOf('Apr'),
              q2  = await groupBox(page, 'Q2'),
              q3  = await groupBox(page, 'Q3'),
              jul = await julValue();

        await holdGroup(page, 'Q3', q2.x + 10);

        // Still pressed: Q2 and its leaves have already slid right by Q3's width
        await expect.poll(async () => Math.abs(await leftOf('Apr') - apr - q3.width)).toBeLessThan(3);
        await expect.poll(async () => Math.abs((await groupEdges(page)).find(edge => edge.text === 'Q2').left - q2.x - q3.width)).toBeLessThan(3);

        // ... and the proxy shows Q3 over its months and their cells
        expect(await page.evaluate(() => {
            const proxy = document.querySelector('.neo-dragproxy');

            return {
                group  : proxy?.querySelector('.neo-grid-header-group-cell')?.textContent,
                headers: [...(proxy?.querySelectorAll('.neo-grid-header-button') || [])].map(button => button.textContent.trim()),
                row    : proxy?.querySelector('.neo-grid-row')?.textContent
            }
        })).toEqual({group: 'Q3', headers: ['Jul', 'Aug', 'Sep'], row: expect.stringContaining(jul)});

        await page.mouse.up();

        await expect.poll(() => groupOrder(page)).toEqual(['Q1', 'Q3', 'Q2', 'Q4', 'Year']);
        await expect.poll(() => centreHeaders(page)).toEqual(
            ['Jan', 'Feb', 'Mar', 'Jul', 'Aug', 'Sep', 'Apr', 'May', 'Jun', 'Oct', 'Nov', 'Dec', 'Id']
        );
        await expectRelaidOut(page)
    });

    test('a group never lands inside another group, and never leaves its region (#20627)', async ({page}) => {
        await showAllHeaders(page);

        // Carried most of Q4's width along, Q3 takes the slot after the whole of Q4, not a slot among its months. The
        // switch past a unit comes at 55% of its width, so 80% passes Q4 and stays short of the narrow Id after it.
        const q3 = await groupBox(page, 'Q3'),
              q4 = await groupBox(page, 'Q4');

        await dragGroup(page, 'Q3', q3.x + q4.width * 0.8);

        await expect.poll(() => groupOrder(page)).toEqual(['Q1', 'Q2', 'Q4', 'Q3', 'Year']);
        await expect.poll(() => centreHeaders(page)).toEqual(
            ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Oct', 'Nov', 'Dec', 'Jul', 'Aug', 'Sep', 'Id']
        );
        await expectRelaidOut(page);

        // Carried over the locked-start region, Q3 stays in the centre: it takes the centre's first slot
        const region = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button', {hasText: 'Region'}).first().boundingBox();

        await dragGroup(page, 'Q3', region.x + region.width / 2);

        await expect.poll(() => groupOrder(page)).toEqual(['Q3', 'Q1', 'Q2', 'Q4', 'Year']);
        await expect.poll(() => page.evaluate(() =>
            [...document.querySelectorAll('.neo-grid-header-toolbar')[0].querySelectorAll('.neo-grid-header-button')]
                .map(button => button.textContent.trim()))).toEqual(['Region']);
        await expectRelaidOut(page)
    });

    test('in a scrolled grid, each group drag shows its proxy under the pointer and drops in the slot there (#20627)', async ({page}) => {
        await scrollLeavesTo(page, 300, (await groupEdges(page)).find(edge => edge.text === 'Q2').leafLeft);

        // With its edge just inside Q2, Q3 lands before it: the drag maps into the scrolled content
        let hold = await holdGroup(page, 'Q3', (await groupBox(page, 'Q2')).x + 10);

        await expectProxyFollows(page, hold, 'Q3');
        await page.mouse.up();

        await expect.poll(() => groupOrder(page)).toEqual(['Q1', 'Q3', 'Q2', 'Q4', 'Year']);
        await expectRelaidOut(page);

        // A second gesture starts from the first one's drop: past Q2's edge, Q3 goes back behind Q2
        hold = await holdGroup(page, 'Q3', (await groupBox(page, 'Q2')).x + 60);

        await expectProxyFollows(page, hold, 'Q3');
        await page.mouse.up();

        await expect.poll(() => groupOrder(page)).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Year']);
        await expectRelaidOut(page)
    });

    /**
     * Holds the main thread's `DragDrop.setConfigs` handshake of the next group-cell gesture, so its start stays
     * pending until `window.releaseGroupHandshake()`
     * @param {Object} page
     */
    const holdGroupHandshake = page => page.evaluate(() => {
        const addon    = Neo.main.addon.DragDrop,
              original = addon.setConfigs;

        addon.setConfigs = function(data) {
            if (!data.dragElementRootId?.endsWith('__cell')) {
                return original.call(this, data)
            }

            addon.setConfigs = original;

            return new Promise(resolve => {
                window.groupHandshakeHeld    = true;
                window.releaseGroupHandshake = () => resolve(original.call(this, data))
            })
        }
    });

    // The zone keeps the moves that arrive while the start waits, so a release lands where the pointer let go
    for (const escape of [false, true]) {
        test(`${escape ? 'Escape' : 'a release'} during a group drag's pending start ${escape ? 'moves nothing' : 'drops the group'}, and leaves no proxy (#20627)`, async ({page}) => {
            await showAllHeaders(page);
            await holdGroupHandshake(page);

            await holdGroup(page, 'Q3', (await groupBox(page, 'Q2')).x + 10);
            await expect.poll(() => page.evaluate(() => window.groupHandshakeHeld === true)).toBe(true);

            escape && await page.keyboard.press('Escape');
            await page.mouse.up();

            // The held start resumes now: it lifts the toolbar into its drag state, and the gesture's end, queued
            // behind it, settles the toolbar again. Only then does the page take the next press.
            await page.evaluate(() => {
                const toolbar = document.querySelectorAll('.neo-grid-header-toolbar')[1];
                let   lifted  = false;

                window.groupDragSettled = false;

                new MutationObserver(() => {
                    lifted ||= toolbar.classList.contains('neo-is-dragging');
                    window.groupDragSettled = lifted && !toolbar.classList.contains('neo-is-dragging')
                }).observe(toolbar, {attributeFilter: ['class']});

                window.releaseGroupHandshake()
            });

            await expect.poll(() => page.evaluate(() => window.groupDragSettled)).toBe(true);
            await expect.poll(() => groupOrder(page)).toEqual(escape ? ['Q1', 'Q2', 'Q3', 'Q4', 'Year'] : ['Q1', 'Q3', 'Q2', 'Q4', 'Year']);

            // The next drag starts from the gesture's true result: a proxy, a dragging toolbar or a late move left
            // now is the first gesture's
            await dragGroup(page, 'Q4', (await groupBox(page, 'Q2')).x + 10);

            await expect.poll(() => groupOrder(page)).toEqual(escape ? ['Q1', 'Q4', 'Q2', 'Q3', 'Year'] : ['Q1', 'Q3', 'Q4', 'Q2', 'Year']);
            expect(await page.evaluate(() =>
                document.querySelectorAll('.neo-dragproxy, .neo-grid-header-toolbar.neo-is-dragging').length)).toBe(0);
            await expectRelaidOut(page)
        })
    }

    test('a group cell turns draggable only once its drag zone is ready, so no gesture starts without an owner for its Escape (#20627)', async ({page}) => {
        const held    = [],
              pattern = '**/src/draggable/DragZone.mjs',
              ready   = page.locator('.neo-grid-header-group-row .neo-grid-header-group-cell.neo-draggable');

        // A fresh boot whose drag zone module stays in flight
        await page.context().route(pattern, route => {held.push(route)});
        await page.goto('/examples/grid/headerGroups/index.html');
        await expect(page.locator('.neo-grid-header-group-cell')).toHaveCount(5);
        await showAllHeaders(page);
        await expect.poll(() => held.length).toBeGreaterThan(0);

        await expect(ready).toHaveCount(0);

        // Pressed, carried and cancelled while the module loads: nothing may move
        await holdGroup(page, 'Q3', (await groupBox(page, 'Q2')).x + 10);
        await page.keyboard.press('Escape');
        await page.mouse.up();

        await Promise.all(held.map(route => route.continue()));
        await page.context().unroute(pattern);
        await expect(ready).toHaveCount(5);

        // The next drag starts from the first gesture's true result
        await dragGroup(page, 'Q4', (await groupBox(page, 'Q2')).x + 10);

        await expect.poll(() => groupOrder(page)).toEqual(['Q1', 'Q4', 'Q2', 'Q3', 'Year']);
        expect(await page.evaluate(() =>
            document.querySelectorAll('.neo-dragproxy, .neo-grid-header-toolbar.neo-is-dragging').length)).toBe(0);
        await expectRelaidOut(page)
    });

    test('a drag proxy ends at the last row when the rows stop above the grid\'s bottom (#20652)', async ({page}) => {
        // Taller than the header plus all rows, so the grid's bottom lies below its last row
        await page.setViewportSize({width: 1600, height: 1000});
        await expect.poll(async () => (await groupEdges(page))[0].right - (await groupEdges(page))[0].left).toBeGreaterThan(400);

        const proxy  = page.locator('.neo-dragproxy'),
              bottom = () => page.evaluate(() => {
                  const outside = node => !node.closest('.neo-dragproxy'),
                        grid    = [...document.querySelectorAll('.neo-grid-container')].find(node => outside(node)),
                        rows    = [...document.querySelectorAll('.neo-grid-row')].filter(row => outside(row) && row.textContent.trim());

                  return {
                      grid : Math.round(grid.getBoundingClientRect().bottom),
                      last : Math.round(Math.max(...rows.map(row => row.getBoundingClientRect().bottom))),
                      proxy: Math.round(document.querySelector('.neo-dragproxy').getBoundingClientRect().bottom)
                  }
              });

        // A leaf: its proxy starts at the leaf header, below the group row
        const leaf = await page.locator('.neo-grid-header-button:not(.neo-dragproxy *)', {hasText: /^Feb$/}).first().boundingBox(),
              y    = leaf.y + leaf.height / 2;

        await page.mouse.move(leaf.x + leaf.width / 2, y);
        await page.mouse.down();
        await page.mouse.move(leaf.x + leaf.width / 2 + 20, y, {steps: 4});
        await page.mouse.move(leaf.x + leaf.width / 2 + 120, y, {steps: 12});
        await expect(proxy).toHaveCount(1);

        let {grid, last, proxy: end} = await bottom();
        // Must-contain: the rows do stop above the grid's bottom, else this arm proves nothing
        expect(last).toBeLessThan(grid - 40);
        expect(Math.abs(end - last), `leaf proxy ends at ${end}, last row at ${last}`).toBeLessThanOrEqual(2);
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(proxy).toHaveCount(0);

        // A group: its proxy starts at the group row
        await holdGroup(page, 'Q3', (await groupBox(page, 'Q2')).x + 10);
        await expect(proxy).toHaveCount(1);

        ({grid, last, proxy: end} = await bottom());
        expect(Math.abs(end - last), `group proxy ends at ${end}, last row at ${last}`).toBeLessThanOrEqual(2);
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(proxy).toHaveCount(0)
    })
});
