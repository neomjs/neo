import fs              from 'node:fs';
import path            from 'node:path';
import {expect, test}  from '../../fixtures.mjs';
import gridCellEditing from '../utils/gridCellEditing.mjs';

const EXAMPLE_URL          = '/examples/grid/orderReviewDesk/index.html',
      DIST_EXAMPLE_URL     = '/dist/esm/examples/grid/orderReviewDesk/index.html',
      DIST_PORTAL_GRID_URL = '/dist/esm/apps/portal/examples/grid',
      REPO_ROOT            = process.cwd(),
      GRID                 = '.neo-grid-container',
      {EDITOR, editingIn}  = gridCellEditing(GRID),
      cell                 = (page, field, recordId) =>
          page.locator(`${GRID} .neo-grid-row:visible .neo-grid-cell[data-field="${field}"][data-record-id="${recordId}"]`);

const recordIdOf = (page, orderId) => page.locator(`${GRID} .neo-grid-row:visible .neo-grid-cell[data-field="orderId"]`)
    .getByText(orderId, {exact: true}).getAttribute('data-record-id');

/**
 * @summary Whitebox browser E2E for `examples/grid/orderReviewDesk`: verifies `100,000` local orders,
 * viewport-bounded row pooling on deep jumps (`ORD-099985`), locked `orderId` + `Settlement` stability under horizontal
 * scroll, `Exceptions only` filtering, inline `NumberField` editing (`1..50` validation + recalculated `lineTotal`),
 * resolving the final exception into the empty state, reload reset semantics, `390x844` mobile layout + editing, and
 * released `dist/esm` consumer verification.
 */
