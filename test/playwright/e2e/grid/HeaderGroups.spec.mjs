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
    const leaves = new Map([...document.querySelectorAll('.neo-grid-header-button')]
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
        const febId = await page.locator('.neo-grid-header-toolbar .neo-grid-header-button[aria-colindex="3"]').first().getAttribute('id'),
              feb   = page.locator(`[id="${febId}"]`),
              box   = await feb.boundingBox(),
              x   = box.x + box.width - 3,
              y   = box.y + box.height / 2,
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

    const centreOrder = page => page.evaluate(() =>
        [...document.querySelectorAll('.neo-grid-header-toolbar')[1].querySelectorAll('.neo-grid-header-button')]
            .map(button => button.textContent.trim()).slice(0, 6));

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
    })
});
