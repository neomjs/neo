import {expect, test} from '../../fixtures.mjs';

/**
 * @summary A real pointer resizes a table column from its header's right edge: the body follows, a left-docked
 * neighbour moves with it, the gesture never sorts, and header drag-reorder still works afterwards.
 *
 * The unit spec stubs the drag zone, so it cannot see the main-thread sensor arming on `.neo-resizable`, the native
 * table layout honouring the `<th>` width, or the docked `left` offsets in the rendered body.
 */

const widthOf = async locator => (await locator.boundingBox()).width;

// A shown handle sits inside the header button and changes the header's accessible name, so pin headers by id
async function pinHeader(page, name) {
    const header = page.getByRole('columnheader', {name, exact: true});

    await expect(header).toBeVisible();

    return page.locator(`[id="${await header.evaluate(th => th.id)}"]`)
}

async function resizeBy(page, header, dx) {
    await header.scrollIntoViewIfNeeded();

    const box    = await header.boundingBox(),
          x      = box.x + box.width - 3,
          y      = box.y + box.height / 2,
          handle = header.locator('.neo-resizable-right');

    // The plugin loads lazily and adds its handle on mousemove near the edge: hover until it is there
    await expect(async () => {
        await page.mouse.move(x - 30, y);
        await page.mouse.move(x, y, {steps: 4});
        await expect(handle).toHaveCount(1, {timeout: 250})
    }).toPass();

    const hb = await handle.boundingBox(),
          hx = hb.x + hb.width / 2,
          hy = hb.y + hb.height / 2;

    // A pointer red only means something when the pointer is on the handle
    expect(await page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest('.neo-resizable-right'), [hx, hy])).toBe(true);

    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx + dx, hy, {steps: 16});
    await page.mouse.up();

    return box.width
}

test.describe('table header resize', () => {
    test('a header drag widens and narrows its column, the body follows, and nothing sorts', async ({page}) => {
        await page.goto('/examples/table/container/index.html');

        const header = await pinHeader(page, 'Firstname'),
              column = await header.evaluate(th => th.cellIndex),
              cell   = page.locator(`tbody tr:first-child td:nth-child(${column + 1})`),
              gap    = async () => Math.abs(await widthOf(cell) - await widthOf(header));

        const before = await resizeBy(page, header, 80);

        await expect.poll(() => widthOf(header)).toBeGreaterThan(before + 60);
        await expect.poll(gap).toBeLessThan(2);

        const widened = await widthOf(header);

        await resizeBy(page, header, -120);

        // Narrower than the 200px default min-width, which the body cells no longer carry
        await expect.poll(() => widthOf(header)).toBeLessThan(widened - 100);
        await expect.poll(gap).toBeLessThan(2);

        await expect(header).not.toHaveAttribute('aria-sort');
        await expect(page.locator('tbody tr:first-child td').first()).toHaveText('Tobias')
    });

    test('header drag-reorder still works after a resize', async ({page}) => {
        await page.goto('/examples/table/container/index.html');

        const first = await pinHeader(page, 'Firstname'),
              order = () => page.locator('thead th').allTextContents();

        await resizeBy(page, first, 60);

        const source = await pinHeader(page, 'Lastname'),
              sb     = await source.boundingBox(),
              fb     = await first.boundingBox(),
              y      = sb.y + sb.height / 2;

        await page.mouse.move(sb.x + sb.width / 2, y);
        await page.mouse.down();
        await page.mouse.move(sb.x + sb.width / 2 - 20, y, {steps: 4});
        await page.mouse.move(fb.x + 10, y, {steps: 12});
        await page.mouse.up();

        await expect.poll(async () => (await order())[0].trim()).toBe('Lastname')
    });

    test('resizing a left-docked column moves the next docked column in header and body', async ({page}) => {
        const row = country => ({
            active   : 1, cases: 10, casesPerOneMillion: 1, country, countryInfo: {}, critical: 1, deaths: 1,
            recovered: 1, tests: 1, testsPerOneMillion: 1, todayCases: 1, todayDeaths: 1
        });

        // The example fetches live data; three local rows keep the run offline and deterministic
        await page.context().route('https://disease.sh/**', route => route.fulfill({json: ['A', 'B', 'C'].map(row)}));
        await page.goto('/examples/table/covid/index.html');

        const index   = await pinHeader(page, '#'),
              country = await pinHeader(page, 'Country'),
              cell    = page.locator('tbody tr:first-child td:nth-child(2)');

        await expect(page.locator('tbody tr')).toHaveCount(3);

        const before = await resizeBy(page, index, 80);

        await expect.poll(() => widthOf(index)).toBeGreaterThan(before + 60);

        // The docked neighbour starts where the resized column ends, in the header and in the body.
        // Read both boxes inside the poll: the last drag samples can still be landing.
        const offset = async neighbour => {
            const [i, n] = await Promise.all([index.boundingBox(), neighbour.boundingBox()]);
            return Math.abs(n.x - (i.x + i.width))
        };

        await expect.poll(() => offset(country)).toBeLessThan(2);
        await expect.poll(() => offset(cell)).toBeLessThan(2)
    })
});