test.describe('Order Review Desk workflow (Neural Link)', () => {
    test('completes the 100k order triage, deep jump, locked scroll, inline repair, empty state, and reload cycle on desktop', async ({page, neuralLink}) => {
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);

        await expect(page.locator(`${GRID} .neo-grid-cell[data-field="orderId"]`).first()).toBeVisible({timeout: 30000});
        const app = await neuralLink.connectToApp('Neo.examples.grid.orderReviewDesk');

        const [provider]   = await app.findInstances({ntype: 'state-provider'}, ['id']),
              providerId   = provider.id || provider.properties?.id,
              state        = await app.inspectStateProvider(providerId),
              providerData = state?.data || state?.result?.data || {};
        expect(providerData.totalOrders).toBe(100000);
        expect(providerData.exceptionCount).toBe(6);

        await expect(page.locator('.order-desk-exception-pill')).toHaveText('6 exceptions');
        await expect(page.locator('.order-desk-scope-footer')).toContainText('Session edits live in memory and reset on reload.');

        // 1. Blank Enter on a valid order keeps the required Quantity editor open; Escape preserves quantity, line total, and exception count
        const validRecId     = await recordIdOf(page, 'ORD-000001'),
              initialReceipt = await page.locator('.order-desk-receipt').textContent();
        await expect(cell(page, 'quantity', validRecId)).toHaveText('4');
        await expect(cell(page, 'lineTotal', validRecId)).toHaveText('$500.00');
        await expect(cell(page, 'exceptionReason', validRecId)).toHaveText('OK');

        await cell(page, 'quantity', validRecId).dblclick();
        await expect.poll(() => editingIn(page, 'quantity', validRecId)).toBe(true);
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Enter');
        await expect.poll(() => editingIn(page, 'quantity', validRecId), {message: 'blank quantity keeps required editor open'}).toBe(true);
        await expect(page.locator(EDITOR)).toContainText('Required');

        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(cell(page, 'quantity', validRecId)).toHaveText('4');
        await expect(cell(page, 'lineTotal', validRecId)).toHaveText('$500.00');
        await expect(cell(page, 'exceptionReason', validRecId)).toHaveText('OK');
        await expect(page.locator('.order-desk-exception-pill')).toHaveText('6 exceptions');
        await expect(page.locator('.order-desk-receipt')).toHaveText(initialReceipt);

        // 2. Deep jump to ORD-099985 keeps mounted DOM rows viewport-bounded while `orderId` + `Settlement` stay locked
        await page.getByRole('button', {name: 'Jump to ORD-099985'}).click();
        await expect(page.locator(`${GRID} .neo-grid-cell[data-field="orderId"]`).getByText('ORD-099985', {exact: true})).toBeVisible();

        await page.setViewportSize({width: 1024, height: 768});
        await expect.poll(() => page.evaluate(() => {
            const scroller = document.querySelector('.neo-grid-horizontal-scrollbar');
            return scroller ? scroller.scrollWidth - scroller.clientWidth : 0
        })).toBeGreaterThan(150);

        const deepMetrics = await page.evaluate(() => {
            const isVisibleRow = el => {
                const row = el.closest('.neo-grid-row');
                return Boolean(row && getComputedStyle(row).display !== 'none')
            };
            const orderCell = [...document.querySelectorAll('.neo-grid-cell[data-field="orderId"]')]
                .find(el => isVisibleRow(el) && el.textContent.trim() === 'ORD-099985');
            const recId     = orderCell.getAttribute('data-record-id');
            const totalCell = [...document.querySelectorAll(`.neo-grid-cell[data-field="lineTotal"][data-record-id="${recId}"]`)]
                .find(isVisibleRow);
            const totalDomRows  = document.querySelectorAll('.neo-grid-row').length;
            const scroller      = document.querySelector('.neo-grid-horizontal-scrollbar');
            const beforeLeft    = orderCell.getBoundingClientRect().left;
            const beforeEndLeft = totalCell.getBoundingClientRect().left;

            scroller.scrollLeft = 200;
            scroller.dispatchEvent(new Event('scroll'));

            return {
                actualScrollLeft: scroller.scrollLeft,
                afterEndLeft    : totalCell.getBoundingClientRect().left,
                afterLeft       : orderCell.getBoundingClientRect().left,
                beforeEndLeft,
                beforeLeft,
                totalDomRows
            }
        });
        expect(deepMetrics.totalDomRows).toBeLessThan(180);
        expect(deepMetrics.actualScrollLeft).toBe(200);
        expect(deepMetrics.afterLeft).toBe(deepMetrics.beforeLeft);
        expect(deepMetrics.afterEndLeft).toBe(deepMetrics.beforeEndLeft);

        await page.setViewportSize({width: 1440, height: 900});

        // 2. Filter to `Exceptions only (6)` and verify invalid input (> 50) is refused before committing a valid repair
        await page.getByRole('button', {name: 'Exceptions only (6)'}).click();
        await expect(page.locator('.order-desk-visible-count')).toHaveText('Showing 6 of 100,000');

        const firstRecId = await recordIdOf(page, 'ORD-000004');
        await cell(page, 'quantity', firstRecId).click();
        await page.keyboard.press('Enter');
        await expect.poll(() => editingIn(page, 'quantity', firstRecId)).toBe(true);

        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('99');
        await page.keyboard.press('Enter');
        await expect.poll(() => editingIn(page, 'quantity', firstRecId), {message: 'quantity > 50 keeps editor open'}).toBe(true);

        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('10');
        await page.keyboard.press('Enter');

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(page.locator('.order-desk-exception-pill')).toHaveText('5 exceptions');
        await expect(page.locator('.order-desk-receipt')).toContainText('ORD-000004 · Quantity 74 → 10 · Line total');
        await expect(page.locator('.order-desk-visible-count')).toHaveText('Showing 5 of 100,000');

        // 3. Resolve the remaining 5 exceptions down to the zero-exceptions empty state
        for (const orderId of ['ORD-000019', 'ORD-002450', 'ORD-025000', 'ORD-064000', 'ORD-099985']) {
            const recId = await recordIdOf(page, orderId);
            await cell(page, 'quantity', recId).dblclick();
            await expect.poll(() => editingIn(page, 'quantity', recId)).toBe(true);
            await page.keyboard.press('ControlOrMeta+a');
            await page.keyboard.type('4');
            await page.keyboard.press('Enter');
            await expect(page.locator(EDITOR)).toHaveCount(0)
        }

        await expect(page.locator('.order-desk-exception-pill')).toHaveText('0 exceptions · Clear');
        await expect(page.locator('.order-desk-empty-state')).toBeVisible();
        await expect(page.locator('.order-desk-empty-title')).toHaveText('All order exceptions resolved');

        // Return to All orders and verify repaired line total is visible on ORD-000004
        await page.getByRole('button', {name: 'Show all 100,000 orders'}).click();
        await expect(page.locator('.order-desk-visible-count')).toHaveText('Showing 100,000 of 100,000');
        const repairedId = await recordIdOf(page, 'ORD-000004');
        await expect(cell(page, 'quantity', repairedId)).toHaveText('10');
        await expect(cell(page, 'exceptionReason', repairedId)).toHaveText('OK');

        // 4. Reload resets in-memory session edits back to the 6 deterministic seeded exceptions
        await page.reload();
        await expect(page.locator('.order-desk-exception-pill')).toHaveText('6 exceptions', {timeout: 30000});
        expect(pageErrors).toEqual([])
    });

    test('adapts lock policy at 390x844 mobile width without horizontal page overflow and supports theme switching + inline repair', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 390, height: 844});
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);

        await expect(page.locator(`${GRID} .neo-grid-cell[data-field="orderId"]`).first()).toBeVisible({timeout: 30000});
        const app = await neuralLink.connectToApp('Neo.examples.grid.orderReviewDesk');

        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

        // Switch theme on mobile and verify viewport updates cleanly
        await page.getByRole('button', {name: 'Light theme'}).click();
        await expect(page.locator('.neo-viewport')).toHaveClass(/neo-theme-neo-light/);
        const [vp] = await app.queryComponent({className: 'Neo.examples.grid.orderReviewDesk.MainContainer'}, ['theme']);
        expect(vp?.properties?.theme ?? vp?.theme).toBe('neo-theme-neo-light');

        // Filter to exceptions, scroll horizontally on 390x844 keeping `orderId` pinned, and repair ORD-000004
        await page.getByRole('button', {name: 'Exceptions only (6)'}).click();
        const recId = await recordIdOf(page, 'ORD-000004');

        const mobileScrollCheck = await page.evaluate(() => {
            const orderCell = [...document.querySelectorAll('.neo-grid-cell[data-field="orderId"]')]
                .find(el => {
                    const row = el.closest('.neo-grid-row');
                    return row && getComputedStyle(row).display !== 'none' && el.textContent.trim() === 'ORD-000004'
                });
            const beforeLeft = orderCell.getBoundingClientRect().left;
            const scroller   = document.querySelector('.neo-grid-horizontal-scrollbar');
            scroller.scrollLeft = 340;
            scroller.dispatchEvent(new Event('scroll'));
            return {
                actualScrollLeft: scroller.scrollLeft,
                afterLeft       : orderCell.getBoundingClientRect().left,
                beforeLeft
            }
        });
        expect(mobileScrollCheck.actualScrollLeft).toBe(340);
        expect(mobileScrollCheck.afterLeft).toBe(mobileScrollCheck.beforeLeft);
        await expect(cell(page, 'quantity', recId)).toBeVisible();

        await cell(page, 'quantity', recId).dblclick();
        await expect.poll(() => editingIn(page, 'quantity', recId)).toBe(true);
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('12');
        await page.keyboard.press('Enter');
        await expect(page.locator('.order-desk-exception-pill')).toHaveText('5 exceptions');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    });

    test('validates the released dist/esm consumer build for both the Portal catalog card and the Order Review Desk app (#22233)', async ({page}) => {
        const distExampleConfig = path.join(REPO_ROOT, 'dist/esm/examples/grid/orderReviewDesk/neo-config.json');

        test.skip(
            Boolean(process.env.NEO_TEST_SKIP_CI) || !fs.existsSync(distExampleConfig),
            'Outside-CI check requiring local `npm run build-dist-esm` + `npm run build-themes -- -n -e esm -t all`'
        );

        await page.setViewportSize({width: 1440, height: 900});

        // 1. Released Portal consumer (`/dist/esm/apps/portal/examples/grid`) lists Order Review Desk and points to dist/esm
        await page.goto(DIST_PORTAL_GRID_URL);
        const card = page.locator('.portal-examples-group-page:visible .portal-examples-list .neo-list-item').filter({hasText: 'Order Review Desk'});
        await expect(card).toBeVisible({timeout: 30000});
        await expect(card).toContainText('100,000 local orders');

        // 2. Released example consumer (`/dist/esm/examples/grid/orderReviewDesk/index.html`) runs end-to-end
        await page.goto(`${DIST_EXAMPLE_URL}?theme=neo-theme-neo-dark`);
        await expect(page.locator('.order-desk-exception-pill')).toHaveText('6 exceptions', {timeout: 30000});

        const env = await page.evaluate(() => globalThis.Neo?.config?.environment);
        expect(env).toBe('dist/esm');

        await page.getByRole('button', {name: 'Exceptions only (6)'}).click();
        const recId = await recordIdOf(page, 'ORD-000004');
        await cell(page, 'quantity', recId).dblclick();
        await expect.poll(() => editingIn(page, 'quantity', recId)).toBe(true);
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('15');
        await page.keyboard.press('Enter');

        await expect(page.locator('.order-desk-exception-pill')).toHaveText('5 exceptions');
        await expect(page.locator('.order-desk-receipt')).toContainText('ORD-000004 · Quantity 74 → 15')
    })
});
